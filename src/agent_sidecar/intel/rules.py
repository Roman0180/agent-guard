from __future__ import annotations

from agent_sidecar.schema.config import SidecarConfig
from agent_sidecar.schema.model_io import EvaluatorFinding


def apply_rule_gates(findings: list[EvaluatorFinding], config: SidecarConfig) -> list[EvaluatorFinding]:
    gated: list[EvaluatorFinding] = []
    for finding in findings:
        if finding.evaluator_id == "failed_test_loop" and not config.rules.warn_on_repeated_failed_tests:
            continue
        if finding.evaluator_id == "task_drift" and not config.rules.warn_on_out_of_scope_edits:
            continue
        gated.append(finding)
    return gated
