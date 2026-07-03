from __future__ import annotations

import json
from pathlib import Path

from agent_sidecar.schema.events import SidecarEvent


def append_event(path: Path, event: SidecarEvent) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(event.model_dump_json() + "\n")


def read_events(path: Path) -> list[SidecarEvent]:
    if not path.exists():
        return []
    events: list[SidecarEvent] = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                events.append(SidecarEvent.model_validate_json(line))
    return events


def read_raw_lines(path: Path) -> list[str]:
    if not path.exists():
        return []
    return [line.rstrip("\n") for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(row, separators=(",", ":")) + "\n" for row in rows), encoding="utf-8")
