from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


DEFAULT_API_URL = "http://127.0.0.1:7433"
TIMEOUT_SECONDS = 0.2
REFINE_TIMEOUT_SECONDS = 5.0
WRAPPER_TIMEOUT_SECONDS = 75.0
MAX_CONTEXT_CHARS = 9500
# Reserve room for the Checks/Validation/Boundaries sections so a long or model-drafted
# refined_prompt cannot silently crowd them out of the final MAX_CONTEXT_CHARS truncation.
MAX_TASK_CHARS = 4000
# Users state scope constraints at the end of prompts ("No tests", "Briefly summarize"),
# so truncation keeps the tail instead of cutting it.
TRUNCATED_TASK_TAIL_CHARS = 400


def main() -> int:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw or "{}")
        session_id = ensure_session_id(str(payload.get("session_id") or payload.get("sessionId") or "unknown"))
        api_url = os.environ.get("AGENT_SIDECAR_API_URL", DEFAULT_API_URL).rstrip("/")
        ingest = post_json(f"{api_url}/sessions/{session_id}/events", payload, timeout=TIMEOUT_SECONDS)
        steering = steering_context_output(payload, ingest)
        if steering:
            sys.stdout.write(json.dumps(steering, separators=(",", ":")))
            return 0
        budget_status = ensure_budget_status(session_id, api_url)
        guard = budget_guard_output(budget_status)
        if guard:
            sys.stdout.write(json.dumps(guard, separators=(",", ":")))
            return 0
        if truthy_env("AGENT_SIDECAR_KIMI_WRAPPER"):
            output = kimi_wrapper_output(payload, session_id, api_url, budget_status=budget_status)
        else:
            output = prompt_refinement_output(payload, session_id, api_url, budget_status=budget_status)
        if output:
            sys.stdout.write(json.dumps(output, separators=(",", ":")))
    except (OSError, ValueError, urllib.error.URLError, TimeoutError):
        pass
    return 0


def post_json(url: str, payload: dict, *, timeout: float) -> dict | None:
    return request_json(url, payload=payload, timeout=timeout)


def request_json(url: str, payload: dict | None = None, *, timeout: float, method: str | None = None) -> dict | None:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"content-type": "application/json"},
        method=method or ("POST" if payload is not None else "GET"),
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read()
    if not body:
        return None
    try:
        parsed = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    return parsed if isinstance(parsed, dict) else None


def ensure_budget_status(session_id: str, api_url: str) -> dict | None:
    try:
        status = post_json(f"{api_url}/sessions/{session_id}/budget/check", {}, timeout=TIMEOUT_SECONDS)
    except (OSError, urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError):
        return budget_block_status("Agent Sidecar budget check failed.") if truthy_env("AGENT_SIDECAR_REQUIRE_BUDGET") else None
    if status and status.get("configured") is True:
        return status

    budget_body = budget_request_body()
    if not budget_body:
        return budget_block_status("Agent Sidecar requires a cost budget, but no baseline or budget was supplied.") if truthy_env("AGENT_SIDECAR_REQUIRE_BUDGET") else status
    try:
        configured = post_json(f"{api_url}/sessions/{session_id}/budget", budget_body, timeout=TIMEOUT_SECONDS)
    except (OSError, urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError):
        return budget_block_status("Agent Sidecar requires a cost budget, but budget configuration failed.") if truthy_env("AGENT_SIDECAR_REQUIRE_BUDGET") else status
    return configured if isinstance(configured, dict) else status


def budget_request_body() -> dict:
    body: dict[str, object] = {}
    baseline_session = os.environ.get("AGENT_SIDECAR_BASELINE_SESSION", "").strip()
    if baseline_session:
        body["baseline_session_id"] = baseline_session
    budget_usd = os.environ.get("AGENT_SIDECAR_BUDGET_USD", "").strip()
    if budget_usd:
        body["budget_usd"] = budget_usd
    baseline_cost_usd = os.environ.get("AGENT_SIDECAR_BASELINE_COST_USD", "").strip()
    if baseline_cost_usd:
        body["baseline_cost_usd"] = baseline_cost_usd
    target_savings = os.environ.get("AGENT_SIDECAR_TARGET_SAVINGS_PCT", "").strip()
    if target_savings:
        body["target_savings_pct"] = target_savings
    warning_threshold = os.environ.get("AGENT_SIDECAR_BUDGET_WARNING_THRESHOLD_PCT", "").strip()
    if warning_threshold:
        body["warning_threshold_pct"] = warning_threshold
    enforcement = os.environ.get("AGENT_SIDECAR_BUDGET_ENFORCEMENT", "").strip()
    if enforcement:
        body["enforcement"] = enforcement
    return body if ("baseline_session_id" in body or "baseline_cost_usd" in body or "budget_usd" in body) else {}


