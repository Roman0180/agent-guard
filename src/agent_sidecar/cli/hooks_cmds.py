from __future__ import annotations

from pathlib import Path

import typer

from agent_sidecar.adapters.claude_code.installer import hooks_status, install_hooks, uninstall_hooks
from agent_sidecar.daemon.runner import daemon_api_url


def install() -> None:
    result = install_hooks(Path.cwd(), api_url=daemon_api_url(Path.cwd()))
    typer.echo(f"Installed Agent Sidecar hooks in {result['path']}")


def uninstall() -> None:
    result = uninstall_hooks(Path.cwd())
    typer.echo(f"Removed Agent Sidecar hooks from {result['path']}")


def status() -> None:
    result = hooks_status(Path.cwd())
    typer.echo(f"Hooks file: {result['path']}")
    typer.echo(f"Installed: {'yes' if result['installed'] else 'no'}")
    if result.get("events"):
        typer.echo("Events: " + ", ".join(result["events"]))
