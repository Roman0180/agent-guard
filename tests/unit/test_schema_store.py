from __future__ import annotations

from pathlib import Path

from agent_sidecar.schema.config import load_config
from agent_sidecar.schema.events import EventMeta, EventSource, SidecarEvent
from agent_sidecar.schema.session import Precision
from agent_sidecar.store.jsonl import append_event, read_events
from agent_sidecar.store.sessions import SessionManager


def test_config_created_with_defaults(tmp_path: Path) -> None:
    config = load_config(tmp_path)

    assert config.version == 3
    assert config.daemon.api_port == 7433
    assert config.models.roles["coding"].fallback_base == "llama3:latest"
    assert config.models.roles["coding"].serving == "llama_server"
    assert config.models.remote_fallback is False
    assert (tmp_path / ".agent-sidecar" / "config.json").exists()


def test_event_round_trip_preserves_unknown_raw_fields(tmp_path: Path) -> None:
    event = SidecarEvent(
        session_id="round-trip",
        event_type="prompt_submitted",
        source=EventSource.hook,
        payload={"prompt": "fix auth", "raw_hook": {"future_field": {"nested": True}}},
        metadata=EventMeta(repo_path=str(tmp_path), adapter_version="test"),
    )
    path = tmp_path / "trace.jsonl"

    append_event(path, event)
    [loaded] = read_events(path)

    assert loaded.session_id == "cc-round-trip"
    assert loaded.payload["raw_hook"]["future_field"]["nested"] is True


def test_session_manager_autocreates_and_updates_measured_cost(tmp_path: Path) -> None:
    manager = SessionManager(tmp_path)
    event = SidecarEvent(
        session_id="cost-session",
        event_type="cost_estimate_updated",
        source=EventSource.otlp,
        payload={
            "gen_ai.request.model": "claude-sonnet-4",
            "gen_ai.usage.input_tokens": 10,
            "gen_ai.usage.output_tokens": 5,
            "cost_usd": 0.01,
            "precision": "measured",
        },
        metadata=EventMeta(repo_path=str(tmp_path)),
    )

    record = manager.add_event(event)

    assert record.observation["otlp"] is True
    assert record.tokens is not None
    assert record.tokens.input == 10
    assert record.tokens.precision is Precision.measured
    assert record.cost_usd is not None
    assert record.cost_usd.value == 0.01
