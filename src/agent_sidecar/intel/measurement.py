"""Randomized measurement arms plus shadow-mode k calibration.

Design (docs/LAPTOP_PILOT_PLAN.md, measurement):
- Sessions are deterministically assigned to `assist` or `control` by hashing the
  session id against `measurement.control_fraction`. No stored state: the arm is
  derivable (and auditable) from the session id alone, on any machine.
- assist sessions receive refinement and, when `steer_on_ingest` is enabled,
  deterministic steering context delivered through the hook response.
- control sessions receive nothing, but detectors still run silently and record
  `shadow_detection` events. What actually happens after those detections is the
  measured, unsteered outcome that calibrates per-detector k (see k_store).
"""
from __future__ import annotations

import hashlib
import statistics
from pathlib import Path
from typing import Any, Literal

from agent_sidecar.intel.k_store import load_k_calibration, save_k_calibration
from agent_sidecar.intel.steering import collect_findings, steer
from agent_sidecar.schema.config import SidecarConfig
from agent_sidecar.schema.events import EventMeta, EventSource, SidecarEvent, ensure_session_id
from agent_sidecar.store.sessions import SessionManager


Arm = Literal["assist", "control"]

# Event types that count as post-detection waste, per detector. Used by shadow
# k calibration to measure what an unattended loop went on to cost.
FOLLOWUP_EVENT_TYPES: dict[str, set[str]] = {
    "failed_test_loop": {"test_failure_observed"},
    "repeated_command": {"agent_tool_observed", "test_run_observed"},
    "repeated_edit": {"file_edit_observed"},
    "missing_validation": {"file_edit_observed"},
    "task_drift": {"agent_tool_observed", "file_edit_observed"},
}
FOLLOWUP_CAP = 12


def assigned_arm(session_id: str, config: SidecarConfig) -> Arm:
    fraction = config.measurement.control_fraction
    if fraction <= 0:
        return "assist"
    digest = hashlib.sha256(ensure_session_id(session_id).encode("utf-8")).hexdigest()
    bucket = int(digest[:8], 16) / 0xFFFFFFFF
    return "control" if bucket < fraction else "assist"


def finding_fingerprint(evaluator_id: str, evidence_event_ids: list[str]) -> str:
    joined = evaluator_id + "|" + ",".join(sorted(evidence_event_ids))
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()[:16]


def measure_on_ingest(manager: SessionManager, session_id: str) -> dict[str, Any]:
    """Run after event ingest. Returns the arm and any steering context to deliver."""
    config = manager.config
    arm = assigned_arm(session_id, config)
    outcome: dict[str, Any] = {"arm": arm, "steering_context": None}
    if not config.measurement.steer_on_ingest:
        return outcome

    events = manager.events(session_id)
    findings = collect_findings(events, config)
    if not findings:
        return outcome
    seen = _seen_evaluators(events)
    new_findings = [finding for finding in findings if finding.evaluator_id not in seen]
    if not new_findings:
        return outcome

    if arm == "control":
        for finding in new_findings:
            manager.add_event(SidecarEvent(
                session_id=session_id,
                event_type="shadow_detection",
                source=EventSource.detector,
                payload={
                    "evaluator_id": finding.evaluator_id,
                    "evidence_event_ids": finding.evidence_event_ids,
                    "severity": finding.severity,
                    "confidence": finding.confidence,
                    "fingerprint": finding_fingerprint(finding.evaluator_id, finding.evidence_event_ids),
                    "arm": arm,
                },
                metadata=EventMeta(repo_path=str(manager.repo_path), confidence=finding.confidence),
            ))
        return outcome

    result, _fired, recommendation = steer(
        events, config=config, repo_path=manager.repo_path, session_id=session_id, provider=None,
    )
    if result.decision == "continue":
        return outcome
    recommendation.payload["arm"] = arm
    manager.add_event(recommendation)
    outcome["steering_context"] = _steering_context(result.decision, result.recommendation, recommendation.payload)
    return outcome


