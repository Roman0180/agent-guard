from __future__ import annotations

from agent_sidecar.schema.events import SidecarEvent
from agent_sidecar.schema.model_io import EvaluatorFinding


def detect(events: list[SidecarEvent], *, validation_required_after_edits: bool = True) -> list[EvaluatorFinding]:
    if not validation_required_after_edits:
        return []
    last_edit_index = max((index for index, event in enumerate(events) if event.event_type == "file_edit_observed"), default=None)
    if last_edit_index is None:
        return []
    has_later_validation = any(event.event_type == "test_run_observed" for event in events[last_edit_index + 1 :])
    if has_later_validation:
        return []
    edit = events[last_edit_index]
    return [
        EvaluatorFinding(
            evaluator_id="missing_validation",
            severity="suggest",
            confidence=0.72,
            evidence_event_ids=[edit.event_id],
            summary="files were edited without a later test, lint, or build event",
            recommendation="Run the relevant validation command before ending the task.",
        )
    ]
