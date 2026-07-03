from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


SCHEMA_VERSION = 3
AGENT_NAME = "claude-code"


class EventSource(str, Enum):
    hook = "hook"
    otlp = "otlp"
    cli = "cli"
    manual = "manual"
    detector = "detector"


REGISTERED_EVENT_TYPES = {
    "session_started",
    "session_stopped",
    "prompt_submitted",
    "prompt_refined",
    "agent_tool_observed",
    "agent_tool_failed",
    "turn_completed",
    "file_edit_observed",
    "test_run_observed",
    "test_failure_observed",
    "cost_estimate_updated",
    "loop_detected",
    "validation_missing",
    "task_drift_detected",
    "steering_recommendation",
    "model_call_completed",
    "summary_exported",
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_session_id(value: str) -> str:
    stripped = value.strip()
    return stripped if stripped.startswith("cc-") else f"cc-{stripped}"


class EventMeta(BaseModel):
    model_config = ConfigDict(extra="allow")

    repo_path: str
    agent: Literal["claude-code"] = AGENT_NAME
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    schema_version: int = SCHEMA_VERSION
    adapter_version: str | None = None


class SidecarEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: str = Field(default_factory=lambda: str(uuid4()))
    session_id: str
    timestamp: datetime = Field(default_factory=utc_now)
    event_type: str
    source: EventSource
    payload: dict[str, Any] = Field(default_factory=dict)
    metadata: EventMeta

    @field_validator("session_id")
    @classmethod
    def session_id_has_prefix(cls, value: str) -> str:
        if not value:
            raise ValueError("session_id is required")
        return ensure_session_id(value)

    @field_validator("event_type")
    @classmethod
    def event_type_registered(cls, value: str) -> str:
        if value not in REGISTERED_EVENT_TYPES:
            raise ValueError(f"unknown event_type: {value}")
        return value

    @field_validator("timestamp")
    @classmethod
    def timestamp_is_utc(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    @model_validator(mode="after")
    def validate_payload_shape(self) -> SidecarEvent:
        validate_event_payload(self.event_type, self.payload)
        return self

def validate_event_payload(event_type: str, payload: dict[str, Any]) -> None:
    required: dict[str, set[str]] = {
        "prompt_submitted": {"prompt"},
        "agent_tool_observed": {"tool_name"},
        "agent_tool_failed": {"tool_name"},
        "file_edit_observed": {"path"},
        "test_run_observed": {"command", "normalized_command"},
        "test_failure_observed": {"command", "normalized_command", "failure_signature"},
        "cost_estimate_updated": {"precision"},
        "loop_detected": {"evidence_event_ids"},
        "validation_missing": {"evidence_event_ids"},
        "task_drift_detected": {"evidence_event_ids"},
        "steering_recommendation": {"decision", "recommendation", "evidence_event_ids", "confidence"},
        "model_call_completed": {"role", "model_id", "latency_ms", "valid_json", "fallback_used"},
        "summary_exported": {"destination", "counts", "duration_ms"},
    }
    missing = required.get(event_type, set()) - set(payload)
    if missing:
        raise ValueError(f"{event_type} payload missing keys: {', '.join(sorted(missing))}")


def event_from_dict(value: dict[str, Any]) -> SidecarEvent:
    return SidecarEvent.model_validate(value)
