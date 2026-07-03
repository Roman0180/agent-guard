from __future__ import annotations

from pathlib import Path

import typer

from agent_sidecar.daemon.runner import is_running, read_state
from agent_sidecar.schema.config import load_config


def print_env() -> None:
    repo_path = Path.cwd()
    endpoint = _otlp_endpoint(repo_path)
    typer.echo("export CLAUDE_CODE_ENABLE_TELEMETRY=1")
    typer.echo("export OTEL_METRICS_EXPORTER=otlp")
    typer.echo("export OTEL_LOGS_EXPORTER=otlp")
    typer.echo("export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf")
    typer.echo(f"export OTEL_EXPORTER_OTLP_ENDPOINT={endpoint}")
    typer.echo(f"export OTEL_EXPORTER_OTLP_METRICS_ENDPOINT={endpoint}/v1/metrics")
    typer.echo(f"export OTEL_EXPORTER_OTLP_LOGS_ENDPOINT={endpoint}/v1/logs")


def _otlp_endpoint(repo_path: Path) -> str:
    state = read_state(repo_path)
    if state and is_running(state) and isinstance(state.get("otlp_url"), str):
        return state["otlp_url"].rstrip("/")
    config = load_config(repo_path)
    return f"http://127.0.0.1:{config.daemon.otlp_port}"
