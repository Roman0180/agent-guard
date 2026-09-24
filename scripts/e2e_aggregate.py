"""Aggregate multiple e2e runs into one summary (per-run table + medians).

Reads each run's structured artifacts (raw-telemetry-compare.json, the Claude
duration files, and the optional DeepSeek eval) and prints a table of every run
plus medians — so a single noisy paired run can't decide the cost/latency story.

Usage: python scripts/e2e_aggregate.py <artifact_dir> [<artifact_dir> ...]
"""
from __future__ import annotations

import json
import statistics
import sys
from pathlib import Path
from typing import Any


def _read_json(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _elapsed_ms(path: Path) -> int | None:
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.partition("=")
            if sep and key.strip() == "elapsed_ms":
                return int(value.strip())
    except (OSError, ValueError):
        return None
    return None


def load_run(artifact_dir: Path) -> dict[str, Any]:
    """Collect one run's numbers. Missing pieces are left as None (run marked incomplete)."""
    compare = _read_json(artifact_dir / "raw-telemetry-compare.json") or {}
    baseline = compare.get("baseline") or {}
    sidecar = compare.get("sidecar") or {}
    token_total = ((compare.get("token_savings") or {}).get("total")) or {}
    quality = _read_json(artifact_dir / "deepseek.implementation-eval.json") or {}

    baseline_ms = _elapsed_ms(artifact_dir / "claude.baseline.duration.txt")
    sidecar_ms = _elapsed_ms(artifact_dir / "claude.sidecar.duration.txt")

    baseline_cost = baseline.get("cost")
    sidecar_cost = sidecar.get("cost")
    return {
        "run": artifact_dir.name,
        "baseline_cost": baseline_cost,
        "sidecar_cost": sidecar_cost,
        # Positive = Sidecar saved money.
        "cost_saved_usd": compare.get("delta_cost_usd"),
        "cost_saved_pct": compare.get("cost_savings_pct"),
        "tokens_saved": token_total.get("saved"),
        "tokens_saved_pct": token_total.get("savings_pct"),
        "baseline_ms": baseline_ms,
        "sidecar_ms": sidecar_ms,
        # Positive = Sidecar slower.
        "latency_delta_ms": (sidecar_ms - baseline_ms) if baseline_ms and sidecar_ms else None,
        "quality_preserved": quality.get("quality_preserved"),
        "complete": baseline_cost is not None and sidecar_cost is not None,
    }


def _median(values: list[float]) -> float | None:
    return round(statistics.median(values), 6) if values else None


def summarize(runs: list[dict[str, Any]]) -> dict[str, Any]:
    complete = [r for r in runs if r.get("complete")]
    cost_saved = [r["cost_saved_usd"] for r in complete if isinstance(r.get("cost_saved_usd"), (int, float))]
    cost_pct = [r["cost_saved_pct"] for r in complete if isinstance(r.get("cost_saved_pct"), (int, float))]
    lat = [r["latency_delta_ms"] for r in complete if isinstance(r.get("latency_delta_ms"), (int, float))]
    tok = [r["tokens_saved"] for r in complete if isinstance(r.get("tokens_saved"), (int, float))]
    graded = [r for r in complete if isinstance(r.get("quality_preserved"), bool)]
    preserved = [r for r in graded if r["quality_preserved"]]
    return {
        "runs": len(runs),
        "complete_runs": len(complete),
        "median_cost_saved_usd": _median(cost_saved),
        "median_cost_saved_pct": _median(cost_pct),
        "median_latency_delta_ms": _median(lat),
        "median_tokens_saved": _median(tok),
        "quality_preserved": f"{len(preserved)}/{len(graded)}" if graded else "n/a",
    }


def render(runs: list[dict[str, Any]], summary: dict[str, Any]) -> str:
    lines = ["", "== Multi-run summary =="]
    header = f"{'Run':<20} {'Base $':>9} {'Side $':>9} {'Saved $':>9} {'Saved %':>8} {'Base s':>7} {'Side s':>7} {'Δ lat s':>8} {'Quality':>8}"
    lines.append(header)
    lines.append("-" * len(header))
    for r in runs:
        def usd(v):
            return f"{v:.4f}" if isinstance(v, (int, float)) else "—"

        def sec(ms):
            return f"{ms / 1000:.1f}" if isinstance(ms, (int, float)) else "—"

        def pct(v):
            return f"{v:+.1f}" if isinstance(v, (int, float)) else "—"

        quality = "—"
        if isinstance(r.get("quality_preserved"), bool):
            quality = "keep" if r["quality_preserved"] else "REGRESS"
        lines.append(
            f"{r['run']:<20} {usd(r.get('baseline_cost')):>9} {usd(r.get('sidecar_cost')):>9} "
            f"{usd(r.get('cost_saved_usd')):>9} {pct(r.get('cost_saved_pct')):>8} "
            f"{sec(r.get('baseline_ms')):>7} {sec(r.get('sidecar_ms')):>7} "
            f"{pct(r.get('latency_delta_ms')/1000 if isinstance(r.get('latency_delta_ms'), (int, float)) else None):>8} {quality:>8}"
        )
    lines.append("")
    lines.append(f"Runs: {summary['complete_runs']}/{summary['runs']} complete")
    mc = summary["median_cost_saved_usd"]
    mcp = summary["median_cost_saved_pct"]
    ml = summary["median_latency_delta_ms"]
    mt = summary["median_tokens_saved"]
    if mc is not None:
        if mc >= 0:
            lines.append(f"Median: Sidecar saved ${mc:.6f} ({mcp:+.1f}%)")
        else:
            lines.append(f"Median: Sidecar cost ${abs(mc):.6f} extra ({mcp:+.1f}%)")
    if ml is not None:
        verb = "slower" if ml >= 0 else "faster"
        lines.append(f"Median latency: Sidecar {abs(ml) / 1000:.1f}s {verb}")
    if mt is not None:
        lines.append(f"Median tokens saved: {int(mt)}")
    lines.append(f"Quality preserved: {summary['quality_preserved']}")
    return "\n".join(lines)


def main() -> int:
    dirs = [Path(arg) for arg in sys.argv[1:]]
    if not dirs:
        print("usage: e2e_aggregate.py <artifact_dir> [<artifact_dir> ...]", file=sys.stderr)
        return 2
    runs = [load_run(d) for d in dirs]
    summary = summarize(runs)
    print(render(runs, summary))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
