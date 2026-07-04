from __future__ import annotations

import json
from pathlib import Path

import httpx
import typer

from agent_sidecar.adapters import manual
from agent_sidecar.cli.client import request, resolve_session_id


def list_sessions() -> None:
    for session in request("GET", "/sessions").json():
        typer.echo(f"{session['session_id']}\t{session['status']}\t{session['repo_path']}")


def show(session_id: str | None = typer.Argument(None)) -> None:
    session_id = resolve_session_id(session_id)
    typer.echo(json.dumps(request("GET", f"/sessions/{session_id}").json(), indent=2))


def stop(session_id: str | None = typer.Argument(None)) -> None:
    session_id = resolve_session_id(session_id)
    session = request("POST", f"/sessions/{session_id}/stop").json()
    typer.echo(f"Stopped {session['session_id']}")


def trace_show(session_id: str | None = typer.Argument(None)) -> None:
    session_id = resolve_session_id(session_id)
    response = request("GET", f"/sessions/{session_id}/trace")
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
    return request("POST", f"/sessions/{session_id}/events", json_payload=payload)
