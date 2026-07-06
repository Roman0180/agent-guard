from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from agent_sidecar.daemon.app import create_app, get_manager
from agent_sidecar.schema.model_io import KimiWrapperResult, ModelRole


def test_hook_sequence_posts_to_api_and_writes_trace(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("AGENT_SIDECAR_REPO_PATH", str(tmp_path))
    get_manager.cache_clear()
    app = create_app()
    fixtures = [
        "session_start.json",
        "user_prompt_submit.json",
        "post_tool_use_edit.json",
        "post_tool_use_failed_test.json",
        "stop.json",
    ]

    with TestClient(app) as client:
        for name in fixtures:
            payload = json.loads((Path("evals/fixtures/hooks") / name).read_text(encoding="utf-8"))
            response = client.post("/sessions/fixture-session/events", json=payload)
            assert response.status_code == 200

        trace = client.get("/sessions/fixture-session/trace")
        status = client.get("/status").json()

    assert trace.status_code == 200
    event_types = [json.loads(line)["event_type"] for line in trace.text.splitlines()]
    assert event_types == [
        "session_started",
        "prompt_submitted",
        "agent_tool_observed",
        "file_edit_observed",
        "agent_tool_observed",
        "test_run_observed",
        "test_failure_observed",
        "turn_completed",
    ]
    assert status["active_session"]["observation"]["hooks"] is True


def test_otlp_endpoint_updates_measured_cost_status(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("AGENT_SIDECAR_REPO_PATH", str(tmp_path))
    get_manager.cache_clear()
    app = create_app()
    payload = json.loads(Path("evals/fixtures/otlp/cost_metrics.json").read_text(encoding="utf-8"))

    with TestClient(app) as client:
        response = client.post("/v1/metrics", json=payload)
        status = client.get("/sessions/fixture-session").json()

    assert response.status_code == 200
    assert response.json()["accepted"] == 1
    assert status["tokens"]["input"] == 1820
    assert status["cost_usd"]["precision"] == "measured"


def test_manual_session_create_and_stop(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("AGENT_SIDECAR_REPO_PATH", str(tmp_path))
    get_manager.cache_clear()
    app = create_app()

    with TestClient(app) as client:
        created = client.post("/sessions", json={"session_id": "manual-demo", "repo_path": str(tmp_path)})
        stopped = client.post("/sessions/manual-demo/stop")

    assert created.status_code == 200
    assert stopped.status_code == 200
    assert stopped.json()["status"] == "stopped"


def test_chunk2_routes_refine_steer_cost_and_models(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("AGENT_SIDECAR_REPO_PATH", str(tmp_path))
    get_manager.cache_clear()
    app = create_app()
    trace_lines = Path("evals/fixtures/traces/auth-refresh-loop.jsonl").read_text(encoding="utf-8").splitlines()

    with TestClient(app) as client:
        for line in trace_lines:
            response = client.post("/sessions/auth-refresh-loop/events", json=json.loads(line))
            assert response.status_code == 200

        refine = client.post("/refine", json={"session_id": "auth-refresh-loop", "prompt": "make the app better"})
        refine_no_prompt = client.post("/refine", json={"session_id": "auth-refresh-loop", "prompt": "fix auth refresh", "record_prompt_submitted": False})
        steer = client.post("/sessions/auth-refresh-loop/steer")
        cost = client.get("/sessions/auth-refresh-loop/cost")
        models = client.get("/models")
        recommendations = client.get("/sessions/auth-refresh-loop/recommendations")

    assert refine.status_code == 200
    assert refine.json()["source"] == "deterministic"
    assert refine_no_prompt.status_code == 200
    assert steer.status_code == 200
    assert steer.json()["result"]["decision"] == "warn"
    assert cost.status_code == 200
    assert cost.json()["cost_usd"]["precision"] == "measured"
    assert cost.json()["price_map"]["attribution"]
    assert models.status_code == 200
    assert {row["role"] for row in models.json()["roles"]} == {"reasoning", "coding"}
    assert recommendations.status_code == 200
    assert recommendations.json()


def test_wrap_route_runs_kimi_wrapper_and_records_trace(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("AGENT_SIDECAR_REPO_PATH", str(tmp_path))
    get_manager.cache_clear()

    class FakeProvider:
        def __init__(self, *_args, **_kwargs) -> None:
            pass

        def complete_json(self, role, _task, _prompt, schema, timeout_ms=None):
            if role == ModelRole.coding and schema is KimiWrapperResult:
                return KimiWrapperResult(
                    display_response="Kimi wrapper display response.",
                    implementation_summary="Kimi handled the refined prompt.",
                    files_changed=[],
                    validation_performed="Not run in offline test.",
                    needs_claude_execution=True,
                )
            return None

        def health(self) -> dict:
            return {}

    monkeypatch.setattr("agent_sidecar.daemon.api.LiteLLMModelProvider", FakeProvider)
    app = create_app()

    with TestClient(app) as client:
        response = client.post("/wrap", json={"session_id": "wrapper-demo", "prompt": "fix auth refresh"})
        trace = client.get("/sessions/wrapper-demo/trace")

    assert response.status_code == 200
    assert response.json()["display_response"] == "Kimi wrapper display response."
    assert response.json()["refinement_source"] == "deterministic"
    assert "kimi_wrapper_completed" in trace.text


def test_budget_routes_configure_and_block_when_measured_cost_exceeds_limit(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("AGENT_SIDECAR_REPO_PATH", str(tmp_path))
    get_manager.cache_clear()
    app = create_app()

    def cost_event(cost: float) -> dict:
        return {
            "event_type": "cost_estimate_updated",
            "source": "otlp",
            "payload": {
                "precision": "measured",
                "cost_usd": cost,
                "gen_ai.request.model": "claude-sonnet-4",
                "gen_ai.usage.input_tokens": 100,
                "gen_ai.usage.output_tokens": 20,
                "gen_ai.usage.cache_read_tokens": 0,
            },
            "metadata": {"repo_path": str(tmp_path)},
        }

    with TestClient(app) as client:
        baseline_cost = client.post("/sessions/baseline/events", json=cost_event(0.02))
        configured = client.post("/sessions/sidecar/budget", json={"baseline_session_id": "cc-baseline", "target_savings_pct": 10})
        initial_check = client.post("/sessions/sidecar/budget/check")
        sidecar_cost = client.post("/sessions/sidecar/events", json=cost_event(0.019))
        over_budget = client.post("/sessions/sidecar/budget/check")
        trace = client.get("/sessions/sidecar/trace")

    assert baseline_cost.status_code == 200
    assert configured.status_code == 200
    assert configured.json()["budget_usd"] == 0.018
    assert initial_check.json()["action"] == "allow"
    assert sidecar_cost.status_code == 200
    assert over_budget.status_code == 200
    assert over_budget.json()["action"] == "block"
    assert "budget_guard_triggered" in trace.text
