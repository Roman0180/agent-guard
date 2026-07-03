from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response

from agent_sidecar.adapters.claude_code.hooks_adapter import events_from_hook
from agent_sidecar.schema.events import EventSource, SidecarEvent
from agent_sidecar.store.sessions import SessionManager


def create_api_router(manager_dependency) -> APIRouter:
    router = APIRouter()

    @router.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "agent-sidecar"}

    @router.get("/status")
    def status(manager: SessionManager = Depends(manager_dependency)) -> dict[str, Any]:
        sessions = manager.list_sessions()
        active = next((session for session in reversed(sessions) if session.status == "active"), sessions[-1] if sessions else None)
        return {
            "status": "ok",
            "active_session": active.model_dump(mode="json") if active else None,
            "sessions": [session.model_dump(mode="json") for session in sessions],
        }

    @router.get("/sessions")
    def sessions(manager: SessionManager = Depends(manager_dependency)) -> list[dict[str, Any]]:
        return [session.model_dump(mode="json") for session in manager.list_sessions()]

    @router.post("/sessions")
    def create_session(body: dict[str, Any], manager: SessionManager = Depends(manager_dependency)) -> dict[str, Any]:
        session_id = str(body.get("session_id") or body.get("id") or "")
        if not session_id:
            raise HTTPException(status_code=400, detail="session_id is required")
        record = manager.create_session(session_id, repo_path=body.get("repo_path"), source=EventSource.cli)
        return record.model_dump(mode="json")

    @router.get("/sessions/{session_id}")
    def get_session(session_id: str, manager: SessionManager = Depends(manager_dependency)) -> dict[str, Any]:
        record = manager.get_session(session_id)
        if not record:
            raise HTTPException(status_code=404, detail="session not found")
        return record.model_dump(mode="json")

    @router.post("/sessions/{session_id}/events")
    def add_event(session_id: str, body: dict[str, Any], manager: SessionManager = Depends(manager_dependency)) -> dict[str, Any]:
        events = parse_events(session_id, body, manager)
        records = [manager.add_event(event).model_dump(mode="json") for event in events]
        return {"accepted": len(events), "session": records[-1] if records else None, "events": [event.model_dump(mode="json") for event in events]}

    @router.post("/sessions/{session_id}/stop")
    def stop_session(session_id: str, manager: SessionManager = Depends(manager_dependency)) -> dict[str, Any]:
        return manager.stop_session(session_id).model_dump(mode="json")

    @router.get("/sessions/{session_id}/trace")
    def trace(session_id: str, manager: SessionManager = Depends(manager_dependency)) -> Response:
        lines = manager.trace_lines(session_id)
        if not lines and not manager.get_session(session_id):
            raise HTTPException(status_code=404, detail="session not found")
        return Response("\n".join(lines) + ("\n" if lines else ""), media_type="application/x-ndjson")

    return router


def parse_events(session_id: str, body: dict[str, Any], manager: SessionManager) -> list[SidecarEvent]:
    if "event_type" in body and "metadata" in body:
        event = SidecarEvent.model_validate({**body, "session_id": session_id})
        return [event]
    return events_from_hook(body, session_id=session_id, hooks_config=manager.config.hooks)
