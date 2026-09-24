"""Seed the demo daemon with realistic sessions so the pilot dashboard lights up.

Talks to a running daemon over HTTP (never touches the real repo's sessions when
pointed at the isolated demo workspace). Guarantees both measurement arms by
importing `assigned_arm` and bucketing session ids, and produces non-zero savings
by emitting `steering_recommendation` events carrying an avoided-waste estimate.

Usage: python scripts/demo_seed.py --api-url http://127.0.0.1:7455 --control-fraction 0.34
"""
from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.request

from agent_sidecar.intel.measurement import assigned_arm
from agent_sidecar.schema.config import SidecarConfig

ASSIST_PROMPTS = [
    "fix the failing auth test",
    "make the dashboard load faster",
    "add pagination to the results table",
    "the login flow is broken, fix it",
    "refactor the billing module and add tests",
    "improve error handling in the API client",
]
CONTROL_PROMPTS = [
    "update the user settings page",
    "add a dark mode toggle",
    "clean up the logging",
]


def _post(url: str, payload: dict) -> None:
    request = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"), headers={"content-type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        response.read()


def _event(event_type: str, payload: dict) -> dict:
    # The daemon treats a body as a structured event only when it has BOTH
    # event_type and metadata; otherwise it runs it through the hook adapter.
    return {"event_type": event_type, "source": "otlp", "payload": payload, "metadata": {"repo_path": "demo"}}


def _cost(model: str, inp: int, out: int, cache_read: int, cost_usd: float) -> dict:
    return _event(
        "cost_estimate_updated",
        {
            "precision": "measured",
            "cost_usd": cost_usd,
            "gen_ai.request.model": model,
            "gen_ai.usage.input_tokens": inp,
            "gen_ai.usage.output_tokens": out,
            "gen_ai.usage.cache_read_tokens": cache_read,
        },
    )


def _steering(avoided_iterations: float) -> dict:
    return _event(
        "steering_recommendation",
        {
            "decision": "warn",
            "recommendation": "Stop rerunning the failing command; fix the assertion first.",
            "evidence_event_ids": [],
            "confidence": 0.86,
            "estimated_avoided_waste": {
                "iterations": avoided_iterations,
                "cost_usd": 0.0,
                "precision": "approximate",
                "basis": "k-calibration",
            },
        },
    )


def seed_assist(api_url: str, session_id: str, prompt: str, index: int) -> None:
    out = 4000 + index * 220
    cost = round(0.22 + index * 0.02, 4)
    events = [
        _event("session_started", {"hook_event_name": "SessionStart"}),
        _event("prompt_submitted", {"prompt": prompt}),
        _event("prompt_refined", {"refined_prompt": f"Task: {prompt}", "source": "deterministic-then-coding", "quality": "medium"}),
        _event("agent_tool_observed", {"tool_name": "Read"}),
        _event("file_edit_observed", {"path": "src/app/handler.py"}),
        _event("test_run_observed", {"command": "pytest -q", "normalized_command": "pytest"}),
        _event("test_failure_observed", {"command": "pytest -q", "normalized_command": "pytest", "failure_signature": "assert_eq"}),
        _steering(2.0),
        _cost("claude-opus-5", 6, out, 60000 + index * 1500, cost),
    ]
    for event in events:
        _post(f"{api_url}/sessions/{session_id}/events", event)
    _post(f"{api_url}/sessions/{session_id}/stop", {})


def seed_control(api_url: str, session_id: str, prompt: str, index: int) -> None:
    # Control arm gets no steering — more iterations, higher spend: the waste we prevent.
    out = 5200 + index * 300
    cost = round(0.31 + index * 0.03, 4)
    events = [
        _event("session_started", {"hook_event_name": "SessionStart"}),
        _event("prompt_submitted", {"prompt": prompt}),
        _event("shadow_detection", {"evaluator_id": "failed_test_loop", "evidence_event_ids": []}),
        _event("agent_tool_observed", {"tool_name": "Bash"}),
        _event("test_run_observed", {"command": "pytest -q", "normalized_command": "pytest"}),
        _event("test_failure_observed", {"command": "pytest -q", "normalized_command": "pytest", "failure_signature": "assert_eq"}),
        _event("test_run_observed", {"command": "pytest -q", "normalized_command": "pytest"}),
        _cost("claude-opus-5", 8, out, 78000 + index * 2000, cost),
    ]
    for event in events:
        _post(f"{api_url}/sessions/{session_id}/events", event)
    _post(f"{api_url}/sessions/{session_id}/stop", {})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url", required=True)
    parser.add_argument("--control-fraction", type=float, default=0.34)
    args = parser.parse_args()

    config = SidecarConfig()
    config.measurement.control_fraction = args.control_fraction

    # Bucket candidate ids by the same deterministic hash the daemon uses, so we
    # reliably fill both arms regardless of the fraction.
    assist_ids: list[str] = []
    control_ids: list[str] = []
    n = 0
    while (len(assist_ids) < len(ASSIST_PROMPTS) or len(control_ids) < len(CONTROL_PROMPTS)) and n < 500:
        sid = f"cc-demo-{n:04d}"
        if assigned_arm(sid, config) == "assist" and len(assist_ids) < len(ASSIST_PROMPTS):
            assist_ids.append(sid)
        elif assigned_arm(sid, config) == "control" and len(control_ids) < len(CONTROL_PROMPTS):
            control_ids.append(sid)
        n += 1

    for index, (sid, prompt) in enumerate(zip(assist_ids, ASSIST_PROMPTS)):
        seed_assist(args.api_url, sid, prompt, index)
    for index, (sid, prompt) in enumerate(zip(control_ids, CONTROL_PROMPTS)):
        seed_control(args.api_url, sid, prompt, index)

    print(f"Seeded {len(assist_ids)} assist + {len(control_ids)} control sessions into {args.api_url}.")


if __name__ == "__main__":
    main()
