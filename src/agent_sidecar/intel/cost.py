from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from importlib import resources
from pathlib import Path
from typing import Any

from agent_sidecar.schema.config import SidecarConfig
from agent_sidecar.schema.events import SidecarEvent
from agent_sidecar.schema.model_io import CostEstimate
from agent_sidecar.schema.session import Precision, SessionRecord


FALLBACK_PRICE_MAP: dict[str, dict[str, float]] = {
    "claude-sonnet-4": {"input": 0.000003, "output": 0.000015, "cache_read": 0.0000003},
    "claude-3-5-sonnet": {"input": 0.000003, "output": 0.000015, "cache_read": 0.0000003},
    "deepseek-r1:8b": {"input": 0.0, "output": 0.0, "cache_read": 0.0},
    "deepseek-ai/DeepSeek-V4-Flash": {"input": 0.0, "output": 0.0, "cache_read": 0.0},
    "openai/deepseek-ai/DeepSeek-V4-Flash": {"input": 0.0, "output": 0.0, "cache_read": 0.0},
    "deepseek-v4-flash": {"input": 0.00000014, "output": 0.00000028, "cache_read": 0.0000000028},
    "deepseek/deepseek-v4-flash": {"input": 0.00000014, "output": 0.00000028, "cache_read": 0.0000000028},
    "kimi-linear-48b-a3b": {"input": 0.0, "output": 0.0, "cache_read": 0.0},
    "batiai/qwen3.6-35b:iq4": {"input": 0.0, "output": 0.0, "cache_read": 0.0},
    "qwen3-coder:30b": {"input": 0.0, "output": 0.0, "cache_read": 0.0},
    "Qwen/Qwen3-Coder-Next": {"input": 0.0, "output": 0.0, "cache_read": 0.0},
    "openai/Qwen/Qwen3-Coder-Next": {"input": 0.0, "output": 0.0, "cache_read": 0.0},
    "llama3:latest": {"input": 0.0, "output": 0.0, "cache_read": 0.0},
    "openai/llama3:latest": {"input": 0.0, "output": 0.0, "cache_read": 0.0},
}
PRICE_MAP_ATTRIBUTION = "LiteLLM model_cost map, normalized to USD-per-token fields used by Agent Sidecar."


def token_estimate(text: str) -> int:
    return max(1, math.ceil(len(text) / 4))


def session_cost(record: SessionRecord, events: list[SidecarEvent], config: SidecarConfig, repo_path: Path) -> dict[str, Any]:
    measured = _measured_from_api_requests(events)
    if measured:
        return measured
    measured = _latest_cost(events, Precision.measured)
    if measured:
        return measured
    if record.cost_usd and record.cost_usd.precision == Precision.measured:
        return {
            "cost_usd": {"value": record.cost_usd.value, "precision": record.cost_usd.precision.value},
            "tokens": record.tokens.model_dump(mode="json") if record.tokens else None,
            "model": record.model,
            "tier": "measured",
        }
    priced = _priced_from_tokens(record, events, config, repo_path)
    if priced:
        return priced
    chars = sum(len(str(event.payload.get("prompt") or event.payload.get("refined_prompt") or "")) for event in events)
    tokens = token_estimate("x" * chars) if chars else 0
    return {
        "cost_usd": {"value": 0.0, "precision": Precision.approximate.value},
        "tokens": {"input": tokens, "output": 0, "cache_read": 0, "precision": Precision.approximate.value},
        "model": record.model,
        "tier": "approximate",
    }


def price_tokens(model: str | None, input_tokens: int, output_tokens: int, cache_read_tokens: int, config: SidecarConfig, repo_path: Path) -> CostEstimate:
    prices = load_price_map(config, repo_path).get(model or "", {})
    if not prices:
        return CostEstimate(value=0.0, precision=Precision.approximate)
    value = (
        input_tokens * float(prices.get("input", 0.0))
        + output_tokens * float(prices.get("output", 0.0))
        + cache_read_tokens * float(prices.get("cache_read", 0.0))
    )
    return CostEstimate(value=round(value, 6), precision=Precision.priced)


def load_price_map(config: SidecarConfig, repo_path: Path) -> dict[str, dict[str, float]]:
    path = Path(config.cost.price_map)
    if not path.is_absolute():
        path = repo_path / path
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return normalize_price_map_payload(data)
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            pass
    return bundled_price_map()


