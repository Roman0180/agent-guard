from __future__ import annotations

from pathlib import Path

import httpx
import typer

from agent_sidecar.daemon.runner import daemon_api_url, start_background, wait_for_health


def start(api_port: int | None = typer.Option(None, "--api-port"), otlp_port: int | None = typer.Option(None, "--otlp-port")) -> None:
    repo_path = Path.cwd()
    state = start_background(repo_path, api_port=api_port, otlp_port=otlp_port)
    ready = wait_for_health(state["api_url"], timeout_s=5)
    typer.echo(f"Agent Sidecar running locally" if ready else "Agent Sidecar start requested")
    typer.echo(f"API: {state['api_url']}")
    typer.echo(f"OTLP: {state['otlp_url']}")


def status() -> None:
    repo_path = Path.cwd()
    url = daemon_api_url(repo_path)
    try:
        response = httpx.get(f"{url}/status", timeout=2)
        response.raise_for_status()
    except httpx.HTTPError as error:
        typer.echo(f"Agent Sidecar daemon unavailable at {url}: {error}", err=True)
        raise typer.Exit(1) from error
    body = response.json()
    active = body.get("active_session")
    typer.echo("Agent Sidecar running locally")
    if active:
        typer.echo(f"Active session: {active['session_id']}")
        typer.echo(f"Repo: {active['repo_path']}")
        obs = active.get("observation", {})
        typer.echo(f"Observation: hooks {'✓' if obs.get('hooks') else '—'}  otlp {'✓' if obs.get('otlp') else '—'}  manual {'✓' if obs.get('manual') else '—'}")
        typer.echo(f"Events recorded: {active.get('event_count', 0)}")
        if active.get("tokens"):
            tokens = active["tokens"]
            typer.echo(f"Tokens: {tokens.get('input', 0)} in / {tokens.get('output', 0)} out ({tokens.get('precision')})")
        if active.get("cost_usd"):
            cost = active["cost_usd"]
            typer.echo(f"Cost: ${float(cost.get('value', 0)):.4f} ({cost.get('precision')})")
        typer.echo(f"Trace: {active.get('trace_path')}")
    else:
        typer.echo("Active session: none")
