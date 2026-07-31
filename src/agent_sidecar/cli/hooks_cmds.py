from __future__ import annotations

from pathlib import Path

import typer

from agent_sidecar.adapters.claude_code.installer import DEFAULT_REFINE_TIMEOUT_SECONDS, hooks_status, install_hooks, uninstall_hooks
from agent_sidecar.daemon.runner import daemon_api_url


def install(
    refine_timeout: float = typer.Option(
        DEFAULT_REFINE_TIMEOUT_SECONDS,
        "--refine-timeout",
        help="Seconds the UserPromptSubmit hook waits for /refine before falling back to deterministic refinement.",
    ),
) -> None:
    result = install_hooks(Path.cwd(), api_url=daemon_api_url(Path.cwd()), refine_timeout_seconds=refine_timeout)
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
