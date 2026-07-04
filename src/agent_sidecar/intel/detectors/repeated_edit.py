from __future__ import annotations

from collections import defaultdict

from agent_sidecar.intel.normalize import edited_path_from_event
from agent_sidecar.schema.events import SidecarEvent
from agent_sidecar.schema.model_io import EvaluatorFinding, WasteEstimate
from agent_sidecar.schema.session import Precision


def detect(events: list[SidecarEvent]) -> list[EvaluatorFinding]:
    edits: dict[str, list[SidecarEvent]] = defaultdict(list)
    for event in events:
        if event.event_type != "file_edit_observed":
            continue
        path = edited_path_from_event(event)
        if path:
            edits[path].append(event)

    findings: list[EvaluatorFinding] = []
    for path, matches in edits.items():
        if len(matches) >= 3:
            findings.append(
                EvaluatorFinding(
                    evaluator_id="repeated_edit",
                    severity="suggest",
                    confidence=0.78,
                    evidence_event_ids=[event.event_id for event in matches[-3:]],
                    summary=f"{path} was edited {len(matches)} times in the same run",
                    recommendation="Review the last diff and failure before applying another edit to the same file.",
                    estimated_waste=WasteEstimate(repeated_actions=len(matches) - 2, cost_usd=None, precision=Precision.approximate),
                )
            )
    return findings
