from __future__ import annotations

from agent_sidecar.intel.refiner_fallback import has_validation_opt_out
from agent_sidecar.schema.events import SidecarEvent
from agent_sidecar.schema.model_io import EvaluatorFinding


def detect(events: list[SidecarEvent], *, validation_required_after_edits: bool = True) -> list[EvaluatorFinding]:
    if not validation_required_after_edits:
        return []
    if _prompt_opted_out_of_validation(events):
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


def _prompt_opted_out_of_validation(events: list[SidecarEvent]) -> bool:
    """Recommending validation the prompt forbade ("No tests") flags correct behavior;
    the latest prompt's stated intent wins over the default expectation."""
    for event in reversed(events):
        if event.event_type == "prompt_refined":
            payload = event.payload
            if "validation_opt_out" in payload:
                return bool(payload.get("validation_opt_out"))
            return has_validation_opt_out(str(payload.get("original_prompt") or ""))
        if event.event_type == "prompt_submitted":
            return has_validation_opt_out(str(event.payload.get("prompt") or ""))
    return False
