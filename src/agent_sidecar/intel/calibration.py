from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from agent_sidecar.intel.steering import collect_findings
from agent_sidecar.schema.config import SidecarConfig
from agent_sidecar.store.jsonl import read_events


class CalibrationCase(BaseModel):
    trace: str
    expected_evaluators: list[str] = Field(default_factory=list)
    note: str | None = None


class EvaluatorCalibration(BaseModel):
    evaluator_id: str
    true_positive: int = 0
    false_positive: int = 0
    false_negative: int = 0
    precision: float = 0.0
    recall: float = 0.0
    observed_confidence_min: float | None = None
    observed_confidence_max: float | None = None


class CalibrationReport(BaseModel):
    cases: int
    evaluators: list[EvaluatorCalibration]


def load_cases(path: Path) -> list[CalibrationCase]:
    cases: list[CalibrationCase] = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                cases.append(CalibrationCase.model_validate(json.loads(line)))
    return cases


def calibrate(label_path: Path, *, config: SidecarConfig | None = None, base_dir: Path | None = None) -> CalibrationReport:
    config = config or SidecarConfig()
    base_dir = base_dir or Path.cwd()
    totals: dict[str, dict[str, Any]] = {}
    cases = load_cases(label_path)
    for case in cases:
        trace_path = Path(case.trace)
        if not trace_path.is_absolute():
            trace_path = base_dir / trace_path
        findings = collect_findings(read_events(trace_path), config)
        actual = {finding.evaluator_id for finding in findings}
        expected = set(case.expected_evaluators)
        for evaluator_id in actual | expected:
            totals.setdefault(evaluator_id, {"tp": 0, "fp": 0, "fn": 0, "conf": []})
        for finding in findings:
            totals[finding.evaluator_id]["conf"].append(finding.confidence)
        for evaluator_id in actual & expected:
            totals[evaluator_id]["tp"] += 1
        for evaluator_id in actual - expected:
            totals[evaluator_id]["fp"] += 1
        for evaluator_id in expected - actual:
            totals[evaluator_id]["fn"] += 1

    evaluators: list[EvaluatorCalibration] = []
    for evaluator_id, counts in sorted(totals.items()):
        tp = int(counts["tp"])
        fp = int(counts["fp"])
        fn = int(counts["fn"])
        confidence = counts["conf"]
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        evaluators.append(
            EvaluatorCalibration(
                evaluator_id=evaluator_id,
                true_positive=tp,
                false_positive=fp,
                false_negative=fn,
                precision=round(precision, 4),
                recall=round(recall, 4),
                observed_confidence_min=min(confidence) if confidence else None,
                observed_confidence_max=max(confidence) if confidence else None,
            )
        )
    return CalibrationReport(cases=len(cases), evaluators=evaluators)
