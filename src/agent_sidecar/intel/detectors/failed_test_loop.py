from __future__ import annotations

from collections import defaultdict

from agent_sidecar.schema.events import SidecarEvent
from agent_sidecar.schema.model_io import EvaluatorFinding, WasteEstimate
from agent_sidecar.schema.session import Precision


def detect(events: list[SidecarEvent]) -> list[EvaluatorFinding]:
    failures: dict[str, list[SidecarEvent]] = defaultdict(list)
    for event in events:
        if event.event_type != "test_failure_observed":
            continue
        signature = str(event.payload.get("failure_signature") or "").strip()
        if signature:
            failures[signature].append(event)

    findings: list[EvaluatorFinding] = []
    for signature, matches in failures.items():
        if len(matches) < 2:
            continue
        findings.append(
            EvaluatorFinding(
                evaluator_id="failed_test_loop",
                severity="warn",
                confidence=0.9,
                evidence_event_ids=[event.event_id for event in matches[-3:]],
                summary=f"same test failure repeated {len(matches)} times: {signature}",
                recommendation="Inspect the assertion and the edited auth path before rerunning the test.",
                estimated_waste=WasteEstimate(repeated_actions=len(matches) - 1, cost_usd=None, precision=Precision.approximate),
            )
        )
    return findings
