from __future__ import annotations

import json
from pathlib import Path

import httpx
import typer

from agent_sidecar.adapters import manual
from agent_sidecar.daemon.runner import daemon_api_url


def list_sessions() -> None:
    for session in _request("GET", "/sessions").json():
        typer.echo(f"{session['session_id']}\t{session['status']}\t{session['repo_path']}")


def show(session_id: str) -> None:
    typer.echo(json.dumps(_request("GET", f"/sessions/{session_id}").json(), indent=2))


def stop(session_id: str) -> None:
    session = _request("POST", f"/sessions/{session_id}/stop").json()
    typer.echo(f"Stopped {session['session_id']}")


def trace_show(session_id: str) -> None:
    response = _request("GET", f"/sessions/{session_id}/trace")
    typer.echo(response.text, nl=False)


def event_command(session_id: str = typer.Option(..., "--session"), command: str = typer.Option(..., "--command")) -> None:
    event = manual.command_event(session_id, command, Path.cwd())
    _post_event(session_id, event.model_dump(mode="json"))
    typer.echo(f"Recorded command for {session_id}")


def event_edit(session_id: str = typer.Option(..., "--session"), path: str = typer.Option(..., "--path")) -> None:
    event = manual.edit_event(session_id, path, Path.cwd())
    _post_event(session_id, event.model_dump(mode="json"))
    typer.echo(f"Recorded edit for {session_id}")


def event_test(session_id: str = typer.Option(..., "--session"), command: str = typer.Option(..., "--command"), status: str = typer.Option("unknown", "--status")) -> None:
    for event in manual.test_event(session_id, command, status, Path.cwd()):
        _post_event(session_id, event.model_dump(mode="json"))
    typer.echo(f"Recorded test for {session_id}")


def _post_event(session_id: str, payload: dict) -> httpx.Response:
    return _request("POST", f"/sessions/{session_id}/events", json_payload=payload)


def _request(method: str, path: str, json_payload: dict | None = None) -> httpx.Response:
    url = daemon_api_url(Path.cwd())
    try:
        response = httpx.request(method, f"{url}{path}", json=json_payload, timeout=5)
        response.raise_for_status()
        return response
    except httpx.HTTPError as error:
        typer.echo(f"Agent Sidecar daemon unavailable or rejected request at {url}{path}: {error}", err=True)
        raise typer.Exit(1) from error