def budget_guard_output(status: dict | None) -> dict | None:
    if not status:
        return None
    if str(status.get("action") or "allow") != "block":
        return None
    if status.get("configured") is not True:
        return block_output(str(status.get("reason") or "Agent Sidecar cost budget is required but unavailable."))
    return block_output(
        "Agent Sidecar cost budget exceeded. "
        f"Current ${float(status.get('current_cost_usd') or 0.0):.6f} is at/above "
        f"budget ${float(status.get('budget_usd') or 0.0):.6f}; finish or stop instead of spending more."
    )


def budget_block_status(reason: str) -> dict:
    return {
        "configured": False,
        "action": "block",
        "reason": reason,
        "current_cost_usd": 0.0,
        "budget_usd": 0.0,
        "remaining_usd": 0.0,
    }


def steering_context_output(payload: dict, ingest: dict | None) -> dict | None:
    if hook_name(payload) != "PostToolUse":
        return None
    if not isinstance(ingest, dict):
        return None
    measurement = ingest.get("measurement")
    if not isinstance(measurement, dict):
        return None
    context = measurement.get("steering_context")
    if not isinstance(context, str) or not context.strip():
        return None
    return {
        "suppressOutput": True,
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": context[:MAX_CONTEXT_CHARS],
        },
    }


def prompt_refinement_output(payload: dict, session_id: str, api_url: str, *, budget_status: dict | None = None) -> dict | None:
    if hook_name(payload) != "UserPromptSubmit":
        return None
    prompt = str(payload.get("prompt") or payload.get("user_prompt") or payload.get("userPrompt") or "").strip()
    if not prompt:
        return None
    if os.environ.get("AGENT_SIDECAR_PROMPT_INTERCEPT", "1").lower() in {"0", "false", "off", "no"}:
        return None
    timeout = float(os.environ.get("AGENT_SIDECAR_REFINE_TIMEOUT_SECONDS", REFINE_TIMEOUT_SECONDS))
    require_ensemble = truthy_env("AGENT_SIDECAR_REQUIRE_ENSEMBLE")
    require_reasoning = truthy_env("AGENT_SIDECAR_REQUIRE_DEEPSEEK_REFINEMENT")
    require_coding = (
        truthy_env("AGENT_SIDECAR_REQUIRE_CODING_REFINEMENT")
        or truthy_env("AGENT_SIDECAR_REQUIRE_DEEPSEEK_CODING")
        or truthy_env("AGENT_SIDECAR_REQUIRE_KIMI_CODING")
    )
    allow_fallback = truthy_env("AGENT_SIDECAR_ALLOW_REFINEMENT_FALLBACK")
    fallback_refinement = False
    request_body = {"session_id": session_id, "prompt": prompt, "record_prompt_submitted": False}
    if require_ensemble:
        request_body["require_model_ensemble"] = True
    if require_reasoning:
        request_body["require_reasoning_refinement"] = True
    if require_coding:
        request_body["require_coding_refinement"] = True
    try:
        result = post_json(f"{api_url}/refine", request_body, timeout=timeout)
    except urllib.error.HTTPError as error:
        if allow_fallback and (require_ensemble or require_reasoning or require_coding):
            fallback_refinement = True
            try:
                result = post_json(f"{api_url}/refine", {"session_id": session_id, "prompt": prompt, "record_prompt_submitted": False}, timeout=timeout)
            except urllib.error.HTTPError:
                result = None
            if result and isinstance(result.get("refined_prompt"), str):
                pass
            else:
                return block_output(f"Agent Sidecar model refinement failed and deterministic fallback failed: {http_error_detail(error)}")
        else:
            result = None
        if require_ensemble or require_reasoning or require_coding:
            if fallback_refinement:
                pass
            else:
                if require_ensemble:
                    required = "model ensemble"
                elif require_reasoning and require_coding:
                    required = "DeepSeek prompt and coding-model"
                elif require_reasoning:
                    required = "DeepSeek prompt"
                else:
                    required = "coding-model"
                return block_output(f"Agent Sidecar requires {required} refinement, but /refine failed: {http_error_detail(error)}")
        elif not fallback_refinement:
            raise
    if not result or not isinstance(result.get("refined_prompt"), str):
        return None
    if not fallback_refinement:
        if require_ensemble and result.get("source") != "ensemble":
            return block_output(f"Agent Sidecar requires model ensemble refinement, but /refine returned source={result.get('source')!r}.")
        if require_reasoning and require_coding and result.get("source") != "reasoning-then-coding":
            return block_output(f"Agent Sidecar requires DeepSeek prompt plus coding-model refinement, but /refine returned source={result.get('source')!r}.")
        if require_reasoning and not require_coding and result.get("source") != "reasoning-only":
            return block_output(f"Agent Sidecar requires DeepSeek prompt refinement, but /refine returned source={result.get('source')!r}.")
        if require_coding and result.get("source") not in {"deterministic-then-coding", "reasoning-then-coding", "ensemble", "coding-only"}:
            return block_output(f"Agent Sidecar requires coding-model refinement, but /refine returned source={result.get('source')!r}.")
    context = format_refinement_context(result, budget_status=budget_status, prompt=prompt)
    if not context:
        return None
    return {
        "suppressOutput": True,
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": context[:MAX_CONTEXT_CHARS],
        },
    }


