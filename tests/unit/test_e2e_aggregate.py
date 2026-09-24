from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

# The aggregator lives under scripts/, not the package — load it by path.
_SPEC = importlib.util.spec_from_file_location(
    "e2e_aggregate", Path(__file__).resolve().parents[2] / "scripts" / "e2e_aggregate.py"
)
e2e_aggregate = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(e2e_aggregate)  # type: ignore[union-attr]


def _make_run(dir_path: Path, *, baseline_cost, sidecar_cost, baseline_ms, sidecar_ms, quality=None, tokens_saved=0):
    dir_path.mkdir(parents=True, exist_ok=True)
    (dir_path / "raw-telemetry-compare.json").write_text(
        json.dumps(
            {
                "baseline": {"cost": baseline_cost},
                "sidecar": {"cost": sidecar_cost},
                "delta_cost_usd": round(baseline_cost - sidecar_cost, 6),
                "cost_savings_pct": round((baseline_cost - sidecar_cost) / baseline_cost * 100, 3) if baseline_cost else 0.0,
                "token_savings": {"total": {"saved": tokens_saved, "savings_pct": 0.0}},
            }
        ),
        encoding="utf-8",
    )
    (dir_path / "claude.baseline.duration.txt").write_text(f"elapsed_ms={baseline_ms}\n", encoding="utf-8")
    (dir_path / "claude.sidecar.duration.txt").write_text(f"elapsed_ms={sidecar_ms}\n", encoding="utf-8")
    if quality is not None:
        (dir_path / "deepseek.implementation-eval.json").write_text(
            json.dumps({"quality_preserved": quality}), encoding="utf-8"
        )
    return dir_path


def test_load_run_reads_all_artifacts(tmp_path: Path) -> None:
    run = e2e_aggregate.load_run(
        _make_run(tmp_path / "r1", baseline_cost=0.28, sidecar_cost=0.30, baseline_ms=47600, sidecar_ms=61400, quality=True, tokens_saved=-500)
    )
    assert run["complete"] is True
    assert run["cost_saved_usd"] == pytest.approx(-0.02)  # sidecar cost more
    assert run["latency_delta_ms"] == 13800  # sidecar slower
    assert run["quality_preserved"] is True


def test_summarize_takes_medians_over_complete_runs(tmp_path: Path) -> None:
    runs = [
        e2e_aggregate.load_run(_make_run(tmp_path / "a", baseline_cost=0.30, sidecar_cost=0.28, baseline_ms=50000, sidecar_ms=52000, quality=True)),
        e2e_aggregate.load_run(_make_run(tmp_path / "b", baseline_cost=0.30, sidecar_cost=0.31, baseline_ms=50000, sidecar_ms=49000, quality=True)),
        e2e_aggregate.load_run(_make_run(tmp_path / "c", baseline_cost=0.30, sidecar_cost=0.27, baseline_ms=50000, sidecar_ms=51000, quality=False)),
    ]
    summary = e2e_aggregate.summarize(runs)
    assert summary["complete_runs"] == 3
    # cost_saved per run: +0.02, -0.01, +0.03 -> median +0.02
    assert summary["median_cost_saved_usd"] == pytest.approx(0.02)
    # latency delta per run: +2000, -1000, +1000 -> median +1000
    assert summary["median_latency_delta_ms"] == 1000
    assert summary["quality_preserved"] == "2/3"


def test_incomplete_run_is_excluded_from_medians(tmp_path: Path) -> None:
    good = e2e_aggregate.load_run(_make_run(tmp_path / "ok", baseline_cost=0.30, sidecar_cost=0.28, baseline_ms=50000, sidecar_ms=51000))
    broken_dir = tmp_path / "broken"
    broken_dir.mkdir()
    broken = e2e_aggregate.load_run(broken_dir)  # no artifacts

    assert broken["complete"] is False
    summary = e2e_aggregate.summarize([good, broken])
    assert summary["runs"] == 2 and summary["complete_runs"] == 1
    assert summary["median_cost_saved_usd"] == pytest.approx(0.02)

    rendered = e2e_aggregate.render([good, broken], summary)
    assert "Multi-run summary" in rendered
    assert "1/2 complete" in rendered
    assert "—" in rendered  # the broken run renders dashes, not a crash


def test_render_labels_direction(tmp_path: Path) -> None:
    run = e2e_aggregate.load_run(_make_run(tmp_path / "r", baseline_cost=0.28, sidecar_cost=0.30, baseline_ms=47600, sidecar_ms=61400, quality=True))
    summary = e2e_aggregate.summarize([run])
    out = e2e_aggregate.render([run], summary)
    assert "extra" in out            # sidecar was more expensive
    assert "Sidecar 13.8s slower" in out
