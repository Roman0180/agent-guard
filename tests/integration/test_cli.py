from __future__ import annotations

import json
import os

import httpx
import respx
from typer.testing import CliRunner

from agent_sidecar.cli.main import app


def test_cli_version() -> None:
    result = CliRunner().invoke(app, ["--version"])

    assert result.exit_code == 0
    assert "0.1.0" in result.stdout


def test_cli_telemetry_print_env(tmp_path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)

    result = CliRunner().invoke(app, ["telemetry", "print-env"])

    assert result.exit_code == 0
    assert "CLAUDE_CODE_ENABLE_TELEMETRY=1" in result.stdout
    assert "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://127.0.0.1:4318/v1/metrics" in result.stdout


def test_cli_telemetry_print_env_uses_running_daemon_state(tmp_path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    state_dir = tmp_path / ".agent-sidecar"
    state_dir.mkdir()
    (state_dir / "daemon.json").write_text(
        json.dumps({
            "pid": os.getpid(),
            "api_url": "http://127.0.0.1:17433",
            "otlp_url": "http://127.0.0.1:14318",
            "repo_path": str(tmp_path),
        }),
        encoding="utf-8",
    )

    result = CliRunner().invoke(app, ["telemetry", "print-env"])

    assert result.exit_code == 0
    assert "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://127.0.0.1:14318/v1/metrics" in result.stdout


def test_cli_exposes_chunk2_gap_commands() -> None:
    result = CliRunner().invoke(app, ["dev", "--help"])
    cost = CliRunner().invoke(app, ["cost", "--help"])

    assert result.exit_code == 0
    assert "calibrate-detectors" in result.stdout
    assert cost.exit_code == 0
    assert "refresh-map" in cost.stdout
    assert "compare" in cost.stdout


@respx.mock
def test_cli_trace_show_defaults_to_active_session() -> None:
    base = "http://sidecar.test"
    respx.get(f"{base}/status").mock(return_value=httpx.Response(200, json={"active_session": {"session_id": "cc-demo"}, "sessions": []}))
    trace = respx.get(f"{base}/sessions/cc-demo/trace").mock(return_value=httpx.Response(200, text='{"event_type":"prompt_submitted"}\n'))

    result = CliRunner().invoke(app, ["trace", "show"], env={"AGENT_SIDECAR_API_URL": base})

    assert result.exit_code == 0
    assert "prompt_submitted" in result.stdout
    assert trace.called


@respx.mock
def test_cli_steer_and_cost_default_to_active_session() -> None:
    base = "http://sidecar.test"
    respx.get(f"{base}/status").mock(return_value=httpx.Response(200, json={"active_session": {"session_id": "cc-demo"}, "sessions": []}))
    steer_route = respx.post(f"{base}/sessions/cc-demo/steer").mock(return_value=httpx.Response(200, json={
        "result": {"decision": "continue", "recommendation": "Continue.", "evidence_event_ids": [], "confidence": 0.6},
        "findings": [],
    }))
    cost_route = respx.get(f"{base}/sessions/cc-demo/cost").mock(return_value=httpx.Response(200, json={
        "cost_usd": {"value": 0.0, "precision": "approximate"},
        "tokens": {"input": 0, "output": 0, "cache_read": 0, "precision": "approximate"},
    }))

    steer = CliRunner().invoke(app, ["steer"], env={"AGENT_SIDECAR_API_URL": base})
    cost = CliRunner().invoke(app, ["cost", "show"], env={"AGENT_SIDECAR_API_URL": base})

    assert steer.exit_code == 0
    assert "Decision: continue" in steer.stdout
    assert steer_route.called
    assert cost.exit_code == 0
    assert "Cost: $0.000000" in cost.stdout
    assert cost_route.called


@respx.mock
def test_cli_cost_compare_reports_savings_against_active_sidecar_session() -> None:
    base = "http://sidecar.test"
    respx.get(f"{base}/status").mock(return_value=httpx.Response(200, json={"active_session": {"session_id": "cc-sidecar"}, "sessions": []}))
    baseline = respx.get(f"{base}/sessions/cc-baseline/cost").mock(return_value=httpx.Response(200, json={
        "cost_usd": {"value": 0.02, "precision": "measured"},
        "tokens": {"input": 100, "output": 20, "cache_read": 0, "precision": "measured"},
    }))
    sidecar = respx.get(f"{base}/sessions/cc-sidecar/cost").mock(return_value=httpx.Response(200, json={
        "cost_usd": {"value": 0.011, "precision": "measured"},
        "tokens": {"input": 80, "output": 10, "cache_read": 0, "precision": "measured"},
    }))

    result = CliRunner().invoke(app, ["cost", "compare", "--baseline", "cc-baseline"], env={"AGENT_SIDECAR_API_URL": base})

    assert result.exit_code == 0
    assert "Savings:       $0.009000" in result.stdout
    assert "45.0%" in result.stdout
    assert baseline.called
    assert sidecar.called


@respx.mock
def test_cli_cost_compare_infers_latest_stopped_baseline() -> None:
    base = "http://sidecar.test"
    respx.get(f"{base}/status").mock(return_value=httpx.Response(200, json={"active_session": {"session_id": "cc-sidecar"}, "sessions": []}))
    sessions_route = respx.get(f"{base}/sessions").mock(return_value=httpx.Response(200, json=[
        {"session_id": "cc-old", "status": "stopped"},
        {"session_id": "cc-baseline", "status": "stopped"},
        {"session_id": "cc-sidecar", "status": "active"},
    ]))
    baseline = respx.get(f"{base}/sessions/cc-baseline/cost").mock(return_value=httpx.Response(200, json={
        "cost_usd": {"value": 0.03, "precision": "measured"},
        "tokens": {"input": 100, "output": 20, "cache_read": 0, "precision": "measured"},
    }))
    sidecar = respx.get(f"{base}/sessions/cc-sidecar/cost").mock(return_value=httpx.Response(200, json={
        "cost_usd": {"value": 0.01, "precision": "measured"},
        "tokens": {"input": 80, "output": 10, "cache_read": 0, "precision": "measured"},
    }))

    result = CliRunner().invoke(app, ["cost", "compare"], env={"AGENT_SIDECAR_API_URL": base})

    assert result.exit_code == 0
    assert "Baseline session: cc-baseline" in result.stdout
    assert "Savings:       $0.020000" in result.stdout
    assert sessions_route.called
    assert baseline.called
    assert sidecar.called


@respx.mock
def test_cli_cost_compare_require_savings_exits_when_sidecar_cost_is_not_lower() -> None:
    base = "http://sidecar.test"
    respx.get(f"{base}/status").mock(return_value=httpx.Response(200, json={"active_session": {"session_id": "cc-sidecar"}, "sessions": []}))
    respx.get(f"{base}/sessions/cc-baseline/cost").mock(return_value=httpx.Response(200, json={
        "cost_usd": {"value": 0.02, "precision": "measured"},
        "tokens": {"input": 100, "output": 20, "cache_read": 0, "precision": "measured"},
    }))
    respx.get(f"{base}/sessions/cc-sidecar/cost").mock(return_value=httpx.Response(200, json={
        "cost_usd": {"value": 0.021, "precision": "measured"},
        "tokens": {"input": 110, "output": 20, "cache_read": 0, "precision": "measured"},
    }))

    result = CliRunner().invoke(app, ["cost", "compare", "--baseline", "cc-baseline", "--require-savings"], env={"AGENT_SIDECAR_API_URL": base})

    assert result.exit_code == 1
    assert "Increase:" in result.stdout