def bundled_price_map() -> dict[str, dict[str, float]]:
    try:
        text = resources.files("agent_sidecar.data").joinpath("litellm_prices.json").read_text(encoding="utf-8")
        return normalize_price_map_payload(json.loads(text))
    except (FileNotFoundError, ModuleNotFoundError, json.JSONDecodeError, TypeError, ValueError):
        return FALLBACK_PRICE_MAP


def normalize_price_map_payload(data: dict[str, Any]) -> dict[str, dict[str, float]]:
    models = data.get("models") if isinstance(data.get("models"), dict) else data
    normalized: dict[str, dict[str, float]] = {}
    for name, value in models.items():
        if str(name).startswith("_") or not isinstance(value, dict):
            continue
        input_cost = value.get("input", value.get("input_cost_per_token", 0.0))
        output_cost = value.get("output", value.get("output_cost_per_token", 0.0))
        cache_cost = value.get("cache_read", value.get("cache_read_input_token_cost", value.get("cache_read_cost_per_token", 0.0)))
        try:
            normalized[str(name)] = {"input": float(input_cost or 0.0), "output": float(output_cost or 0.0), "cache_read": float(cache_cost or 0.0)}
        except (TypeError, ValueError):
            continue
    return normalized or FALLBACK_PRICE_MAP


def price_map_metadata(config: SidecarConfig, repo_path: Path) -> dict[str, Any]:
    path = Path(config.cost.price_map)
    if not path.is_absolute():
        path = repo_path / path
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            meta = data.get("_meta") if isinstance(data, dict) else None
            if isinstance(meta, dict):
                return meta
        except (OSError, json.JSONDecodeError):
            pass
    try:
        data = json.loads(resources.files("agent_sidecar.data").joinpath("litellm_prices.json").read_text(encoding="utf-8"))
        meta = data.get("_meta") if isinstance(data, dict) else None
        if isinstance(meta, dict):
            return meta
    except (FileNotFoundError, ModuleNotFoundError, json.JSONDecodeError):
        pass
    return {"source": "fallback", "attribution": PRICE_MAP_ATTRIBUTION}


