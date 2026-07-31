from __future__ import annotations

import json

import typer

from agent_sidecar.cli.client import request


def report(as_json: bool = typer.Option(False, "--json", help="Print the raw JSON report.")) -> None:
    data = request("GET", "/measurement/report").json()
    if as_json:
        typer.echo(json.dumps(data, indent=2))
        return
    typer.echo(f"control_fraction: {data.get('control_fraction')}  steer_on_ingest: {data.get('steer_on_ingest')}")
    arms = data.get("arms", {})
    columns = [
        "sessions", "events", "tokens_input", "tokens_output",
        "measured_cost_usd", "refinements_delivered", "refinements_suppressed",
        "steering_recommendations", "shadow_detections",
    ]
    header = f"{'metric':<26}{'assist':>14}{'control':>14}"
    typer.echo(header)
    for column in columns:
        assist = arms.get("assist", {}).get(column, 0)
        control = arms.get("control", {}).get(column, 0)
        typer.echo(f"{column:<26}{assist:>14}{control:>14}")
    calibration = data.get("k_calibration", {})
    if calibration:
        typer.echo("k calibration (median extra iterations after detection):")
        for evaluator_id, value in sorted(calibration.items()):
            typer.echo(f"  {evaluator_id}: {value:g}")
    note = data.get("note")
    if note:
        typer.echo(note)