def kimi_wrapper_output(payload: dict, session_id: str, api_url: str, *, budget_status: dict | None = None) -> dict | None:
    if hook_name(payload) != "UserPromptSubmit":
        return None
    prompt = str(payload.get("prompt") or payload.get("user_prompt") or payload.get("userPrompt") or "").strip()
    if not prompt:
        return None
    if os.environ.get("AGENT_SIDECAR_PROMPT_INTERCEPT", "1").lower() in {"0", "false", "off", "no"}:
        return None
    timeout = float(os.environ.get("AGENT_SIDECAR_WRAPPER_TIMEOUT_SECONDS", WRAPPER_TIMEOUT_SECONDS))
    request_body = {"session_id": session_id, "prompt": prompt, "record_prompt_submitted": False}
    try:
        result = post_json(f"{api_url}/wrap", request_body, timeout=timeout)
    except urllib.error.HTTPError as error:
        return block_output(f"Agent Sidecar coding wrapper failed: {http_error_detail(error)}")
    if not result or not isinstance(result.get("display_response"), str):
        return block_output("Agent Sidecar coding wrapper failed: /wrap did not return a display response.")
    return wrapper_delivery_output(result, budget_status=budget_status)


def wrapper_delivery_output(result: dict, *, budget_status: dict | None = None) -> dict:
    text = format_wrapper_display(result, budget_status=budget_status)
    delivery = os.environ.get("AGENT_SIDECAR_KIMI_WRAPPER_DELIVERY", "block").lower()
    if delivery in {"context", "additional_context", "additional-context"}:
        return {
            "suppressOutput": True,
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit",
                "additionalContext": text[:MAX_CONTEXT_CHARS],
            },
        }
    return block_output(text, limit=MAX_CONTEXT_CHARS)


def truthy_env(name: str) -> bool:
    return os.environ.get(name, "").lower() in {"1", "true", "yes", "on"}


def http_error_detail(error: urllib.error.HTTPError) -> str:
    try:
        body = error.read().decode("utf-8")
    except (OSError, UnicodeDecodeError):
        body = ""
    if body:
        try:
            parsed = json.loads(body)
            detail = parsed.get("detail") if isinstance(parsed, dict) else None
            if isinstance(detail, str) and detail:
                return detail
        except json.JSONDecodeError:
            return body[:500]
    return f"HTTP {error.code}"


def block_output(reason: str, *, limit: int = 2000) -> dict:
    return {"decision": "block", "continue": False, "reason": reason[:limit]}


