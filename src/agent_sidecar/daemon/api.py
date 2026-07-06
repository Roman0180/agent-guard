from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response

from agent_sidecar.adapters.claude_code.hooks_adapter import events_from_hook
from agent_sidecar.intel.cost import price_map_metadata, session_cost
from agent_sidecar.intel.refiner import CodingRefinementRequiredError, ModelEnsembleRequiredError, ReasoningRefinementRequiredError, refine_prompt
from agent_sidecar.intel.steering import finding_events, steer
from agent_sidecar.intel.wrapper import KimiWrapperRequiredError, wrap_prompt_with_kimi
from agent_sidecar.models.provider import LiteLLMModelProvider
from agent_sidecar.models.router import ModelRouter
from agent_sidecar.schema.events import EventMeta, EventSource, SidecarEvent
from agent_sidecar.schema.session import CostBudget, Money, Precision, SessionRecord
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

    @router.post("/refine")
    def refine(body: dict[str, Any], manager: SessionManager = Depends(manager_dependency)) -> dict[str, Any]:
        prompt = str(body.get("prompt") or "")
        if not prompt:
            raise HTTPException(status_code=400, detail="prompt is required")
        session_id = body.get("session_id") or body.get("session")
        require_model_ensemble = bool(body.get("require_model_ensemble", False))
        require_reasoning_refinement = bool(body.get("require_reasoning_refinement", False))
        require_coding_refinement = bool(body.get("require_coding_refinement", False))
        use_model_refinement = bool(body.get("use_model_refinement", False))
        provider = (
            LiteLLMModelProvider(
                manager.repo_path,
                manager.config,
                session_id=str(session_id) if session_id else None,
                event_sink=manager.add_event if session_id else None,
            )
            if use_model_refinement or require_model_ensemble or require_reasoning_refinement or require_coding_refinement
            else None
        )
        try:
            result, events = refine_prompt(
                prompt,
                repo_path=manager.repo_path,
                session_id=str(session_id) if session_id else None,
                provider=provider,
                record_prompt_submitted=bool(body.get("record_prompt_submitted", True)),
                require_model_ensemble=require_model_ensemble,
                require_reasoning_refinement=require_reasoning_refinement,
                require_coding_refinement=require_coding_refinement,
            )
        except ModelEnsembleRequiredError as error:
            raise HTTPException(status_code=424, detail=f"model ensemble refinement required but unavailable: {error}") from error
        except ReasoningRefinementRequiredError as error:
            raise HTTPException(status_code=424, detail=f"DeepSeek prompt refinement required but unavailable: {error}") from error
        except CodingRefinementRequiredError as error:
            raise HTTPException(status_code=424, detail=f"Kimi coding refinement required but unavailable: {error}") from error
        for event in events:
            manager.add_event(event)
        return result.model_dump(mode="json")

    @router.post("/wrap")
    def wrap(body: dict[str, Any], manager: SessionManager = Depends(manager_dependency)) -> dict[str, Any]:
        prompt = str(body.get("prompt") or "")
        if not prompt:
            raise HTTPException(status_code=400, detail="prompt is required")
        session_id = body.get("session_id") or body.get("session")
        provider = LiteLLMModelProvider(
            manager.repo_path,
            manager.config,
            session_id=str(session_id) if session_id else None,
            event_sink=manager.add_event if session_id else None,
        )
        try:
            refined, result, events = wrap_prompt_with_kimi(
                prompt,
                repo_path=manager.repo_path,
                session_id=str(session_id) if session_id else None,
                provider=provider,
                record_prompt_submitted=bool(body.get("record_prompt_submitted", True)),
            )
        except KimiWrapperRequiredError as error:
            raise HTTPException(status_code=424, detail=f"Kimi wrapper required but unavailable: {error}") from error
        for event in events:
            manager.add_event(event)
        return {
            **result.model_dump(mode="json"),
            "refined_prompt": refined.refined_prompt,
            "refinement_source": refined.source,
            "quality": refined.quality,
            "issues": refined.issues,
        }

    @router.post("/sessions/{session_id}/steer")
    def steer_session(session_id: str, manager: SessionManager = Depends(manager_dependency)) -> dict[str, Any]:
        record = manager.get_session(session_id)
        if record is None:
            raise HTTPException(status_code=404, detail="session not found")
        provider = LiteLLMModelProvider(manager.repo_path, manager.config, session_id=session_id, event_sink=manager.add_event)
        result, findings, recommendation = steer(
            manager.events(session_id),
            config=manager.config,
            repo_path=manager.repo_path,
            session_id=session_id,
            provider=provider,
        )
        for event in finding_events(findings, session_id=session_id, repo_path=manager.repo_path):
            manager.add_event(event)
        manager.add_event(recommendation)
        return {"result": result.model_dump(mode="json"), "findings": [finding.model_dump(mode="json") for finding in findings]}

    @router.get("/sessions/{session_id}/recommendations")
    def recommendations(session_id: str, manager: SessionManager = Depends(manager_dependency)) -> list[dict[str, Any]]:
        return [event.model_dump(mode="json") for event in manager.events(session_id) if event.event_type == "steering_recommendation"]

    @router.get("/sessions/{session_id}/cost")
    def cost(session_id: str, manager: SessionManager = Depends(manager_dependency)) -> dict[str, Any]:
        record = manager.get_session(session_id)
        if record is None:
            raise HTTPException(status_code=404, detail="session not found")
        result = session_cost(record, manager.events(session_id), manager.config, manager.repo_path)
        result["price_map"] = price_map_metadata(manager.config, manager.repo_path)
        return result

    @router.post("/sessions/{session_id}/budget")
    def configure_budget(session_id: str, body: dict[str, Any], manager: SessionManager = Depends(manager_dependency)) -> dict[str, Any]:
        record = manager.get_session(session_id) or manager.create_session(session_id)
        budget = _build_budget(record, body, manager)
        event = SidecarEvent(
            session_id=record.session_id,
            event_type="budget_configured",
            source=EventSource.detector,
            payload={
                "baseline_session_id": budget.baseline_session_id,
                "baseline_cost_usd": budget.baseline_cost_usd.value,
                "budget_usd": budget.limit_usd.value,
                "target_savings_pct": budget.target_savings_pct,
                "warning_threshold_pct": budget.warning_threshold_pct,
                "enforcement": budget.enforcement,
                "precision": budget.limit_usd.precision.value,
            },
            metadata=EventMeta(repo_path=record.repo_path),
        )
        updated = manager.add_event(event)
        return _budget_status(updated, manager, action="allow", reason="budget configured")

    @router.post("/sessions/{session_id}/budget/check")
    def check_budget(session_id: str, manager: SessionManager = Depends(manager_dependency)) -> dict[str, Any]:
        record = manager.get_session(session_id)
        if record is None:
            raise HTTPException(status_code=404, detail="session not found")
        status = _budget_status(record, manager)
        if status["action"] != "allow":
            manager.add_event(SidecarEvent(
                session_id=record.session_id,
                event_type="budget_guard_triggered",
                source=EventSource.detector,
                payload={
                    "action": status["action"],
                    "reason": status["reason"],
                    "current_cost_usd": status["current_cost_usd"],
                    "budget_usd": status["budget_usd"],
                    "remaining_usd": status["remaining_usd"],
                    "usage_pct": status["usage_pct"],
                    "precision": status["precision"],
                },
                metadata=EventMeta(repo_path=record.repo_path),
            ))
        return status

    @router.get("/models")
    def models(manager: SessionManager = Depends(manager_dependency)) -> dict[str, Any]:
        return {"roles": ModelRouter(manager.repo_path, manager.config).table(check_served=True)}

    return router


