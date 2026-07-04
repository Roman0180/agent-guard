from __future__ import annotations

import json
from pathlib import Path

from opentelemetry.proto.collector.metrics.v1.metrics_service_pb2 import ExportMetricsServiceRequest

from agent_sidecar.adapters.claude_code.otlp_adapter import events_from_otlp_json, events_from_otlp_protobuf


def test_otlp_json_maps_cost_metrics() -> None:
    payload = json.loads(Path("evals/fixtures/otlp/cost_metrics.json").read_text(encoding="utf-8"))

    [event] = events_from_otlp_json(payload)

    assert event.event_type == "cost_estimate_updated"
    assert event.session_id == "cc-fixture-session"
    assert event.payload["precision"] == "measured"
    assert event.payload["gen_ai.usage.input_tokens"] == 1820
    assert event.payload["gen_ai.usage.output_tokens"] == 640
    assert event.payload["cost_usd"] == 0.041


def test_otlp_protobuf_maps_cost_metrics() -> None:
    request = ExportMetricsServiceRequest()
    resource_metrics = request.resource_metrics.add()
    session_attr = resource_metrics.resource.attributes.add()
    session_attr.key = "session.id"
    session_attr.value.string_value = "proto-session"
    repo_attr = resource_metrics.resource.attributes.add()
    repo_attr.key = "repo.path"
    repo_attr.value.string_value = "/tmp/proto-repo"
    model_attr = resource_metrics.resource.attributes.add()
    model_attr.key = "gen_ai.request.model"
    model_attr.value.string_value = "claude-sonnet-4"
    scope_metrics = resource_metrics.scope_metrics.add()
    input_metric = scope_metrics.metrics.add()
    input_metric.name = "gen_ai.usage.input_tokens"
    input_metric.sum.data_points.add().as_int = 42
    output_metric = scope_metrics.metrics.add()
    output_metric.name = "gen_ai.usage.output_tokens"
    output_metric.sum.data_points.add().as_int = 17

    [event] = events_from_otlp_protobuf(request.SerializeToString(), kind="metrics")

    assert event.session_id == "cc-proto-session"
    assert event.metadata.repo_path == "/tmp/proto-repo"
    assert event.payload["gen_ai.usage.input_tokens"] == 42
    assert event.payload["gen_ai.usage.output_tokens"] == 17


def test_otlp_without_session_goes_to_orphans() -> None:
    [event] = events_from_otlp_json({
        "resourceMetrics": [
            {
                "resource": {"attributes": [{"key": "repo.path", "value": {"stringValue": "/tmp/repo"}}]},
                "scopeMetrics": [{"metrics": [{"name": "gen_ai.usage.input_tokens", "sum": {"dataPoints": [{"asInt": 12}]}}]}],
            }
        ]
    })

    assert event.session_id == "cc-telemetry-orphans"
    assert event.payload["precision"] == "measured"
