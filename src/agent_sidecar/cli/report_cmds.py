from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import typer

from agent_sidecar.gateway.report import build_report, render_markdown, render_terminal
from agent_sidecar.gateway.server import serve
from agent_sidecar.gateway.traces import trace_store
from agent_sidecar.schema.config import load_config


def report(
    markdown_path: str | None = typer.Option(None, "--markdown", help="Markdown output path. Defaults to .agent-sidecar/reports/baseline-<utc timestamp>.md"),
) -> None:
    """Baseline report from captured gateway traces: cost by model, retry waste, malformed tool calls, latency, and policy savings."""
    repo_path = Path.cwd()
    config = load_config(repo_path)
    store = trace_store(repo_path, config)
    result = build_report(store.iter_records(), config, repo_path)
    if result["requests"] == 0:
        typer.echo(f"No gateway traces found at {store.path}. Run `sidecar gateway` and route traffic through it first.")
        raise typer.Exit(code=1)

    typer.echo(render_terminal(result))

    if markdown_path is None:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        markdown_path = str(repo_path / ".agent-sidecar" / "reports" / f"baseline-{stamp}.md")
    output = Path(markdown_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(render_markdown(result), encoding="utf-8")
    typer.echo(f"\nMarkdown report written to {output}")


def gateway(
    port: int | None = typer.Option(None, "--port", help="Listen port. Defaults to gateway.listen_port from config."),
    target: str | None = typer.Option(None, "--target", help="Upstream base URL. Defaults to gateway.target_base from config."),
) -> None:
    """Run the trace-capturing inference gateway (foreground)."""
    repo_path = Path.cwd()
    config = load_config(repo_path)
    if port is not None:
        config.gateway.listen_port = port
    if target is not None:
        config.gateway.target_base = target
    server = serve(repo_path, config)
    typer.echo(
        f"Agent Sidecar gateway listening on {config.gateway.listen_host}:{config.gateway.listen_port} "
        f"-> {config.gateway.target_base} (traces: {config.gateway.capture.trace_path})"
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()