def format_wrapper_display(result: dict, *, budget_status: dict | None = None) -> str:
    display = str(result.get("display_response") or "").strip()
    summary = str(result.get("implementation_summary") or "").strip()
    validation = str(result.get("validation_performed") or "").strip()
    refinement_source = str(result.get("refinement_source") or "unknown")
    files = result.get("files_changed") if isinstance(result.get("files_changed"), list) else []
    lines = [
        "Agent Sidecar coding wrapper result.",
        f"Refinement source: {refinement_source}.",
    ]
    budget_context = format_budget_context(budget_status)
    if budget_context:
        lines.extend(["Cost guard:", budget_context])
    if summary:
        lines.extend(["Implementation summary:", summary])
    if files:
        lines.append("Files changed or proposed:")
        lines.extend(f"- {item}" for item in files if isinstance(item, str))
    if validation:
        lines.extend(["Validation:", validation])
    if result.get("needs_claude_execution") is True:
        lines.append("Kimi marked this result as requiring Claude Code tool execution or user-applied edits.")
    if display:
        lines.extend(["", display])
    return "\n".join(lines)


def format_refinement_context(result: dict, *, budget_status: dict | None = None, prompt: str = "") -> str:
    refined = str(result.get("refined_prompt") or "").strip()
    if not refined:
        return ""
    if len(refined) > MAX_TASK_CHARS:
        head = refined[: MAX_TASK_CHARS - TRUNCATED_TASK_TAIL_CHARS - 5].rstrip()
        tail = refined[-TRUNCATED_TASK_TAIL_CHARS:].lstrip()
        refined = f"{head} ... {tail}"
    # Claude already has the user's prompt; re-echoing it verbatim only buys cache-creation
    # tokens. Drop the Task block when it adds nothing beyond the prompt itself.
    if is_prompt_echo(refined, prompt):
        refined = ""
    acceptance = result.get("acceptance_criteria") if isinstance(result.get("acceptance_criteria"), list) else []
    do_not_change = result.get("do_not_change") if isinstance(result.get("do_not_change"), list) else []
    testing = str(result.get("testing_expectations") or "").strip()
    source = str(result.get("source") or "unknown")
    lines = [
        "Sidecar task contract.",
        f"Source: {source}.",
    ]
    budget_context = format_budget_context(budget_status)
    if budget_context:
        lines.extend(["Cost guard:", budget_context])
    if refined:
        if refined.lower().startswith("task:"):
            lines.append(refined)
        else:
            lines.extend(["Task:", refined])
    if acceptance:
        lines.append("Checks:")
        lines.extend(f"- {item}" for item in acceptance if isinstance(item, str))
    if testing:
        lines.extend(["Validation:", testing])
    if do_not_change:
        lines.append("Boundaries:")
        lines.extend(f"- Do not change {item}" for item in do_not_change if isinstance(item, str))
    return "\n".join(lines)


def is_prompt_echo(refined: str, prompt: str) -> bool:
    compact_prompt = " ".join(prompt.split())
    if not compact_prompt:
        return False
    body = refined[5:].strip() if refined.lower().startswith("task:") else refined
    if body == compact_prompt:
        return True
    head, sep, tail = body.partition(" ... ")
    return bool(sep) and compact_prompt.startswith(head) and compact_prompt.endswith(tail)


def format_budget_context(status: dict | None) -> str:
    if not status or status.get("configured") is not True:
        return ""
    budget = float(status.get("budget_usd") or 0.0)
    baseline = float(status.get("baseline_cost_usd") or 0.0)
    current = float(status.get("current_cost_usd") or 0.0)
    remaining = float(status.get("remaining_usd") or 0.0)
    target = float(status.get("target_savings_pct") or 0.0)
    action = str(status.get("action") or "allow")
    return (
        f"Stay under ${budget:.6f} for this run (baseline ${baseline:.6f}, target savings {target:.1f}%). "
        f"Current measured spend is ${current:.6f}; remaining budget is ${remaining:.6f}. "
        f"Guard status: {action}. Prefer direct edits, minimal exploration, and concise validation."
    )


def hook_name(payload: dict) -> str:
    for key in ("hook_event_name", "event_name", "event", "type"):
        value = payload.get(key)
        if isinstance(value, str):
            return value
    return ""


def ensure_session_id(value: str) -> str:
    stripped = value.strip()
    return stripped if stripped.startswith("cc-") else f"cc-{stripped or 'unknown'}"


if __name__ == "__main__":
    raise SystemExit(main())
