from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from agent_sidecar.daemon.app import create_app, get_manager


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
    assert "prompt_submitted" in trace.text
    assert "file_edit_observed" in trace.text
    assert "test_failure_observed" in trace.text
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
