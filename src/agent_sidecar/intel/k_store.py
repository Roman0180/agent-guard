"""Per-detector k calibration: how many wasteful iterations typically follow a
detection when nothing intervenes.

Values are measured from control-arm (shadow mode) sessions by
`agent-sidecar dev calibrate-k`. Until enough shadow data exists, the seed
values below apply; every estimate derived from them is labeled approximate.
"""
from __future__ import annotations

import json
from pathlib import Path

from agent_sidecar.schema.config import config_dir


# Seed medians (iterations of post-detection waste). Deliberately conservative;
# replaced by measured medians as shadow data accumulates.
K_SEED: dict[str, float] = {
    "failed_test_loop": 2.0,
    "repeated_command": 2.0,
    "repeated_edit": 2.0,
    "missing_validation": 1.0,
    "task_drift": 2.0,
}


def k_calibration_path(repo_path: Path) -> Path:
    return config_dir(repo_path) / "calibration" / "steering_k.json"


def load_k_calibration(repo_path: Path) -> dict[str, float]:
    path = k_calibration_path(repo_path)
    values = dict(K_SEED)
    if path.exists():
        try:
            stored = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return values
        for evaluator_id, entry in stored.get("evaluators", {}).items():
            median = entry.get("median_extra_iterations") if isinstance(entry, dict) else None
            if isinstance(median, (int, float)) and median >= 0:
                values[evaluator_id] = float(median)
    return values


def save_k_calibration(repo_path: Path, evaluators: dict[str, dict]) -> Path:
    path = k_calibration_path(repo_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"version": 1, "evaluators": evaluators}, indent=2) + "\n", encoding="utf-8")
    return path
