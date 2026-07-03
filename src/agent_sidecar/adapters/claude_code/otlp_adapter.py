from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from uuid import uuid4

from google.protobuf.json_format import MessageToDict
from opentelemetry.proto.collector.logs.v1.logs_service_pb2 import ExportLogsServiceRequest
from opentelemetry.proto.collector.metrics.v1.metrics_service_pb2 import ExportMetricsServiceRequest

from agent_sidecar.schema.events import EventMeta, EventSource, SidecarEvent, ensure_session_id


ADAPTER_VERSION = "claude-otlp-v1"


def events_from_otlp_json(payload: dict[str, Any], *, default_repo_path: str | None = None) -> list[SidecarEvent]:
    flattened = list(_walk(payload))
    session = _first_value(flattened, {"session.id", "session_id", "claude_code.session.id", "claude.session.id"}) or "telemetry-orphans"
    repo_path = _first_value(flattened, {"repo.path", "repo_path", "cwd", "process.command_args"}) or default_repo_path or str(Path.cwd())
    model = _first_value(flattened, {"gen_ai.request.model", "model", "model_name"})
    input_tokens = _numeric_metric(payload, {"gen_ai.usage.input_tokens", "input_tokens", "tokens.input"})
    output_tokens = _numeric_metric(payload, {"gen_ai.usage.output_tokens", "output_tokens", "tokens.output"})
    cache_tokens = _numeric_metric(payload, {"gen_ai.usage.cache_read_tokens", "cache_read_tokens", "tokens.cache_read"})
    cost = _numeric_metric(payload, {"gen_ai.usage.cost", "gen_ai.cost", "cost_usd", "cost"})
    if not any(value is not None for value in [input_tokens, output_tokens, cache_tokens, cost, model]):
        return []
    event = SidecarEvent(
        event_id=str(uuid4()),
        session_id=ensure_session_id(str(session)),
        event_type="cost_estimate_updated",
        source=EventSource.otlp,
        payload={
            "gen_ai.request.model": model,
            "gen_ai.usage.input_tokens": int(input_tokens or 0),
            "gen_ai.usage.output_tokens": int(output_tokens or 0),
            "gen_ai.usage.cache_read_tokens": int(cache_tokens or 0),
            "cost_usd": float(cost or 0),
            "precision": "measured",
            "raw_otel": payload,
        },
        metadata=EventMeta(repo_path=str(repo_path), adapter_version=ADAPTER_VERSION),
    )
    return [event]


def events_from_otlp_protobuf(body: bytes, *, kind: str, default_repo_path: str | None = None) -> list[SidecarEvent]:
    message = ExportMetricsServiceRequest() if kind == "metrics" else ExportLogsServiceRequest()
    message.ParseFromString(body)
    payload = MessageToDict(message, preserving_proto_field_name=False)
    return events_from_otlp_json(payload, default_repo_path=default_repo_path)


def _walk(value: Any) -> list[tuple[str, Any]]:
    found: list[tuple[str, Any]] = []
    if isinstance(value, dict):
        if "key" in value and "value" in value:
            found.append((str(value["key"]), _otel_value(value["value"])))
        if "name" in value:
            found.append((str(value["name"]), _metric_value(value)))
        for key, child in value.items():
            found.append((str(key), child))
            found.extend(_walk(child))
    elif isinstance(value, list):
        for child in value:
            found.extend(_walk(child))
    return found


def _first_value(items: list[tuple[str, Any]], keys: set[str]) -> Any:
    for key, value in items:
        if key in keys and value not in (None, ""):
            return value
    return None


def _numeric_metric(payload: dict[str, Any], names: set[str]) -> float | None:
    # Direct simplified payload support.
    for name in names:
        direct = payload.get(name)
        if isinstance(direct, int | float):
            return float(direct)
    for key in ["metrics", "usage"]:
        child = payload.get(key)
        if isinstance(child, dict):
            for name in names:
                direct = child.get(name)
                if isinstance(direct, int | float):
                    return float(direct)

    for key, value in _walk(payload):
        if key in names:
            number = _number(value)
            if number is not None:
                return number
    return None


def _otel_value(value: Any) -> Any:
    if not isinstance(value, dict):
        return value
    for key in ["stringValue", "intValue", "doubleValue", "boolValue", "asString", "asInt", "asDouble"]:
        if key in value:
            return value[key]
    return value


def _metric_value(value: dict[str, Any]) -> Any:
    for container_key in ["sum", "gauge"]:
        container = value.get(container_key)
        if isinstance(container, dict):
            points = container.get("dataPoints") or container.get("data_points") or []
            if points:
                return _point_value(points[-1])
    return None


def _point_value(point: dict[str, Any]) -> Any:
    for key in ["asInt", "asDouble", "intValue", "doubleValue"]:
        if key in point:
            return point[key]
    return None


def _number(value: Any) -> float | None:
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


def parse_json_bytes(body: bytes) -> dict[str, Any]:
    return json.loads(body.decode("utf-8"))