def parse_events(session_id: str, body: dict[str, Any], manager: SessionManager) -> list[SidecarEvent]:
    if "event_type" in body and "metadata" in body:
        event = SidecarEvent.model_validate({**body, "session_id": session_id})
        return [event]
    return events_from_hook(body, session_id=session_id, hooks_config=manager.config.hooks)


def _build_budget(record: SessionRecord, body: dict[str, Any], manager: SessionManager) -> CostBudget:
    baseline_session_id = body.get("baseline_session_id") or body.get("baseline_session")
    precision = Precision.measured
    if baseline_session_id:
        baseline_record = manager.get_session(str(baseline_session_id))
        if baseline_record is None:
            raise HTTPException(status_code=404, detail=f"baseline session not found: {baseline_session_id}")
        baseline_cost = session_cost(baseline_record, manager.events(str(baseline_session_id)), manager.config, manager.repo_path)
        baseline_value = float((baseline_cost.get("cost_usd") or {}).get("value") or 0.0)
        precision = Precision((baseline_cost.get("cost_usd") or {}).get("precision") or Precision.approximate.value)
    else:
        baseline_value = _float_body(body, "baseline_cost_usd", 0.0)
        precision = Precision(str(body.get("precision") or Precision.approximate.value))

    if baseline_value <= 0:
        raise HTTPException(status_code=400, detail="baseline cost must be greater than zero to configure a budget")

    target_savings_pct = _percent_body(body, "target_savings_pct", manager.config.budget.target_savings_pct)
    explicit_budget = body.get("budget_usd")
    try:
        budget_value = float(explicit_budget) if explicit_budget is not None else baseline_value * max(0.0, 1.0 - target_savings_pct / 100)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="budget_usd must be numeric") from None
    if budget_value <= 0:
        raise HTTPException(status_code=400, detail="budget_usd must be greater than zero")

    enforcement = str(body.get("enforcement") or manager.config.budget.enforcement)
    if enforcement not in {"off", "warn", "block"}:
        raise HTTPException(status_code=400, detail="enforcement must be off, warn, or block")

    return CostBudget(
        baseline_session_id=str(baseline_session_id) if baseline_session_id else None,
        baseline_cost_usd=Money(value=round(baseline_value, 6), precision=precision),
        limit_usd=Money(value=round(budget_value, 6), precision=precision),
        target_savings_pct=target_savings_pct,
        warning_threshold_pct=_percent_body(body, "warning_threshold_pct", manager.config.budget.warning_threshold_pct),
        enforcement=enforcement,
    )


