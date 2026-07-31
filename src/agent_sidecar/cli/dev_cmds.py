from __future__ import annotations

import json
from pathlib import Path

import httpx
import typer

from agent_sidecar.daemon.runner import daemon_api_url
from agent_sidecar.intel.calibration import calibrate
from agent_sidecar.schema.events import SidecarEvent
from agent_sidecar.store.jsonl import read_events


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


def export_dataset(kind: str = typer.Option("refine", "--kind"), output: Path | None = typer.Option(None, "--output")) -> None:
    if kind not in {"refine", "steer"}:
        typer.echo("--kind must be refine or steer", err=True)
        raise typer.Exit(2)
    output = output or Path(f"evals/fixtures/datasets/{kind}.jsonl")
    rows: list[dict] = []
    for path in sorted((Path.cwd() / ".agent-sidecar" / "sessions").glob("cc-*.jsonl")):
        events = read_events(path)
        if kind == "refine":
            rows.extend(_refine_rows(events, path))
        else:
            rows.extend(_steer_rows(events, path))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("".join(json.dumps(row, separators=(",", ":")) + "\n" for row in rows), encoding="utf-8")
    typer.echo(f"Exported {len(rows)} {kind} rows to {output}")


def calibrate_detectors(
    labels: Path = typer.Option(Path("evals/fixtures/datasets/steering_labels.jsonl"), "--labels"),
    output: Path | None = typer.Option(None, "--output"),
) -> None:
    report = calibrate(labels, base_dir=Path.cwd())
    text = json.dumps(report.model_dump(mode="json"), indent=2) + "\n"
    if output:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(text, encoding="utf-8")
        typer.echo(f"Wrote detector calibration report to {output}")
    else:
        typer.echo(text, nl=False)


def _refine_rows(events: list[SidecarEvent], path: Path) -> list[dict]:
    rows: list[dict] = []
    for event in events:
        if event.event_type != "prompt_refined":
            continue
        rows.append({
            "messages": [
                {"role": "system", "content": "Draft a structured coding-agent prompt as strict JSON."},
                {"role": "user", "content": str(event.payload.get("original_prompt") or "")},
                {"role": "assistant", "content": json.dumps({
                    "refined_prompt": event.payload.get("refined_prompt"),
                    "acceptance_criteria": event.payload.get("acceptance_criteria", []),
                    "testing_expectations": event.payload.get("testing_expectations", ""),
                    "do_not_change": event.payload.get("do_not_change", []),
                    "files_or_components": event.payload.get("files_or_components", []),
                }, separators=(",", ":"))},
            ],
            "provenance": {"trace": str(path), "event_id": event.event_id},
        })
    return rows


def _steer_rows(events: list[SidecarEvent], path: Path) -> list[dict]:
    rows: list[dict] = []
    for event in events:
        if event.event_type != "steering_recommendation":
            continue
        rows.append({
            "messages": [
                {"role": "system", "content": "Decide continue, suggest, or warn from detector evidence as strict JSON."},
                {"role": "user", "content": json.dumps({"evidence_event_ids": event.payload.get("evidence_event_ids", [])}, separators=(",", ":"))},
                {"role": "assistant", "content": json.dumps({
                    "decision": event.payload.get("decision"),
                    "recommendation": event.payload.get("recommendation"),
                    "evidence_event_ids": event.payload.get("evidence_event_ids", []),
                    "confidence": event.payload.get("confidence", 0.0),
                }, separators=(",", ":"))},
            ],
            "provenance": {"trace": str(path), "event_id": event.event_id},
        })
    return rows


def calibrate_k_cmd() -> None:
    from agent_sidecar.intel.k_store import k_calibration_path
    from agent_sidecar.intel.measurement import calibrate_k
    from agent_sidecar.store.sessions import SessionManager

    manager = SessionManager(Path.cwd())
    evaluators = calibrate_k(manager)
    if not evaluators:
        typer.echo("No shadow detections found in control-arm sessions; calibration unchanged (seed values apply).")
        return
    typer.echo(f"Wrote {k_calibration_path(Path.cwd())}")
    for evaluator_id, entry in sorted(evaluators.items()):
        typer.echo(f"  {evaluator_id}: median {entry['median_extra_iterations']:g} extra iterations ({entry['samples']} samples)")
