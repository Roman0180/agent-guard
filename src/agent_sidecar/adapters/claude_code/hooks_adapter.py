from __future__ import annotations

import json
import re
from collections.abc import Iterable
from pathlib import Path
from typing import Any
from uuid import uuid4

from agent_sidecar.schema.config import HooksConfig
from agent_sidecar.schema.events import EventMeta, EventSource, SidecarEvent, ensure_session_id, utc_now


ADAPTER_VERSION = "claude-hooks-v1"
HOOK_EVENT_MAP = {
    "SessionStart": "session_started",
    "SessionEnd": "session_stopped",
    "UserPromptSubmit": "prompt_submitted",
    "PreToolUse": "agent_tool_observed",
    "PostToolUse": "agent_tool_observed",
    "PostToolUseFailure": "agent_tool_failed",
    "Stop": "turn_completed",
}
EDIT_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}


def events_from_hook(payload: dict[str, Any], *, session_id: str | None = None, hooks_config: HooksConfig | None = None) -> list[SidecarEvent]:
    config = hooks_config or HooksConfig()
    sanitized = sanitize_hook_payload(payload, config.payload_max_bytes)
    hook_name = first_string(payload, "hook_event_name", "event_name", "event", "type") or "Unknown"
    event_type = HOOK_EVENT_MAP.get(hook_name)
    if not event_type:
        event_type = "agent_tool_observed"
    sid = ensure_session_id(session_id or first_string(payload, "session_id", "sessionId", "transcript_session_id") or "unknown")
    repo_path = first_string(payload, "cwd", "repo_path", "repoRoot") or str(Path.cwd())
    timestamp = utc_now()

    events: list[SidecarEvent] = []
    base_payload = base_event_payload(hook_name, payload, sanitized)
    if event_type == "prompt_submitted":
        base_payload["prompt"] = first_string(payload, "prompt", "user_prompt", "userPrompt") or ""
    if event_type in {"agent_tool_observed", "agent_tool_failed"}:
        base_payload.update(tool_payload(payload))

    events.append(SidecarEvent(
        event_id=str(uuid4()),
        session_id=sid,
        timestamp=timestamp,
        event_type=event_type,
        source=EventSource.hook,
        payload=base_payload,
        metadata=EventMeta(repo_path=repo_path, adapter_version=ADAPTER_VERSION),
    ))

    if hook_name == "PostToolUse":
        events.extend(derive_events(payload, sanitized, sid, repo_path, timestamp, config))
    return events


def derive_events(payload: dict[str, Any], sanitized: dict[str, Any], session_id: str, repo_path: str, timestamp, config: HooksConfig) -> list[SidecarEvent]:
    tool_name = first_string(payload, "tool_name", "toolName", "name") or ""
    derived: list[SidecarEvent] = []
    if tool_name in EDIT_TOOLS:
        for path in edit_paths(payload):
            derived.append(SidecarEvent(
                event_id=str(uuid4()),
                session_id=session_id,
                timestamp=timestamp,
                event_type="file_edit_observed",
                source=EventSource.hook,
                payload={"path": path, "tool_name": tool_name, "raw_hook": sanitized},
                metadata=EventMeta(repo_path=repo_path, adapter_version=ADAPTER_VERSION),
            ))

    command = command_from_payload(payload)
    if tool_name == "Bash" and command and is_test_command(command, config.test_command_patterns):
        exit_code = int_value(payload, "exit_code", "exitCode", "status")
        base = {
            "command": command,
            "normalized_command": normalize_command(command),
            "exit_code": exit_code,
            "raw_hook": sanitized,
        }
        derived.append(SidecarEvent(
            event_id=str(uuid4()),
            session_id=session_id,
            timestamp=timestamp,
            event_type="test_run_observed",
            source=EventSource.hook,
            payload=base,
            metadata=EventMeta(repo_path=repo_path, adapter_version=ADAPTER_VERSION),
        ))
        if exit_code and exit_code != 0:
            derived.append(SidecarEvent(
                event_id=str(uuid4()),
                session_id=session_id,
                timestamp=timestamp,
                event_type="test_failure_observed",
                source=EventSource.hook,
                payload={**base, "failure_signature": failure_signature(payload)},
                metadata=EventMeta(repo_path=repo_path, adapter_version=ADAPTER_VERSION),
            ))
    return derived


def base_event_payload(hook_name: str, payload: dict[str, Any], sanitized: dict[str, Any]) -> dict[str, Any]:
    return {
        "hook_event_name": hook_name,
        "raw_hook": sanitized,
    }


def tool_payload(payload: dict[str, Any]) -> dict[str, Any]:
    tool_name = first_string(payload, "tool_name", "toolName", "name") or "unknown"
    return {
        "tool_name": tool_name,
        "tool_input_summary": summarize_value(payload.get("tool_input") or payload.get("toolInput") or payload.get("input")),
        "exit": int_value(payload, "exit_code", "exitCode", "status"),
        "duration_ms": int_value(payload, "duration_ms", "durationMs"),
    }


def sanitize_hook_payload(value: Any, max_bytes: int) -> dict[str, Any]:
    sanitized = truncate_value(value)
    encoded = json.dumps(sanitized, ensure_ascii=False, default=str)
    if len(encoded.encode("utf-8")) <= max_bytes:
        return sanitized if isinstance(sanitized, dict) else {"value": sanitized}
    return {"truncated": True, "excerpt": encoded[: max(0, min(max_bytes, 4096))]}


def truncate_value(value: Any, max_string: int = 4000) -> Any:
    if isinstance(value, str):
        return value if len(value) <= max_string else value[:max_string] + "...[truncated]"
    if isinstance(value, list):
        return [truncate_value(item, max_string) for item in value[:100]]
    if isinstance(value, dict):
        return {str(key): truncate_value(child, max_string) for key, child in list(value.items())[:100]}
    return value


def first_string(payload: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def int_value(payload: dict[str, Any], *keys: str) -> int | None:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, bool):
            continue
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.strip().lstrip("-").isdigit():
            return int(value)
    return None


def edit_paths(payload: dict[str, Any]) -> list[str]:
    values: list[str] = []
    for value in nested_values(payload, {"file_path", "filePath", "path"}):
        if isinstance(value, str):
            values.append(value)
    return list(dict.fromkeys(values)) or ["unknown"]


def command_from_payload(payload: dict[str, Any]) -> str | None:
    for value in nested_values(payload, {"command", "cmd"}):
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def nested_values(value: Any, keys: set[str]) -> Iterable[Any]:
    if isinstance(value, dict):
        for key, child in value.items():
            if key in keys:
                yield child
            yield from nested_values(child, keys)
    elif isinstance(value, list):
        for child in value:
            yield from nested_values(child, keys)


def is_test_command(command: str, patterns: list[str]) -> bool:
    normalized = normalize_command(command)
    return any(normalized.startswith(normalize_command(pattern)) for pattern in patterns)


def normalize_command(command: str) -> str:
    command = re.sub(r"\s+", " ", command.strip())
    command = re.sub(r"/private/var/folders/\S+", "<tmp>", command)
    return command


def failure_signature(payload: dict[str, Any]) -> str:
    text = "\n".join(str(value) for value in nested_values(payload, {"stderr", "stdout", "output", "error", "message"}) if value)
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return (lines[-1] if lines else "test command failed")[:500]


def summarize_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value[:500]
    return json.dumps(value, ensure_ascii=False, default=str)[:500]
