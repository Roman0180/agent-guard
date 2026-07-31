from __future__ import annotations

import json
from pathlib import Path

from agent_sidecar.adapters.claude_code.hook_script import steering_context_output
from agent_sidecar.intel.k_store import K_SEED, load_k_calibration, save_k_calibration
from agent_sidecar.intel.measurement import assigned_arm, calibrate_k, finding_fingerprint
from agent_sidecar.intel.steering import estimated_avoided_waste
from agent_sidecar.schema.config import SidecarConfig
from agent_sidecar.schema.events import EventMeta, EventSource, SidecarEvent
from agent_sidecar.schema.model_io import EvaluatorFinding, WasteEstimate
from agent_sidecar.schema.session import Precision
from agent_sidecar.store.sessions import SessionManager


def _config(fraction: float) -> SidecarConfig:
    config = SidecarConfig()
    config.measurement.control_fraction = fraction
    return config


def test_arm_assignment_disabled_and_full_fractions() -> None:
    assert assigned_arm("cc-anything", _config(0.0)) == "assist"
    assert assigned_arm("cc-anything", _config(1.0)) == "control"


def test_arm_assignment_is_deterministic_and_roughly_proportional() -> None:
    config = _config(0.3)
    ids = [f"cc-session-{index}" for index in range(400)]
    arms = [assigned_arm(session_id, config) for session_id in ids]
    assert arms == [assigned_arm(session_id, config) for session_id in ids]
    control_share = arms.count("control") / len(arms)
    assert 0.2 < control_share < 0.4


def test_k_store_roundtrip_overrides_seed(tmp_path: Path) -> None:
    assert load_k_calibration(tmp_path) == K_SEED
    save_k_calibration(tmp_path, {"failed_test_loop": {"median_extra_iterations": 4.0, "samples": 7}})
    values = load_k_calibration(tmp_path)
    assert values["failed_test_loop"] == 4.0
    assert values["repeated_edit"] == K_SEED["repeated_edit"]


def test_estimated_avoided_waste_uses_calibration(tmp_path: Path) -> None:
    save_k_calibration(tmp_path, {"failed_test_loop": {"median_extra_iterations": 3.0, "samples": 5}})
    finding = EvaluatorFinding(
        evaluator_id="failed_test_loop",
        severity="warn",
        confidence=0.9,
        evidence_event_ids=["e1", "e2"],
        summary="loop",
        recommendation="stop",
        estimated_waste=WasteEstimate(repeated_actions=2, cost_usd=None, precision=Precision.approximate),
    )
    waste = estimated_avoided_waste([finding], tmp_path)
    assert waste["iterations"] == 3.0
    assert waste["precision"] == "approximate"


def _event(session_id: str, event_type: str, payload: dict) -> SidecarEvent:
    return SidecarEvent(
        session_id=session_id,
        event_type=event_type,
        source=EventSource.manual,
        payload=payload,
        metadata=EventMeta(repo_path="/tmp/repo"),
    )


def test_calibrate_k_measures_followup_waste_in_control_sessions(tmp_path: Path) -> None:
    config = _config(1.0)
    (tmp_path / ".agent-sidecar").mkdir(parents=True)
    (tmp_path / ".agent-sidecar" / "config.json").write_text(config.model_dump_json(), encoding="utf-8")
    manager = SessionManager(tmp_path)
    session_id = "cc-shadow-test"
    manager.add_event(_event(session_id, "shadow_detection", {
        "evaluator_id": "failed_test_loop",
        "evidence_event_ids": ["a", "b"],
        "fingerprint": finding_fingerprint("failed_test_loop", ["a", "b"]),
    }))
    for index in range(3):
        manager.add_event(_event(session_id, "test_failure_observed", {
            "command": "pytest",
            "normalized_command": "pytest",
            "failure_signature": f"sig-{index}",
        }))
    evaluators = calibrate_k(manager)
    assert evaluators["failed_test_loop"]["median_extra_iterations"] == 3.0
    assert evaluators["failed_test_loop"]["samples"] == 1
    assert load_k_calibration(tmp_path)["failed_test_loop"] == 3.0


def test_steering_context_output_only_for_post_tool_use() -> None:
    ingest = {"measurement": {"arm": "assist", "steering_context": "Agent Sidecar steering (warn).\nStop rerunning."}}
    output = steering_context_output({"hook_event_name": "PostToolUse"}, ingest)
    assert output["hookSpecificOutput"]["hookEventName"] == "PostToolUse"
    assert "Stop rerunning." in output["hookSpecificOutput"]["additionalContext"]
    assert steering_context_output({"hook_event_name": "UserPromptSubmit"}, ingest) is None
    assert steering_context_output({"hook_event_name": "PostToolUse"}, {"measurement": {"steering_context": None}}) is None
