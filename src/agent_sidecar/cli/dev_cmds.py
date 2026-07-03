from __future__ import annotations

import json
from pathlib import Path

import httpx
import typer

from agent_sidecar.daemon.runner import daemon_api_url
from agent_sidecar.schema.events import SidecarEvent


def replay_fixture(path: Path, session_id: str = typer.Option(..., "--session")) -> None:
    url = daemon_api_url(Path.cwd())
    accepted = 0
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            body = json.loads(line)
            if "event_type" in body:
                body = SidecarEvent.model_validate(body).model_copy(update={"session_id": session_id}).model_dump(mode="json")
            response = httpx.post(f"{url}/sessions/{session_id}/events", json=body, timeout=5)
            response.raise_for_status()
            accepted += response.json().get("accepted", 1)
    typer.echo(f"Replayed {accepted} events into {session_id}")