def _budget_status(record: SessionRecord, manager: SessionManager, *, action: str | None = None, reason: str | None = None) -> dict[str, Any]:
    if record.budget is None:
        return {
            "configured": False,
            "action": "allow",
            "reason": "no budget configured",
            "current_cost_usd": 0.0,
            "budget_usd": 0.0,
            "remaining_usd": 0.0,
            "usage_pct": 0.0,
            "precision": "unknown",
        }

    current = session_cost(record, manager.events(record.session_id), manager.config, manager.repo_path)
    current_cost = float((current.get("cost_usd") or {}).get("value") or 0.0)
    budget_value = record.budget.limit_usd.value
    remaining = budget_value - current_cost
    usage_pct = (current_cost / budget_value * 100) if budget_value > 0 else 0.0
    computed_action = action or "allow"
    computed_reason = reason or "within budget"

    if action is None:
        if record.budget.enforcement == "off":
            computed_action = "allow"
            computed_reason = "budget enforcement disabled"
        elif current_cost >= budget_value:
            computed_action = "block" if record.budget.enforcement == "block" else "warn"
            computed_reason = "cost budget exceeded"
        elif usage_pct >= record.budget.warning_threshold_pct:
            computed_action = "warn"
            computed_reason = "cost budget warning threshold reached"

    return {
        "configured": True,
        "action": computed_action,
        "reason": computed_reason,
        "baseline_session_id": record.budget.baseline_session_id,
        "baseline_cost_usd": record.budget.baseline_cost_usd.value,
        "budget_usd": budget_value,
        "current_cost_usd": round(current_cost, 6),
        "remaining_usd": round(remaining, 6),
        "usage_pct": round(usage_pct, 1),
        "target_savings_pct": record.budget.target_savings_pct,
        "warning_threshold_pct": record.budget.warning_threshold_pct,
        "enforcement": record.budget.enforcement,
        "precision": str((current.get("cost_usd") or {}).get("precision") or record.budget.limit_usd.precision.value),
    }


def _float_body(body: dict[str, Any], key: str, default: float) -> float:
    try:
        return float(body.get(key, default))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"{key} must be numeric") from None


def _percent_body(body: dict[str, Any], key: str, default: float) -> float:
    value = _float_body(body, key, default)
    if value < 0 or value > 100:
        raise HTTPException(status_code=400, detail=f"{key} must be between 0 and 100")
    return value
