from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from agent_sidecar.daemon.app import create_app, get_manager
from agent_sidecar.schema.config import SidecarConfig
from agent_sidecar.schema.model_io import KimiWrapperResult, ModelRole


def _write_unreachable_model_endpoints_config(repo_path: Path) -> None:
    # Route both roles at loopback ports nothing listens on so this test's steering/refine
    # assertions reflect the deterministic fallback deterministically, regardless of whether
    # the machine running the test happens to have a real Ollama/llama-server instance up
    # with a model matching the configured default (D7: tests must not depend on the host).
    config = SidecarConfig()
    config.models.endpoints["ollama"].api_base = "http://127.0.0.1:1"
    config.models.endpoints["llama_server"].api_base = "http://127.0.0.1:1"
    config_dir = repo_path / ".agent-sidecar"
    config_dir.mkdir(parents=True, exist_ok=True)
    (config_dir / "config.json").write_text(config.model_dump_json(indent=2), encoding="utf-8")


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


def test_cost_endpoint_aggregates_api_requests_and_ignores_zero_rollups(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("AGENT_SIDECAR_REPO_PATH", str(tmp_path))
    get_manager.cache_clear()
    app = create_app()

    api_request_event = {
        "event_type": "cost_estimate_updated",
        "source": "otlp",
        "payload": {
            "precision": "measured",
            "cost_usd": 0.03,
            "gen_ai.request.model": "claude-opus-4-8",
            "gen_ai.usage.input_tokens": 30,
            "gen_ai.usage.output_tokens": 5,
            "gen_ai.usage.cache_read_tokens": 100,
            "raw_otel": {
                "resourceLogs": [{
                    "scopeLogs": [{
                        "logRecords": [{
                            "body": {"stringValue": "claude_code.api_request"},
                            "attributes": [
                                {"key": "request_id", "value": {"stringValue": "req-test"}},
                                {"key": "model", "value": {"stringValue": "claude-opus-4-8"}},
                                {"key": "query_source", "value": {"stringValue": "sdk"}},
                                {"key": "input_tokens", "value": {"intValue": "30"}},
                                {"key": "output_tokens", "value": {"intValue": "5"}},
                                {"key": "cache_read_tokens", "value": {"intValue": "100"}},
                                {"key": "cache_creation_tokens", "value": {"intValue": "7"}},
                                {"key": "cost_usd", "value": {"doubleValue": 0.03}},
                            ],
                        }],
                    }],
                }],
            },
        },
        "metadata": {"repo_path": str(tmp_path)},
    }
    zero_rollup_event = {
        "event_type": "cost_estimate_updated",
        "source": "otlp",
        "payload": {
            "precision": "measured",
            "cost_usd": 0.0,
            "gen_ai.usage.input_tokens": 0,
            "gen_ai.usage.output_tokens": 0,
            "gen_ai.usage.cache_read_tokens": 0,
            "raw_otel": {"resourceMetrics": []},
        },
        "metadata": {"repo_path": str(tmp_path)},
    }

    with TestClient(app) as client:
        first = client.post("/sessions/rollup-demo/events", json=api_request_event)
        second = client.post("/sessions/rollup-demo/events", json=zero_rollup_event)
        cost = client.get("/sessions/rollup-demo/cost").json()
        status = client.get("/sessions/rollup-demo").json()

    assert first.status_code == 200
    assert second.status_code == 200
    assert cost["cost_usd"] == {"value": 0.03, "precision": "measured"}
    assert cost["tokens"]["input"] == 30
    assert cost["tokens"]["output"] == 5
    assert cost["tokens"]["cache_read"] == 100
    assert cost["tokens"]["cache_create"] == 7
    assert cost["requests"] == 1
    assert status["cost_usd"]["value"] == 0.03
    assert status["tokens"]["input"] == 30


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
    _write_unreachable_model_endpoints_config(tmp_path)
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


def test_dashboard_metrics_route_returns_real_session_and_swebench_rows(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("AGENT_SIDECAR_REPO_PATH", str(tmp_path))
    get_manager.cache_clear()
    app = create_app()

    swebench_dir = tmp_path / ".agent-sidecar" / "swebench-lite" / "20260707T051539Z"
    swebench_dir.mkdir(parents=True)
    (swebench_dir / "results.jsonl").write_text(
        json.dumps({
            "instance_id": "astropy__astropy-12907",
            "repo": "astropy/astropy",
            "baseline_score": 1,
            "sidecar_score": 0,
            "baseline": {
                "cost_usd": 0.65818,
                "duration_ms": 214178,
                "exit_code": 0,
                "by_source": {"claude-opus-4-8 / sdk": {"cost": 0.65818}},
                "grade": {"score": 1, "status": "resolved", "resolved": True},
            },
            "sidecar": {
                "cost_usd": 0.290853,
                "duration_ms": 110995,
                "exit_code": 0,
                "by_source": {"claude-opus-4-8 / sdk": {"cost": 0.290853}},
                "grade": {"score": 0, "status": "unresolved", "resolved": False},
            },
        }) + "\n",
        encoding="utf-8",
    )

    cost_event = {
        "event_type": "cost_estimate_updated",
        "source": "otlp",
        "payload": {
            "precision": "measured",
            "cost_usd": 0.019,
            "gen_ai.request.model": "claude-sonnet-4",
            "gen_ai.usage.input_tokens": 100,
            "gen_ai.usage.output_tokens": 20,
            "gen_ai.usage.cache_read_tokens": 0,
        },
        "metadata": {"repo_path": str(tmp_path)},
    }

    with TestClient(app) as client:
        session_cost_response = client.post("/sessions/sidecar/events", json=cost_event)
        metrics_response = client.get("/api/dashboard/metrics")

    assert session_cost_response.status_code == 200
    assert metrics_response.status_code == 200
    metrics = metrics_response.json()
    assert metrics["totals"]["runCount"] == 2
    assert metrics["totals"]["defaultCostUsd"] == 0.67718
    assert metrics["totals"]["sidecarCostUsd"] == 0.309853
    assert any(run["id"].startswith("swebench-lite:20260707T051539Z:astropy__astropy-12907") for run in metrics["runs"])
    assert any(run["id"] == "cc-sidecar" for run in metrics["runs"])
    swebench_run = next(run for run in metrics["runs"] if run["taskType"] == "swebench_lite")
    assert swebench_run["qualityVerdict"] == "regressed"
    assert swebench_run["qualitySource"] == "swebench_evaluator"
    assert swebench_run["baselineScore"] == 1
    assert swebench_run["sidecarScore"] == 0
    assert swebench_run["baselineGradeStatus"] == "resolved"
    assert swebench_run["sidecarGradeStatus"] == "unresolved"
    assert swebench_run["savingsPercent"] == 0.558095


def test_dashboard_reset_clears_visible_rows_without_removing_caches(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("AGENT_SIDECAR_REPO_PATH", str(tmp_path))
    get_manager.cache_clear()
    app = create_app()

    swebench_root = tmp_path / ".agent-sidecar" / "swebench-lite"
    swebench_dir = swebench_root / "20260707T051539Z"
    cache_dir = swebench_root / "repo-cache"
    swebench_dir.mkdir(parents=True)
    cache_dir.mkdir(parents=True)
    (cache_dir / "keep.txt").write_text("cached", encoding="utf-8")
    (swebench_dir / "results.jsonl").write_text(
        json.dumps({
            "instance_id": "astropy__astropy-12907",
            "baseline": {"cost_usd": 0.2, "duration_ms": 2000, "exit_code": 0},
            "sidecar": {"cost_usd": 0.1, "duration_ms": 1000, "exit_code": 0},
        }) + "\n",
        encoding="utf-8",
    )

    cost_event = {
        "event_type": "cost_estimate_updated",
        "source": "otlp",
        "payload": {
            "precision": "measured",
            "cost_usd": 0.019,
            "gen_ai.request.model": "claude-sonnet-4",
            "gen_ai.usage.input_tokens": 100,
            "gen_ai.usage.output_tokens": 20,
            "gen_ai.usage.cache_read_tokens": 0,
        },
        "metadata": {"repo_path": str(tmp_path)},
    }

    with TestClient(app) as client:
        session_response = client.post("/sessions/reset-demo/events", json=cost_event)
        before_reset = client.get("/api/dashboard/metrics")
        reset_response = client.post("/api/dashboard/reset")
        after_reset = client.get("/api/dashboard/metrics")

    assert session_response.status_code == 200
    assert before_reset.status_code == 200
    assert before_reset.json()["totals"]["runCount"] == 2
    assert reset_response.status_code == 200
    reset_body = reset_response.json()
    assert reset_body["ok"] is True
    assert reset_body["sessionsRemoved"] == 1
    assert reset_body["swebenchRunsRemoved"] == 1
    assert reset_body["metrics"]["totals"]["runCount"] == 0
    assert after_reset.status_code == 200
    assert after_reset.json()["totals"]["runCount"] == 0
    assert not swebench_dir.exists()
    assert (cache_dir / "keep.txt").read_text(encoding="utf-8") == "cached"