def refresh_price_map(config: SidecarConfig, repo_path: Path) -> Path:
    import litellm

    source = getattr(litellm, "model_cost", {}) or {}
    models = normalize_price_map_payload(source)
    path = Path(config.cost.price_map)
    if not path.is_absolute():
        path = repo_path / path
    payload = {
        "_meta": {
            "source": "litellm.model_cost",
            "snapshot_date": datetime.now(timezone.utc).date().isoformat(),
            "refreshed_at": datetime.now(timezone.utc).isoformat(),
            "model_count": len(models),
            "attribution": PRICE_MAP_ATTRIBUTION,
            "units": "USD per token",
        },
        "models": models,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def _latest_cost(events: list[SidecarEvent], precision: Precision) -> dict[str, Any] | None:
    for event in reversed(events):
        if event.event_type != "cost_estimate_updated" or event.payload.get("precision") != precision.value:
            continue
        input_tokens = int(event.payload.get("gen_ai.usage.input_tokens") or 0)
        output_tokens = int(event.payload.get("gen_ai.usage.output_tokens") or 0)
        cache_read = int(event.payload.get("gen_ai.usage.cache_read_tokens") or 0)
        cost = float(event.payload.get("cost_usd") or 0.0)
        if input_tokens + output_tokens + cache_read == 0 and cost == 0:
            continue
        return {
            "cost_usd": {"value": cost, "precision": precision.value},
            "tokens": {
                "input": input_tokens,
                "output": output_tokens,
                "cache_read": cache_read,
                "precision": precision.value,
            },
            "model": event.payload.get("gen_ai.request.model"),
            "tier": precision.value,
        }
    return None


def _measured_from_api_requests(events: list[SidecarEvent]) -> dict[str, Any] | None:
    rows = _api_request_rows(events)
    if not rows:
        return None
    input_tokens = sum(row["input"] for row in rows)
    output_tokens = sum(row["output"] for row in rows)
    cache_read = sum(row["cache_read"] for row in rows)
    cache_create = sum(row["cache_create"] for row in rows)
    cost = round(sum(row["cost"] for row in rows), 6)
    models = sorted({row["model"] for row in rows if row["model"]})
    return {
        "cost_usd": {"value": cost, "precision": Precision.measured.value},
        "tokens": {
            "input": input_tokens,
            "output": output_tokens,
            "cache_read": cache_read,
            "cache_create": cache_create,
            "precision": Precision.measured.value,
        },
        "model": models[0] if len(models) == 1 else ("multiple" if models else None),
        "tier": Precision.measured.value,
        "requests": len(rows),
    }


def _api_request_rows(events: list[SidecarEvent]) -> list[dict[str, Any]]:
    rows: dict[str, dict[str, Any]] = {}
    fallback_rows: list[dict[str, Any]] = []
    for event in events:
        if event.event_type != "cost_estimate_updated" or event.payload.get("precision") != Precision.measured.value:
            continue
        payload = event.payload
        raw = payload.get("raw_otel") if isinstance(payload.get("raw_otel"), dict) else {}
        found_raw_request = False
        for row, key in _raw_api_request_rows(raw):
            if _row_has_usage(row):
                rows[key] = row
                found_raw_request = True
        if not found_raw_request:
            row = {
                "model": str(payload.get("gen_ai.request.model") or ""),
                "source": "top_level_fallback",
                "input": _as_int(payload.get("gen_ai.usage.input_tokens")),
                "output": _as_int(payload.get("gen_ai.usage.output_tokens")),
                "cache_read": _as_int(payload.get("gen_ai.usage.cache_read_tokens")),
                "cache_create": _as_int(payload.get("gen_ai.usage.cache_creation_tokens")),
                "cost": _as_float(payload.get("cost_usd")),
            }
            if _row_has_usage(row):
                fallback_rows.append(row)
    return list(rows.values()) or fallback_rows


def _raw_api_request_rows(raw: dict[str, Any]) -> list[tuple[dict[str, Any], str]]:
    rows: list[tuple[dict[str, Any], str]] = []
    for resource in raw.get("resourceLogs") or []:
        for scope in resource.get("scopeLogs") or []:
            for record in scope.get("logRecords") or []:
                if ((record.get("body") or {}).get("stringValue")) != "claude_code.api_request":
                    continue
                attrs = _attrs_to_dict(record.get("attributes") or [])
                row = {
                    "model": str(attrs.get("model") or ""),
                    "source": str(attrs.get("query_source") or "unknown"),
                    "input": _as_int(attrs.get("input_tokens")),
                    "output": _as_int(attrs.get("output_tokens")),
                    "cache_read": _as_int(attrs.get("cache_read_tokens")),
                    "cache_create": _as_int(attrs.get("cache_creation_tokens")),
                    "cost": _as_float(attrs.get("cost_usd")),
                }
                fallback_key = (
                    attrs.get("event.timestamp"),
                    row["model"],
                    row["source"],
                    row["input"],
                    row["output"],
                    row["cache_read"],
                    row["cache_create"],
                    row["cost"],
                )
                rows.append((row, str(attrs.get("request_id") or fallback_key)))
    return rows


def _attrs_to_dict(attrs: list[dict[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for attr in attrs:
        key = attr.get("key")
        if isinstance(key, str):
            result[key] = _otel_value(attr.get("value") or {})
    return result


def _otel_value(value: dict[str, Any]) -> Any:
    for key in ("stringValue", "intValue", "doubleValue", "boolValue"):
        if key in value:
            return value[key]
    return None


def _as_int(raw: Any) -> int:
    try:
        return int(float(raw or 0))
    except (TypeError, ValueError):
        return 0


def _as_float(raw: Any) -> float:
    try:
        return float(raw or 0.0)
    except (TypeError, ValueError):
        return 0.0


def _row_has_usage(row: dict[str, Any]) -> bool:
    return row["input"] + row["output"] + row["cache_read"] + row["cache_create"] > 0 or row["cost"] > 0


def _priced_from_tokens(record: SessionRecord, events: list[SidecarEvent], config: SidecarConfig, repo_path: Path) -> dict[str, Any] | None:
    tokens = record.tokens
    model = record.model
    if not tokens:
        latest = next((event for event in reversed(events) if event.event_type == "cost_estimate_updated"), None)
        if not latest:
            return None
        model = str(latest.payload.get("gen_ai.request.model") or "")
        input_tokens = int(latest.payload.get("gen_ai.usage.input_tokens") or 0)
        output_tokens = int(latest.payload.get("gen_ai.usage.output_tokens") or 0)
        cache_read = int(latest.payload.get("gen_ai.usage.cache_read_tokens") or 0)
    else:
        input_tokens, output_tokens, cache_read = tokens.input, tokens.output, tokens.cache_read
    priced = price_tokens(model, input_tokens, output_tokens, cache_read, config, repo_path)
    return {
        "cost_usd": {"value": priced.value, "precision": priced.precision.value},
        "tokens": {"input": input_tokens, "output": output_tokens, "cache_read": cache_read, "precision": priced.precision.value},
        "model": model,
        "tier": priced.precision.value,
    }
