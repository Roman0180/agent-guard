from __future__ import annotations

import math
from pathlib import Path
from typing import Any, Iterable

from agent_sidecar.gateway.traces import TraceRecord
from agent_sidecar.intel.cost import price_tokens
from agent_sidecar.schema.config import SidecarConfig


def build_report(records: Iterable[TraceRecord], config: SidecarConfig, repo_path: Path) -> dict[str, Any]:
    """Aggregate captured traces into the baseline pilot report."""
    rows = list(records)
    by_model: dict[str, dict[str, Any]] = {}
    latencies: list[int] = []
    retries = 0
    wasted_input = 0
    wasted_output = 0
    malformed = 0
    policies: dict[str, dict[str, Any]] = {}

    for record in rows:
        model = record.model or "unknown"
        entry = by_model.setdefault(model, {"requests": 0, "input": 0, "output": 0, "cache_read": 0, "cache_creation": 0})
        entry["requests"] += 1
        entry["input"] += record.usage.input
        entry["output"] += record.usage.output
        entry["cache_read"] += record.usage.cache_read
        entry["cache_creation"] += record.usage.cache_creation
        latencies.append(record.latency_ms)
        if record.is_retry:
            retries += 1
            wasted_input += record.usage.input
            wasted_output += record.usage.output
        if record.malformed_tool_call:
            malformed += 1
        for decision in record.policy_decisions:
            policy = policies.setdefault(
                decision.policy,
                {"mode": decision.mode, "decisions": 0, "enforced": 0, "projected_saved_tokens": 0, "projected_saved_usd": 0.0, "enforced_saved_tokens": 0, "enforced_saved_usd": 0.0},
            )
            policy["mode"] = decision.mode
            policy["decisions"] += 1
            if decision.enforced:
                policy["enforced"] += 1
                policy["enforced_saved_tokens"] += decision.estimated_saved_tokens
                policy["enforced_saved_usd"] = round(policy["enforced_saved_usd"] + decision.estimated_saved_usd, 6)
            else:
                policy["projected_saved_tokens"] += decision.estimated_saved_tokens
                policy["projected_saved_usd"] = round(policy["projected_saved_usd"] + decision.estimated_saved_usd, 6)

    total = len(rows)
    for model, entry in by_model.items():
        priced = price_tokens(model, entry["input"], entry["output"], entry["cache_read"], config, repo_path)
        entry["estimated_cost_usd"] = priced.value
        entry["cost_precision"] = priced.precision.value

    return {
        "requests": total,
        "by_model": by_model,
        "retry": {
            "count": retries,
            "rate_pct": round(100.0 * retries / total, 2) if total else 0.0,
            "wasted_input_tokens": wasted_input,
            "wasted_output_tokens": wasted_output,
        },
        "malformed_tool_calls": {
            "count": malformed,
            "rate_pct": round(100.0 * malformed / total, 2) if total else 0.0,
        },
        "latency_ms": {
            "p50": _percentile(latencies, 0.50),
            "p95": _percentile(latencies, 0.95),
        },
        "policies": policies,
    }


def render_terminal(report: dict[str, Any]) -> str:
    lines = ["Agent Sidecar baseline report", ""]
    lines.append(_table(
        ["Model", "Requests", "Input", "Output", "CacheRead", "Est. cost"],
        [
            [model, str(entry["requests"]), str(entry["input"]), str(entry["output"]), str(entry["cache_read"]), f"${entry['estimated_cost_usd']:.6f} ({entry['cost_precision']})"]
            for model, entry in sorted(report["by_model"].items())
        ],
    ))
    retry = report["retry"]
    malformed = report["malformed_tool_calls"]
    latency = report["latency_ms"]
    lines.extend([
        "",
        f"Requests: {report['requests']}",
        f"Retry rate: {retry['rate_pct']}% ({retry['count']} calls); wasted tokens: {retry['wasted_input_tokens']} in / {retry['wasted_output_tokens']} out",
        f"Malformed tool-call rate: {malformed['rate_pct']}% ({malformed['count']} calls)",
        f"Latency: p50 {latency['p50']}ms, p95 {latency['p95']}ms",
    ])
    if report["policies"]:
        lines.extend(["", "Policy savings (shadow = projected, enforce = actual):"])
        lines.append(_table(
            ["Policy", "Mode", "Decisions", "Projected tokens", "Projected USD", "Enforced tokens", "Enforced USD"],
            [
                [name, entry["mode"], str(entry["decisions"]), str(entry["projected_saved_tokens"]), f"${entry['projected_saved_usd']:.6f}", str(entry["enforced_saved_tokens"]), f"${entry['enforced_saved_usd']:.6f}"]
                for name, entry in sorted(report["policies"].items())
            ],
        ))
    return "\n".join(lines)


def render_markdown(report: dict[str, Any]) -> str:
    lines = ["# Agent Sidecar baseline report", ""]
    lines.append("## Usage and cost by model")
    lines.append("")
    lines.append("| Model | Requests | Input | Output | Cache read | Estimated cost |")
    lines.append("| --- | ---: | ---: | ---: | ---: | ---: |")
    for model, entry in sorted(report["by_model"].items()):
        lines.append(
            f"| {model} | {entry['requests']} | {entry['input']} | {entry['output']} | {entry['cache_read']} | ${entry['estimated_cost_usd']:.6f} ({entry['cost_precision']}) |"
        )
    retry = report["retry"]
    malformed = report["malformed_tool_calls"]
    latency = report["latency_ms"]
    lines.extend([
        "",
        "## Reliability",
        "",
        f"- Requests captured: **{report['requests']}**",
        f"- Retry rate: **{retry['rate_pct']}%** ({retry['count']} calls)",
        f"- Wasted tokens attributable to retries: **{retry['wasted_input_tokens']} input / {retry['wasted_output_tokens']} output**",
        f"- Malformed tool-call rate: **{malformed['rate_pct']}%** ({malformed['count']} calls)",
        f"- Latency: **p50 {latency['p50']}ms / p95 {latency['p95']}ms**",
    ])
    if report["policies"]:
        lines.extend([
            "",
            "## Optimization policies",
            "",
            "Shadow numbers are projected savings had the policy been enforced; enforced numbers are realized.",
            "",
            "| Policy | Mode | Decisions | Projected tokens | Projected USD | Enforced tokens | Enforced USD |",
            "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
        ])
        for name, entry in sorted(report["policies"].items()):
            lines.append(
                f"| {name} | {entry['mode']} | {entry['decisions']} | {entry['projected_saved_tokens']} | ${entry['projected_saved_usd']:.6f} | {entry['enforced_saved_tokens']} | ${entry['enforced_saved_usd']:.6f} |"
            )
    lines.append("")
    return "\n".join(lines)


def _percentile(values: list[int], fraction: float) -> int:
    if not values:
        return 0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, math.ceil(fraction * len(ordered)) - 1))
    return ordered[index]


def _table(headers: list[str], rows: list[list[str]]) -> str:
    widths = [len(header) for header in headers]
    for row in rows:
        for column, cell in enumerate(row):
            widths[column] = max(widths[column], len(cell))
    lines = [
        "  ".join(header.ljust(widths[column]) for column, header in enumerate(headers)),
        "  ".join("-" * widths[column] for column in range(len(headers))),
    ]
    for row in rows:
        lines.append("  ".join(cell.ljust(widths[column]) for column, cell in enumerate(row)))
    return "\n".join(lines)
