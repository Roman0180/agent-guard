from __future__ import annotations

from agent_sidecar.intel.normalize import path_keywords, prompt_keywords
from agent_sidecar.schema.events import SidecarEvent
from agent_sidecar.schema.model_io import EvaluatorFinding


def detect(events: list[SidecarEvent]) -> list[EvaluatorFinding]:
    prompt = next((str(event.payload.get("prompt") or "") for event in events if event.event_type == "prompt_submitted"), "")
    keywords = prompt_keywords(prompt)
    if not keywords:
        return []
    drift_events: list[SidecarEvent] = []
    for event in events:
        if event.event_type != "file_edit_observed":
            continue
        path = str(event.payload.get("path") or "")
        if path and keywords.isdisjoint(path_keywords(path)):
            drift_events.append(event)
    if not drift_events:
        return []
    return [
        EvaluatorFinding(
            evaluator_id="task_drift",
            severity="suggest",
            confidence=0.68,
            evidence_event_ids=[event.event_id for event in drift_events[-3:]],
            summary="recent edits appear outside the prompt's declared scope",
            recommendation="Check whether these files are necessary for the requested task before continuing.",
        )
    ]
