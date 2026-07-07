from __future__ import annotations

import os
from pathlib import Path

import httpx
import typer

from agent_sidecar.daemon.runner import daemon_api_url


def request(method: str, path: str, json_payload: dict | None = None, *, timeout_s: float | None = None) -> httpx.Response:
    url = daemon_api_url(Path.cwd())
    timeout = timeout_s if timeout_s is not None else cli_timeout_seconds()
    try:
        response = httpx.request(method, f"{url}{path}", json=json_payload, timeout=timeout)
        response.raise_for_status()
        return response
    except httpx.HTTPError as error:
        typer.echo(f"Agent Sidecar request failed at {url}{path}: {error}", err=True)
        raise typer.Exit(1) from error


def cli_timeout_seconds() -> float:
    raw = os.environ.get("AGENT_SIDECAR_CLI_TIMEOUT_SECONDS", "").strip()
    if not raw:
        return 30.0
    try:
        value = float(raw)
    except ValueError:
        return 30.0
    return value if value > 0 else 30.0


def resolve_session_id(session_id: str | None = None) -> str:
    if session_id:
        return session_id
    status = request("GET", "/status").json()
    active = status.get("active_session")
    if isinstance(active, dict) and active.get("session_id"):
        return str(active["session_id"])
    sessions = status.get("sessions")
    if isinstance(sessions, list) and sessions:
        latest = sessions[-1]
        if isinstance(latest, dict) and latest.get("session_id"):
            return str(latest["session_id"])
    typer.echo("No Agent Sidecar session found. Start Claude Code with hooks enabled or pass --session explicitly.", err=True)
    raise typer.Exit(1)
