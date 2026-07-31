from __future__ import annotations

from pathlib import Path
from importlib import resources

from agent_sidecar.intel import ranker
from agent_sidecar.intel.detectors import failed_test_loop, missing_validation, repeated_command, repeated_edit, task_drift
from agent_sidecar.intel.k_store import load_k_calibration
from agent_sidecar.intel.rules import apply_rule_gates
from agent_sidecar.models.validation import evidence_subset
from agent_sidecar.schema.config import SidecarConfig
from agent_sidecar.schema.events import EventMeta, EventSource, SidecarEvent
from agent_sidecar.schema.model_io import EvaluatorFinding, ModelProvider, ModelRole, NextStepDraft, SteerResult


def collect_findings(events: list[SidecarEvent], config: SidecarConfig) -> list[EvaluatorFinding]:
    findings: list[EvaluatorFinding] = []
    findings.extend(repeated_command.detect(events))
    findings.extend(failed_test_loop.detect(events))
    findings.extend(repeated_edit.detect(events))
    findings.extend(missing_validation.detect(events, validation_required_after_edits=config.steering.validation_required_after_edits))
    findings.extend(task_drift.detect(events))
    return apply_rule_gates(findings, config)


def steer(
    events: list[SidecarEvent],
    *,
    config: SidecarConfig,
    repo_path: Path,
    session_id: str,
    provider: ModelProvider | None = None,
) -> tuple[SteerResult, list[EvaluatorFinding], SidecarEvent]:
    findings = collect_findings(events, config)
    allowed_evidence = {event_id for finding in findings for event_id in finding.evidence_event_ids}
    model_result = None
    if provider and findings:
        prompt = _steer_prompt(findings, events)
        candidate = provider.complete_json(ModelRole.reasoning, _prompt_template("steer_reasoning.txt"), prompt, SteerResult)
        if isinstance(candidate, SteerResult) and evidence_subset(candidate.evidence_event_ids, allowed_evidence):
            model_result = candidate
    result = model_result or ranker.deterministic_decision(findings)

    if provider and result.decision in {"suggest", "warn"} and config.steering.coding_next_step:
        candidate = provider.complete_json(ModelRole.coding, "Draft one concrete code-aware next step. Return strict JSON matching NextStepDraft.", _next_step_prompt(result, events), NextStepDraft)
        if isinstance(candidate, NextStepDraft):
            result = result.model_copy(update={"recommendation": candidate.next_step})

    event = SidecarEvent(
        session_id=session_id,
        event_type="steering_recommendation",
        source=EventSource.detector,
        payload={
            "decision": result.decision,
            "recommendation": result.recommendation,
            "evaluators_fired": [finding.evaluator_id for finding in findings],
            "evidence_event_ids": result.evidence_event_ids,
            "confidence": result.confidence,
            "estimated_avoided_waste": estimated_avoided_waste(findings, repo_path),
            "source": "model_assisted" if model_result else "deterministic",
        },
        metadata=EventMeta(repo_path=str(repo_path)),
    )
    return result, findings, event


def estimated_avoided_waste(findings: list[EvaluatorFinding], repo_path: Path) -> dict:
    """k-calibrated estimate of the waste this intervention likely avoided.

    Iteration counts come from measured shadow-mode (control arm) outcomes when
    calibration data exists, seed values otherwise. Always labeled approximate:
    a per-event counterfactual is an estimate by nature; only the arm-level
    comparison is a measurement.
    """
    if not findings:
        return {"iterations": 0.0, "cost_usd": 0.0, "precision": "approximate", "basis": "k-calibration"}
    calibration = load_k_calibration(repo_path)
    iterations = max(calibration.get(finding.evaluator_id, 0.0) for finding in findings)
    return {"iterations": iterations, "cost_usd": 0.0, "precision": "approximate", "basis": "k-calibration"}


def finding_events(findings: list[EvaluatorFinding], *, session_id: str, repo_path: Path) -> list[SidecarEvent]:
    event_type_by_id = {
        "repeated_command": "loop_detected",
        "failed_test_loop": "loop_detected",
        "repeated_edit": "loop_detected",
        "missing_validation": "validation_missing",
        "task_drift": "task_drift_detected",
    }
    events: list[SidecarEvent] = []
    for finding in findings:
        events.append(
            SidecarEvent(
                session_id=session_id,
                event_type=event_type_by_id.get(finding.evaluator_id, "loop_detected"),
                source=EventSource.detector,
                payload={
                    **finding.model_dump(mode="json"),
                    "evidence_event_ids": finding.evidence_event_ids,
                },
                metadata=EventMeta(repo_path=str(repo_path), confidence=finding.confidence),
            )
        )
    return events


def _steer_prompt(findings: list[EvaluatorFinding], events: list[SidecarEvent]) -> str:
    recent = [event.model_dump(mode="json") for event in events[-8:]]
    return f"Detector findings:\n{[finding.model_dump(mode='json') for finding in findings]}\n\nRecent events:\n{recent}"


def _next_step_prompt(result: SteerResult, events: list[SidecarEvent]) -> str:
    failures = [event.payload for event in events if event.event_type == "test_failure_observed"]
    edits = [event.payload for event in events if event.event_type == "file_edit_observed"]
    return f"Decision: {result.model_dump_json()}\nFailures: {failures[-3:]}\nEdits: {edits[-3:]}"


def _prompt_template(name: str) -> str:
    return resources.files("agent_sidecar.models.prompts").joinpath(name).read_text(encoding="utf-8")
