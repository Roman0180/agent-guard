from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from agent_sidecar.gateway.traces import PolicyDecision, TraceUsage
from agent_sidecar.intel.cost import price_tokens, token_estimate
from agent_sidecar.schema.config import GatewayPoliciesConfig, SidecarConfig


@dataclass
class PolicyOutcome:
    decisions: list[PolicyDecision] = field(default_factory=list)
    # Request payload with enforced modifications applied, or None when unchanged.
    modified_request: dict[str, Any] | None = None
    # Synthetic response that should be returned instead of forwarding, or None.
    block_response: dict[str, Any] | None = None


def evaluate_request_policies(
    request: dict[str, Any] | None,
    *,
    retry_count: int,
    policies: GatewayPoliciesConfig,
) -> PolicyOutcome:
    """Evaluate optimization policies before forwarding a request.

    Shadow mode records what would have happened and passes the request through
    unmodified; enforce mode applies the change. Every policy defaults to shadow.
    """
    outcome = PolicyOutcome()
    if not isinstance(request, dict):
        return outcome
    _apply_retry_suppression(request, retry_count, policies, outcome)
    _apply_token_caps(request, policies, outcome)
    _apply_context_compaction(request, policies, outcome)
    return outcome


def _apply_retry_suppression(request: dict[str, Any], retry_count: int, policies: GatewayPoliciesConfig, outcome: PolicyOutcome) -> None:
    policy = policies.retry_suppression
    if retry_count <= policy.max_retries:
        return
    enforced = policy.mode == "enforce"
    outcome.decisions.append(
        PolicyDecision(
            policy="retry_suppression",
            mode=policy.mode,
            action="suppress_retry" if enforced else "would_suppress_retry",
            reason=f"retry {retry_count} of the same normalized request exceeds max_retries={policy.max_retries}",
            enforced=enforced,
        )
    )
    if enforced:
        outcome.block_response = {
            "error": {
                "type": "sidecar_retry_suppressed",
                "message": (
                    f"Agent Sidecar suppressed retry {retry_count} of an identical request "
                    f"(max_retries={policy.max_retries}). Change the request or stop retrying."
                ),
            }
        }


def _apply_token_caps(request: dict[str, Any], policies: GatewayPoliciesConfig, outcome: PolicyOutcome) -> None:
    policy = policies.token_caps
    requested = _requested_max_tokens(request)
    if requested is None or requested <= policy.max_output_tokens:
        return
    enforced = policy.mode == "enforce"
    outcome.decisions.append(
        PolicyDecision(
            policy="token_caps",
            mode=policy.mode,
            action="cap_output_tokens" if enforced else "would_cap_output_tokens",
            reason=f"requested max output tokens {requested} exceeds cap {policy.max_output_tokens}",
            enforced=enforced,
            estimated_saved_tokens=requested - policy.max_output_tokens,
        )
    )
    if enforced:
        modified = dict(outcome.modified_request or request)
        if "max_tokens" in modified:
            modified["max_tokens"] = policy.max_output_tokens
        options = modified.get("options")
        if isinstance(options, dict) and "num_predict" in options:
            modified["options"] = {**options, "num_predict": policy.max_output_tokens}
        outcome.modified_request = modified


def _apply_context_compaction(request: dict[str, Any], policies: GatewayPoliciesConfig, outcome: PolicyOutcome) -> None:
    policy = policies.context_compaction
    estimated_context = token_estimate(json.dumps(request.get("messages") or request.get("prompt") or "", default=str))
    if estimated_context <= policy.context_token_threshold:
        return
    # Actual compaction is a later milestone; both modes log-only for now.
    outcome.decisions.append(
        PolicyDecision(
            policy="context_compaction",
            mode=policy.mode,
            action="would_compact_context",
            reason=(
                f"estimated context {estimated_context} tokens exceeds threshold "
                f"{policy.context_token_threshold}; compaction enforcement not yet implemented"
            ),
            enforced=False,
            estimated_saved_tokens=estimated_context - policy.context_token_threshold,
        )
    )


def finalize_decisions(
    decisions: list[PolicyDecision],
    *,
    usage: TraceUsage,
    model: str | None,
    config: SidecarConfig,
    repo_path: Path,
) -> list[PolicyDecision]:
    """Fill in savings estimates that need the completed response.

    A suppressed retry saves the whole call, so its estimate is the call's actual
    token usage. All estimates are then priced with the session price map.
    """
    finalized: list[PolicyDecision] = []
    for decision in decisions:
        updated = decision
        if decision.policy == "retry_suppression" and decision.estimated_saved_tokens == 0:
            updated = decision.model_copy(update={"estimated_saved_tokens": usage.input + usage.output})
        if updated.estimated_saved_tokens and not updated.estimated_saved_usd:
            priced = price_tokens(model, 0, updated.estimated_saved_tokens, 0, config, repo_path)
            updated = updated.model_copy(update={"estimated_saved_usd": round(priced.value, 6)})
        finalized.append(updated)
    return finalized


def _requested_max_tokens(request: dict[str, Any]) -> int | None:
    value = request.get("max_tokens")
    if value is None:
        options = request.get("options")
        if isinstance(options, dict):
            value = options.get("num_predict")
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None
