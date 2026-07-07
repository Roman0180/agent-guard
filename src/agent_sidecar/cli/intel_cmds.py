from __future__ import annotations

from pathlib import Path

import typer

from agent_sidecar.cli.client import request, resolve_session_id
from agent_sidecar.intel.cost import price_map_metadata, refresh_price_map
from agent_sidecar.schema.config import load_config


def refine(prompt: str, session_id: str | None = typer.Option(None, "--session")) -> None:
    body = {"prompt": prompt}
    if session_id:
        body["session_id"] = session_id
    response = request("POST", "/refine", body)
    result = response.json()
    typer.echo(f"Source: {result['source']}")
    typer.echo(f"Quality: {result['quality']}")
    if result.get("issues"):
        typer.echo("Issues: " + "; ".join(result["issues"]))
    typer.echo(result["refined_prompt"])


def steer(session_id: str | None = typer.Option(None, "--session")) -> None:
    session_id = resolve_session_id(session_id)
    result = request("POST", f"/sessions/{session_id}/steer", timeout_s=120).json()
    decision = result["result"]
    typer.echo(f"Decision: {decision['decision']} ({decision['confidence']:.2f})")
    typer.echo(f"Recommendation: {decision['recommendation']}")
    if decision.get("evidence_event_ids"):
        typer.echo("Evidence: " + ", ".join(decision["evidence_event_ids"]))
    evaluators = [finding["evaluator_id"] for finding in result.get("findings", [])]
    if evaluators:
        typer.echo("Evaluators: " + ", ".join(evaluators))


def cost_show(session_id: str | None = typer.Option(None, "--session")) -> None:
    session_id = resolve_session_id(session_id)
    result = request("GET", f"/sessions/{session_id}/cost").json()
    cost = result["cost_usd"]
    typer.echo(f"Cost: ${float(cost['value']):.6f} ({cost['precision']})")
    tokens = result.get("tokens") or {}
    typer.echo(f"Tokens: {tokens.get('input', 0)} in / {tokens.get('output', 0)} out ({tokens.get('precision', 'unknown')})")
    metadata = result.get("price_map")
    if metadata:
        typer.echo(f"Price map: {metadata.get('source', 'unknown')} ({metadata.get('snapshot_date', 'unknown snapshot')})")


def cost_compare(
    baseline_session: str | None = typer.Option(None, "--baseline", help="Session id for the run without Sidecar prompt interception. Defaults to latest prior session."),
    sidecar_session: str | None = typer.Option(None, "--sidecar", help="Session id for the Sidecar run. Defaults to active/latest session."),
    require_savings: bool = typer.Option(False, "--require-savings", help="Exit non-zero unless Sidecar cost is lower than baseline cost."),
) -> None:
    sidecar_session = resolve_session_id(sidecar_session)
    baseline_session = baseline_session or _resolve_baseline_session(sidecar_session)
    baseline = request("GET", f"/sessions/{baseline_session}/cost").json()
    sidecar = request("GET", f"/sessions/{sidecar_session}/cost").json()
    baseline_cost = float((baseline.get("cost_usd") or {}).get("value") or 0.0)
    sidecar_cost = float((sidecar.get("cost_usd") or {}).get("value") or 0.0)
    delta = baseline_cost - sidecar_cost
    percent = (delta / baseline_cost * 100) if baseline_cost > 0 else 0.0
    precision = _combined_precision(
        str((baseline.get("cost_usd") or {}).get("precision") or "unknown"),
        str((sidecar.get("cost_usd") or {}).get("precision") or "unknown"),
    )
    typer.echo(f"Baseline session: {baseline_session}")
    typer.echo(f"Sidecar session: {sidecar_session}")
    typer.echo(f"Baseline cost: ${baseline_cost:.6f} ({(baseline.get('cost_usd') or {}).get('precision', 'unknown')})")
    typer.echo(f"Sidecar cost:  ${sidecar_cost:.6f} ({(sidecar.get('cost_usd') or {}).get('precision', 'unknown')})")
    if delta >= 0:
        typer.echo(f"Savings:       ${delta:.6f} ({percent:.1f}%, {precision})")
    else:
        typer.echo(f"Increase:      ${abs(delta):.6f} ({abs(percent):.1f}%, {precision})")
    if precision != "measured":
        typer.echo("Note: compare is only as reliable as the weaker precision label.")
    if require_savings and delta <= 0:
        raise typer.Exit(1)


def cost_budget(
    session_id: str | None = typer.Option(None, "--session", help="Session id to guard. Defaults to active/latest session."),
    baseline_session: str | None = typer.Option(None, "--baseline", help="Baseline session id used to derive the budget."),
    budget_usd: float | None = typer.Option(None, "--budget-usd", help="Explicit budget ceiling in USD."),
    baseline_cost_usd: float | None = typer.Option(None, "--baseline-cost-usd", help="Explicit baseline cost in USD when no baseline session is available."),
    target_savings_pct: float | None = typer.Option(None, "--target-savings-pct", help="Savings target used when deriving the budget from baseline cost."),
    enforcement: str | None = typer.Option(None, "--enforcement", help="Budget enforcement mode: off, warn, or block."),
) -> None:
    session_id = resolve_session_id(session_id)
    body: dict[str, object] = {}
    if baseline_session:
        body["baseline_session_id"] = baseline_session
    if budget_usd is not None:
        body["budget_usd"] = budget_usd
    if baseline_cost_usd is not None:
        body["baseline_cost_usd"] = baseline_cost_usd
    if target_savings_pct is not None:
        body["target_savings_pct"] = target_savings_pct
    if enforcement:
        body["enforcement"] = enforcement
    result = request("POST", f"/sessions/{session_id}/budget", body).json()
    typer.echo(f"Session: {session_id}")
    typer.echo(f"Budget: ${float(result.get('budget_usd') or 0.0):.6f}")
    typer.echo(f"Baseline: ${float(result.get('baseline_cost_usd') or 0.0):.6f}")
    typer.echo(f"Target savings: {float(result.get('target_savings_pct') or 0.0):.1f}%")
    typer.echo(f"Enforcement: {result.get('enforcement', 'unknown')}")


def cost_refresh_map() -> None:
    repo_path = Path.cwd()
    config = load_config(repo_path)
    path = refresh_price_map(config, repo_path)
    meta = price_map_metadata(config, repo_path)
    typer.echo(f"Refreshed price map: {path}")
    typer.echo(f"Source: {meta.get('source')}  Snapshot: {meta.get('snapshot_date')}")


def _combined_precision(left: str, right: str) -> str:
    order = {"measured": 0, "priced": 1, "approximate": 2}
    worst = max(order.get(left, 3), order.get(right, 3))
    for name, value in order.items():
        if value == worst:
            return name
    return "unknown"


def _resolve_baseline_session(sidecar_session: str) -> str:
    sessions = request("GET", "/sessions").json()
    if not isinstance(sessions, list):
        typer.echo("Could not infer baseline session: /sessions returned an unexpected response.", err=True)
        raise typer.Exit(1)
    candidates = [session for session in sessions if isinstance(session, dict) and session.get("session_id") != sidecar_session]
    stopped = [session for session in candidates if session.get("status") == "stopped"]
    pool = stopped or candidates
    if not pool:
        typer.echo("Could not infer baseline session. Run a baseline first, stop it, or pass --baseline.", err=True)
        raise typer.Exit(1)
    latest = pool[-1]
    session_id = latest.get("session_id")
    if not isinstance(session_id, str) or not session_id:
        typer.echo("Could not infer baseline session id. Pass --baseline explicitly.", err=True)
        raise typer.Exit(1)
    return session_id
