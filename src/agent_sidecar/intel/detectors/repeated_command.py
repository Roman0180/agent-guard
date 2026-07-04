from __future__ import annotations

from collections import defaultdict

from agent_sidecar.intel.normalize import command_from_event
from agent_sidecar.schema.model_io import EvaluatorFinding, WasteEstimate
from agent_sidecar.schema.session import Precision
from agent_sidecar.schema.events import SidecarEvent


def detect(events: list[SidecarEvent]) -> list[EvaluatorFinding]:
    by_command: dict[str, list[SidecarEvent]] = defaultdict(list)
    failed_by_command: dict[str, list[SidecarEvent]] = defaultdict(list)
    for event in events:
        if event.event_type not in {"agent_tool_observed", "test_run_observed", "test_failure_observed"}:
            continue
        command = command_from_event(event)
        if not command:
            continue
        by_command[command].append(event)
        exit_code = event.payload.get("exit_code") or event.payload.get("exit")
        if event.event_type == "test_failure_observed" or exit_code not in (None, 0, "0"):
            failed_by_command[command].append(event)

    findings: list[EvaluatorFinding] = []
    for command, matches in by_command.items():
        failed = failed_by_command.get(command, [])
        if len(failed) >= 2:
            findings.append(_finding(command, failed, 0.86, "warn", "same failed command repeated"))
        elif len(matches) >= 3:
            findings.append(_finding(command, matches, 0.82, "warn", "same command repeated"))
    return findings


def _finding(command: str, matches: list[SidecarEvent], confidence: float, severity: str, reason: str) -> EvaluatorFinding:
    return EvaluatorFinding(
        evaluator_id="repeated_command",
        severity=severity,  # type: ignore[arg-type]
        confidence=confidence,
        evidence_event_ids=[event.event_id for event in matches[-3:]],
        summary=f"{reason}: `{command}`",
        recommendation="Stop rerunning the same command and inspect the failure before trying again.",
        estimated_waste=WasteEstimate(repeated_actions=max(0, len(matches) - 1), cost_usd=None, precision=Precision.approximate),
    )
