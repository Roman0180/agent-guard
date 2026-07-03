from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from agent_sidecar.schema.events import EventMeta, EventSource, SidecarEvent, ensure_session_id


def command_event(session_id: str, command: str, repo_path: Path) -> SidecarEvent:
    return SidecarEvent(
        event_id=str(uuid4()),
        session_id=ensure_session_id(session_id),
        event_type="agent_tool_observed",
        source=EventSource.manual,
        payload={"tool_name": "Bash", "command": command, "tool_input_summary": command},
        metadata=EventMeta(repo_path=str(repo_path.resolve())),
    )


def edit_event(session_id: str, path: str, repo_path: Path) -> SidecarEvent:
    return SidecarEvent(
        event_id=str(uuid4()),
        session_id=ensure_session_id(session_id),
        event_type="file_edit_observed",
        source=EventSource.manual,
        payload={"path": path},
        metadata=EventMeta(repo_path=str(repo_path.resolve())),
    )


def test_event(session_id: str, command: str, status: str, repo_path: Path) -> list[SidecarEvent]:
    exit_code = 0 if status == "passed" else 1 if status == "failed" else None
    event = SidecarEvent(
        event_id=str(uuid4()),
        session_id=ensure_session_id(session_id),
        event_type="test_run_observed",
        source=EventSource.manual,
        payload={"command": command, "normalized_command": command, "exit_code": exit_code},
        metadata=EventMeta(repo_path=str(repo_path.resolve())),
    )
    if status == "failed":
        failure = SidecarEvent(
            event_id=str(uuid4()),
            session_id=ensure_session_id(session_id),
            event_type="test_failure_observed",
            source=EventSource.manual,
            payload={"command": command, "normalized_command": command, "exit_code": exit_code, "failure_signature": f"{command} failed"},
            metadata=EventMeta(repo_path=str(repo_path.resolve())),
        )
        return [event, failure]
    return [event]
