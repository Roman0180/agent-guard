from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any, Callable

from agent_sidecar.models.registry import ModelRegistryEntry, RegistryEval


PROMOTION_SUITE = "evals/promotion.promptfoo.yaml"
Runner = Callable[[list[str]], subprocess.CompletedProcess[str]]


def promotion_eval_from_env() -> RegistryEval | None:
    value = os.environ.get("AGENT_SIDECAR_PROMOTION_RESULT")
    if not value:
        return None
    path = Path(value)
    if path.exists():
        raw = path.read_text(encoding="utf-8")
    else:
        raw = value
    return parse_promotion_result(json.loads(raw))


def run_promotion_eval(entry: ModelRegistryEntry, *, repo_path: Path, runner: Runner | None = None) -> RegistryEval:
    injected = promotion_eval_from_env()
    if injected:
        return injected
    promptfoo = shutil.which("promptfoo")
    if not promptfoo:
        raise ValueError("promotion refused: promptfoo is not installed and AGENT_SIDECAR_PROMOTION_RESULT is not set")
    command = [
        promptfoo,
        "eval",
        "-c",
        PROMOTION_SUITE,
        "--output",
        "json",
        "--env-file",
        "/dev/null",
    ]
    completed = (runner or _run)(command)
    if completed.returncode != 0:
        raise ValueError(f"promotion refused: promptfoo failed: {completed.stderr.strip()}")
    result = parse_promotion_result(json.loads(completed.stdout or "{}"))
    if not result.passed:
        raise ValueError("promotion refused: tuned model did not pass the promotion gate")
    return result


def parse_promotion_result(payload: dict[str, Any]) -> RegistryEval:
    if {"score", "base_score", "passed"}.issubset(payload):
        score = float(payload["score"])
        base_score = float(payload["base_score"])
        passed = bool(payload["passed"]) and score > base_score
        return RegistryEval(suite=str(payload.get("suite") or PROMOTION_SUITE), score=score, base_score=base_score, passed=passed)

    stats = payload.get("stats") if isinstance(payload.get("stats"), dict) else {}
    successes = float(stats.get("successes") or 0)
    failures = float(stats.get("failures") or 0)
    total = successes + failures
    score = successes / total if total else 0.0
    base_score = float(payload.get("base_score") or 0.0)
    passed = score > base_score and failures == 0 and total > 0
    return RegistryEval(suite=str(payload.get("suite") or PROMOTION_SUITE), score=score, base_score=base_score, passed=passed)


def _run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
