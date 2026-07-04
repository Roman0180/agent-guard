from __future__ import annotations

from agent_sidecar.schema.model_io import EvaluatorFinding, SteerResult


_SEVERITY_WEIGHT = {"warn": 2, "suggest": 1, "info": 0}


def rank_findings(findings: list[EvaluatorFinding]) -> list[EvaluatorFinding]:
    return sorted(findings, key=lambda finding: (_SEVERITY_WEIGHT[finding.severity], finding.confidence), reverse=True)


def deterministic_decision(findings: list[EvaluatorFinding]) -> SteerResult:
    ranked = rank_findings(findings)
    if not ranked:
        return SteerResult(decision="continue", recommendation="Continue with the current task.", evidence_event_ids=[], confidence=0.6)
    top = ranked[0]
    decision = "warn" if top.severity == "warn" or top.confidence >= 0.8 else "suggest"
    return SteerResult(
        decision=decision,
        recommendation=top.recommendation or top.summary,
        evidence_event_ids=top.evidence_event_ids,
        confidence=top.confidence,
    )