def _seen_evaluators(events: list[SidecarEvent]) -> set[str]:
    """Evaluators already surfaced in this session (delivered or shadow-logged).

    Throttle unit is the evaluator, not the evidence set: detector evidence
    windows shift as events accrue, so evidence-level dedupe would re-announce
    the same underlying problem on every tool call.
    """
    seen: set[str] = set()
    for event in events:
        if event.event_type == "shadow_detection":
            evaluator = event.payload.get("evaluator_id")
            if isinstance(evaluator, str):
                seen.add(evaluator)
        elif event.event_type == "steering_recommendation":
            fired = event.payload.get("evaluators_fired")
            if isinstance(fired, list):
                seen.update(str(item) for item in fired)
    return seen


def _steering_context(decision: str, recommendation: str, payload: dict[str, Any]) -> str:
    waste = payload.get("estimated_avoided_waste") or {}
    lines = [f"Agent Sidecar steering ({decision}).", recommendation.strip()]
    iterations = waste.get("iterations")
    if isinstance(iterations, (int, float)) and iterations > 0:
        lines.append(
            f"Unattended, this pattern typically runs ~{iterations:g} more wasted iterations (approximate, calibrated)."
        )
    return "\n".join(line for line in lines if line)


def calibrate_k(manager: SessionManager) -> dict[str, dict[str, Any]]:
    """Measure post-detection waste in control sessions; write per-detector medians."""
    samples: dict[str, list[int]] = {}
    for record in manager.list_sessions():
        if assigned_arm(record.session_id, manager.config) != "control":
            continue
        events = manager.events(record.session_id)
        for index, event in enumerate(events):
            if event.event_type != "shadow_detection":
                continue
            evaluator_id = str(event.payload.get("evaluator_id") or "")
            followup_types = FOLLOWUP_EVENT_TYPES.get(evaluator_id)
            if not followup_types:
                continue
            count = sum(
                1 for later in events[index + 1:]
                if later.event_type in followup_types
            )
            samples.setdefault(evaluator_id, []).append(min(count, FOLLOWUP_CAP))
    evaluators = {
        evaluator_id: {
            "median_extra_iterations": float(statistics.median(values)),
            "samples": len(values),
        }
        for evaluator_id, values in samples.items()
    }
    if evaluators:
        save_k_calibration(manager.repo_path, evaluators)
    return evaluators


def measurement_report(manager: SessionManager) -> dict[str, Any]:
    arms: dict[str, dict[str, Any]] = {
        "assist": _empty_arm(), "control": _empty_arm(),
    }
    for record in manager.list_sessions():
        arm = assigned_arm(record.session_id, manager.config)
        bucket = arms[arm]
        bucket["sessions"] += 1
        bucket["events"] += record.event_count
        if record.tokens:
            bucket["tokens_input"] += record.tokens.input
            bucket["tokens_output"] += record.tokens.output
            bucket["sessions_with_measured_tokens"] += 1
        if record.cost_usd:
            bucket["measured_cost_usd"] = round(bucket["measured_cost_usd"] + record.cost_usd.value, 6)
        for event in manager.events(record.session_id):
            if event.event_type == "prompt_refined":
                bucket["refinements_delivered"] += 1
            elif event.event_type == "refinement_suppressed":
                bucket["refinements_suppressed"] += 1
            elif event.event_type == "steering_recommendation":
                bucket["steering_recommendations"] += 1
            elif event.event_type == "shadow_detection":
                bucket["shadow_detections"] += 1
    return {
        "control_fraction": manager.config.measurement.control_fraction,
        "steer_on_ingest": manager.config.measurement.steer_on_ingest,
        "arms": arms,
        "k_calibration": load_k_calibration(manager.repo_path),
        "note": "Arm comparison is measured; per-event avoided-waste figures are approximate k-calibrated estimates.",
    }


def _empty_arm() -> dict[str, Any]:
    return {
        "sessions": 0,
        "events": 0,
        "tokens_input": 0,
        "tokens_output": 0,
        "sessions_with_measured_tokens": 0,
        "measured_cost_usd": 0.0,
        "refinements_delivered": 0,
        "refinements_suppressed": 0,
        "steering_recommendations": 0,
        "shadow_detections": 0,
    }
