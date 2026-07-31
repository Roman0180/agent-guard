from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from agent_sidecar.daemon.app import create_app, get_manager
from agent_sidecar.schema.config import SidecarConfig


FAILED_TEST_FIXTURE = Path("evals/fixtures/hooks/post_tool_use_failed_test.json")


def _write_config(repo_path: Path, *, control_fraction: float, steer_on_ingest: bool) -> None:
    config = SidecarConfig()
    config.models.endpoints["ollama"].api_base = "http://127.0.0.1:1"
    config.models.endpoints["llama_server"].api_base = "http://127.0.0.1:1"
    config.measurement.control_fraction = control_fraction
    config.measurement.steer_on_ingest = steer_on_ingest
    config_dir = repo_path / ".agent-sidecar"
    config_dir.mkdir(parents=True, exist_ok=True)
    (config_dir / "config.json").write_text(config.model_dump_json(indent=2), encoding="utf-8")


def _client(tmp_path: Path, monkeypatch) -> TestClient:
    monkeypatch.setenv("AGENT_SIDECAR_REPO_PATH", str(tmp_path))
    get_manager.cache_clear()
    return TestClient(create_app())


def _post_failed_test(client: TestClient, session_id: str) -> dict:
    payload = json.loads(FAILED_TEST_FIXTURE.read_text(encoding="utf-8"))
    response = client.post(f"/sessions/{session_id}/events", json=payload)
    assert response.status_code == 200
    return response.json()


def test_control_arm_suppresses_refinement_but_records_event(tmp_path: Path, monkeypatch) -> None:
    _write_config(tmp_path, control_fraction=1.0, steer_on_ingest=False)
    with _client(tmp_path, monkeypatch) as client:
        response = client.post("/refine", json={"session_id": "cc-control-refine", "prompt": "fix the auth bug"})
        assert response.status_code == 200
        body = response.json()
        assert body["suppressed"] is True
        assert body["arm"] == "control"
        assert "refined_prompt" not in body
        trace = client.get("/sessions/cc-control-refine/trace").text
    event_types = [json.loads(line)["event_type"] for line in trace.splitlines()]
    assert "refinement_suppressed" in event_types
    assert "prompt_refined" not in event_types


def test_assist_arm_still_refines(tmp_path: Path, monkeypatch) -> None:
    _write_config(tmp_path, control_fraction=0.0, steer_on_ingest=False)
    with _client(tmp_path, monkeypatch) as client:
        response = client.post("/refine", json={"session_id": "cc-assist-refine", "prompt": "fix the auth bug"})
        assert response.status_code == 200
        assert isinstance(response.json().get("refined_prompt"), str)


def test_assist_arm_delivers_steering_context_once(tmp_path: Path, monkeypatch) -> None:
    _write_config(tmp_path, control_fraction=0.0, steer_on_ingest=True)
    session_id = "cc-assist-steering"
    with _client(tmp_path, monkeypatch) as client:
        first = _post_failed_test(client, session_id)
        second = _post_failed_test(client, session_id)
        third = client.post(f"/sessions/{session_id}/events", json={"hook_event_name": "Stop", "session_id": session_id})
        assert third.status_code == 200
        trace = client.get(f"/sessions/{session_id}/trace").text

    assert first["measurement"]["arm"] == "assist"
    contexts = [
        response.get("measurement", {}).get("steering_context")
        for response in (first, second, third.json())
    ]
    delivered = [context for context in contexts if context]
    # Each distinct evaluator is announced at most once per session; a batch with
    # no newly fired evaluator (the Stop event) must deliver nothing.
    assert 1 <= len(delivered) <= 2
    assert contexts[2] is None
    assert all("Agent Sidecar steering" in context for context in delivered)
    event_types = [json.loads(line)["event_type"] for line in trace.splitlines()]
    assert event_types.count("steering_recommendation") == len(delivered)
    assert "shadow_detection" not in event_types


def test_control_arm_records_shadow_detection_and_delivers_nothing(tmp_path: Path, monkeypatch) -> None:
    _write_config(tmp_path, control_fraction=1.0, steer_on_ingest=True)
    session_id = "cc-control-shadow"
    with _client(tmp_path, monkeypatch) as client:
        first = _post_failed_test(client, session_id)
        second = _post_failed_test(client, session_id)
        trace = client.get(f"/sessions/{session_id}/trace").text

    assert first["measurement"]["arm"] == "control"
    assert second["measurement"]["steering_context"] is None
    event_types = [json.loads(line)["event_type"] for line in trace.splitlines()]
    assert "shadow_detection" in event_types
    assert "steering_recommendation" not in event_types


def test_measurement_report_aggregates_by_arm(tmp_path: Path, monkeypatch) -> None:
    _write_config(tmp_path, control_fraction=1.0, steer_on_ingest=True)
    session_id = "cc-report-session"
    with _client(tmp_path, monkeypatch) as client:
        _post_failed_test(client, session_id)
        _post_failed_test(client, session_id)
        client.post("/refine", json={"session_id": session_id, "prompt": "fix it"})
        report = client.get("/measurement/report").json()

    control = report["arms"]["control"]
    assert control["sessions"] == 1
    assert control["shadow_detections"] >= 1
    assert control["refinements_suppressed"] == 1
    assert report["arms"]["assist"]["sessions"] == 0
    assert "failed_test_loop" in report["k_calibration"]
