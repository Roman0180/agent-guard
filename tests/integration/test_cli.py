from __future__ import annotations

import json
import os

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
