from __future__ import annotations

from pathlib import Path

import httpx
import typer

from agent_sidecar.daemon.runner import daemon_api_url


def request(method: str, path: str, json_payload: dict | None = None) -> httpx.Response:
    url = daemon_api_url(Path.cwd())
    try:
        response = httpx.request(method, f"{url}{path}", json=json_payload, timeout=5)
        response.raise_for_status()
        return response
    except httpx.HTTPError as error:
        typer.echo(f"Agent Sidecar request failed at {url}{path}: {error}", err=True)
        raise typer.Exit(1) from error


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
