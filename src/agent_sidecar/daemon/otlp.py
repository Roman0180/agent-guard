from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from agent_sidecar.adapters.claude_code.otlp_adapter import events_from_otlp_json, events_from_otlp_protobuf, parse_json_bytes
from agent_sidecar.store.sessions import SessionManager


def create_otlp_router(manager_dependency) -> APIRouter:
    router = APIRouter()

    @router.post("/v1/metrics")
    async def metrics(request: Request, manager: SessionManager = Depends(manager_dependency)) -> dict[str, int]:
        return await ingest_otlp(request, manager, "metrics")

    @router.post("/v1/logs")
    async def logs(request: Request, manager: SessionManager = Depends(manager_dependency)) -> dict[str, int]:
        return await ingest_otlp(request, manager, "logs")

    return router


async def ingest_otlp(request: Request, manager: SessionManager, kind: str) -> dict[str, int]:
    body = await request.body()
    content_type = request.headers.get("content-type", "")
    if "json" in content_type or body.lstrip().startswith(b"{"):
        events = events_from_otlp_json(parse_json_bytes(body), default_repo_path=str(manager.repo_path))
    else:
        events = events_from_otlp_protobuf(body, kind=kind, default_repo_path=str(manager.repo_path))
    for event in events:
        manager.add_event(event)
    return {"accepted": len(events)}
