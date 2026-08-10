from __future__ import annotations

import asyncio
import hashlib
import json
import shutil
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse

from agent_sidecar.adapters.claude_code.hooks_adapter import events_from_hook
from agent_sidecar.intel.cost import _measured_from_api_requests, price_map_metadata, session_cost
from agent_sidecar.intel.refiner import CodingRefinementRequiredError, ModelEnsembleRequiredError, ReasoningRefinementRequiredError, refine_prompt
from agent_sidecar.intel.billing import detect_billing
from agent_sidecar.intel.k_store import k_calibration_path
from agent_sidecar.intel.measurement import assigned_arm, measure_on_ingest, measurement_report, push_measurement_report
from agent_sidecar.intel.steering import finding_events, steer
from agent_sidecar.intel.wrapper import KimiWrapperRequiredError, wrap_prompt_with_kimi
from agent_sidecar.models.provider import LiteLLMModelProvider
from agent_sidecar.models.router import ModelRouter
from agent_sidecar.schema.events import EventMeta, EventSource, SidecarEvent, utc_now
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
        response: dict[str, Any] = {"accepted": len(events), "session": records[-1] if records else None, "events": [event.model_dump(mode="json") for event in events]}
        if events and manager.config.measurement.steer_on_ingest:
            response["measurement"] = measure_on_ingest(manager, events[-1].session_id)
        return response

    @router.post("/sessions/{session_id}/stop")
    def stop_session(session_id: str, manager: SessionManager = Depends(manager_dependency)) -> dict[str, Any]:
        record = manager.stop_session(session_id).model_dump(mode="json")
        push_measurement_report(manager)
        return record

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
        if session_id and manager.config.measurement.control_fraction > 0 and assigned_arm(str(session_id), manager.config) == "control":
            suppressed = SidecarEvent(
                session_id=str(session_id),
                event_type="refinement_suppressed",
                source=EventSource.detector,
                payload={"reason": "control_arm", "prompt_chars": len(prompt)},
                metadata=EventMeta(repo_path=str(manager.repo_path)),
            )
            manager.add_event(suppressed)
            return {"suppressed": True, "arm": "control", "session_id": suppressed.session_id}
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
            raise HTTPException(status_code=424, detail=f"coding-model refinement required but unavailable: {error}") from error
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
            raise HTTPException(status_code=424, detail=f"coding wrapper required but unavailable: {error}") from error
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

    @router.get("/measurement/report")
    def measurement(manager: SessionManager = Depends(manager_dependency)) -> dict[str, Any]:
        return measurement_report(manager)

    @router.get("/sessions/{session_id}/cost")
    def cost(session_id: str, manager: SessionManager = Depends(manager_dependency)) -> dict[str, Any]:
        record = manager.get_session(session_id)
        if record is None:
            raise HTTPException(status_code=404, detail="session not found")
        result = session_cost(record, manager.events(session_id), manager.config, manager.repo_path)
        result["price_map"] = price_map_metadata(manager.config, manager.repo_path)
        return result

    @router.get("/api/dashboard/metrics")
    def dashboard_metrics(manager: SessionManager = Depends(manager_dependency)) -> dict[str, Any]:
        return _dashboard_metrics(manager)

    @router.get("/api/dashboard/events")
    async def dashboard_events(manager: SessionManager = Depends(manager_dependency)) -> StreamingResponse:
        async def event_stream():
            last_fingerprint: str | None = None
            while True:
                metrics = _dashboard_metrics(manager)
                fingerprint = _dashboard_fingerprint(metrics)
                if fingerprint != last_fingerprint:
                    last_fingerprint = fingerprint
                    payload = {
                        "fingerprint": fingerprint,
                        "generatedAt": metrics.get("generatedAt"),
                        "runCount": (metrics.get("totals") or {}).get("runCount", 0),
                    }
                    yield f"event: metrics\ndata: {json.dumps(payload, sort_keys=True)}\n\n"
                else:
                    yield ": keepalive\n\n"
                await asyncio.sleep(1)

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-store",
                "X-Accel-Buffering": "no",
            },
        )

    @router.post("/api/dashboard/reset")
    def reset_dashboard(manager: SessionManager = Depends(manager_dependency)) -> dict[str, Any]:
        return {**_reset_dashboard_data(manager), "metrics": _dashboard_metrics(manager)}

    @router.get("/api/dashboard/pilot")
    def pilot_dashboard_metrics(manager: SessionManager = Depends(manager_dependency)) -> dict[str, Any]:
        return _pilot_dashboard_metrics(manager)

    @router.post("/api/dashboard/pilot/reset")
    def reset_pilot_dashboard(manager: SessionManager = Depends(manager_dependency)) -> dict[str, Any]:
        sessions_removed = manager.clear_sessions()
        return {"ok": True, "sessionsRemoved": sessions_removed, "metrics": _pilot_dashboard_metrics(manager)}

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


def _dashboard_metrics(manager: SessionManager) -> dict[str, Any]:
    runs = [*_swebench_dashboard_runs(manager), *_session_dashboard_runs(manager)]
    return {
        "generatedAt": _iso(utc_now()),
        "totals": _drop_none(_dashboard_totals(runs)),
        "runs": [_drop_none(run) for run in runs],
    }


def _dashboard_fingerprint(metrics: dict[str, Any]) -> str:
    runs = metrics.get("runs") if isinstance(metrics.get("runs"), list) else []
    payload = [
        {
            "id": run.get("id"),
            "status": run.get("status"),
            "updatedAt": run.get("updatedAt"),
            "defaultCostUsd": run.get("defaultCostUsd"),
            "sidecarCostUsd": run.get("sidecarCostUsd"),
            "qualityVerdict": run.get("qualityVerdict"),
            "baselineScore": run.get("baselineScore"),
            "sidecarScore": run.get("sidecarScore"),
        }
        for run in runs
        if isinstance(run, dict)
    ]
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()


def _reset_dashboard_data(manager: SessionManager) -> dict[str, Any]:
    sessions_removed = manager.clear_sessions()
    swebench_runs_removed = 0
    root = manager.repo_path / ".agent-sidecar" / "swebench-lite"
    if root.exists():
        for results_path in sorted(root.glob("*/results.jsonl")):
            run_dir = results_path.parent
            try:
                shutil.rmtree(run_dir)
            except FileNotFoundError:
                continue
            swebench_runs_removed += 1
    return {
        "ok": True,
        "sessionsRemoved": sessions_removed,
        "swebenchRunsRemoved": swebench_runs_removed,
    }


def _swebench_dashboard_runs(manager: SessionManager) -> list[dict[str, Any]]:
    root = manager.repo_path / ".agent-sidecar" / "swebench-lite"
    if not root.exists():
        return []

    runs: list[dict[str, Any]] = []
    for results_path in sorted(root.glob("*/results.jsonl")):
        generated_at = _swebench_timestamp(results_path.parent.name)
        try:
            lines = results_path.read_text(encoding="utf-8").splitlines()
        except OSError:
            continue
        for index, line in enumerate(lines, start=1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            baseline = row.get("baseline") if isinstance(row.get("baseline"), dict) else {}
            sidecar = row.get("sidecar") if isinstance(row.get("sidecar"), dict) else {}
            baseline_cost = _float_value(baseline.get("cost_usd"))
            sidecar_cost = _float_value(sidecar.get("cost_usd"))
            if baseline_cost <= 0 and sidecar_cost <= 0 and _int_value(baseline.get("total_tokens")) <= 0 and _int_value(sidecar.get("total_tokens")) <= 0:
                continue
            savings = baseline_cost - sidecar_cost
            baseline_exit = _int_value(baseline.get("exit_code"))
            sidecar_exit = _int_value(sidecar.get("exit_code"))
            baseline_grade = baseline.get("grade") if isinstance(baseline.get("grade"), dict) else {}
            sidecar_grade = sidecar.get("grade") if isinstance(sidecar.get("grade"), dict) else {}
            baseline_score = _optional_score(row.get("baseline_score"), baseline_grade.get("score"))
            sidecar_score = _optional_score(row.get("sidecar_score"), sidecar_grade.get("score"))
            if baseline_score is not None and sidecar_score is not None:
                quality_preserved = sidecar_score >= baseline_score
                quality_source = "swebench_evaluator"
                status = "completed" if sidecar_score > 0 else "failed"
            else:
                quality_preserved = baseline_exit == 0 and sidecar_exit == 0
                quality_source = "run_status"
                status = "completed" if quality_preserved else "failed"
            instance_id = str(row.get("instance_id") or f"task-{index}")
            model_route = _model_route_from_sources(baseline, sidecar)
            runs.append({
                "id": f"swebench-lite:{results_path.parent.name}:{instance_id}",
                "label": f"SWE-bench Lite {instance_id}",
                "provider": "claude-code",
                "status": status,
                "startedAt": generated_at,
                "updatedAt": generated_at,
                "completedAt": generated_at,
                "defaultCostUsd": round(baseline_cost, 6),
                "sidecarCostUsd": round(sidecar_cost, 6),
                "savingsUsd": round(savings, 6),
                "savingsPercent": _fraction(savings, baseline_cost),
                "defaultExecutionMs": _optional_int(baseline.get("duration_ms")),
                "sidecarExecutionMs": _optional_int(sidecar.get("duration_ms")),
                "executionDeltaMs": _optional_delta(baseline.get("duration_ms"), sidecar.get("duration_ms")),
                "qualityPreserved": quality_preserved,
                "qualityVerdict": "preserved" if quality_preserved else "regressed",
                "qualitySource": quality_source,
                "baselineScore": baseline_score,
                "sidecarScore": sidecar_score,
                "scoreDelta": sidecar_score - baseline_score if baseline_score is not None and sidecar_score is not None else None,
                "baselineGradeStatus": baseline_grade.get("status"),
                "sidecarGradeStatus": sidecar_grade.get("status"),
                "savingsMode": "run_totals",
                "confidence": 1.0 if baseline_cost > 0 and sidecar_cost > 0 else 0.0,
                "modelRoute": model_route,
                "taskType": "swebench_lite",
                "promptHashCount": 2,
            })
    return runs


def _session_dashboard_runs(manager: SessionManager) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for record in manager.list_sessions():
        events = manager.events(record.session_id)
        if any(event.event_type == "session_started" and event.payload.get("created_by") == "cli" for event in events) and len(events) <= 1:
            continue
        current = session_cost(record, events, manager.config, manager.repo_path)
        sidecar_cost = _float_value((current.get("cost_usd") or {}).get("value"))
        baseline_cost = record.budget.baseline_cost_usd.value if record.budget else sidecar_cost
        savings = baseline_cost - sidecar_cost
        started_at = record.started_at
        updated_at = events[-1].timestamp if events else record.stopped_at or record.started_at
        sidecar_ms = _duration_ms(started_at, record.stopped_at or updated_at)
        rows.append({
            "id": record.session_id,
            "label": f"Session {record.session_id}",
            "provider": "claude-code",
            "status": "active" if record.status == "active" else "completed",
            "startedAt": _iso(started_at),
            "updatedAt": _iso(updated_at),
            "completedAt": _iso(record.stopped_at) if record.stopped_at else None,
            "defaultCostUsd": round(baseline_cost, 6),
            "sidecarCostUsd": round(sidecar_cost, 6),
            "savingsUsd": round(savings, 6),
            "savingsPercent": _fraction(savings, baseline_cost),
            "defaultExecutionMs": None,
            "sidecarExecutionMs": sidecar_ms,
            "executionDeltaMs": None,
            "qualityPreserved": None,
            "qualityVerdict": "not_evaluated",
            "qualitySource": "not_evaluated",
            "savingsMode": "historical_local_baseline" if record.budget else "run_totals",
            "confidence": 0.9 if (current.get("cost_usd") or {}).get("precision") == Precision.measured.value else 0.45,
            "modelRoute": str(current.get("model") or record.model or "") or None,
            "taskType": _task_type(events),
            "promptHashCount": _prompt_hash_count(events),
        })
    return rows


# One "iteration" for pilot default-cost purposes is any observed unit of agent
# work — the same event universe shadow k calibration counts as follow-up waste.
PILOT_ITERATION_EVENT_TYPES = {
    "agent_tool_observed",
    "file_edit_observed",
    "test_run_observed",
    "test_failure_observed",
}


PROMPT_TEXT_LIMIT = 240


def _pilot_dashboard_metrics(manager: SessionManager) -> dict[str, Any]:
    """Pilot view payload: arm comparison plus k-estimated default cost.

    One row per submitted prompt: each session's events are split at
    prompt_submitted boundaries and cost/activity are attributed to the segment
    they occurred in. Default cost per row = measured cost + (k-calibrated
    avoided iterations x that segment's measured cost per iteration). Prompt
    text stays in this local payload only — the operator push (measurement
    report) never includes it.
    """
    report = measurement_report(manager)
    rows: list[dict[str, Any]] = []
    for record in manager.list_sessions():
        events = manager.events(record.session_id)
        prompt_indices = [index for index, event in enumerate(events) if event.event_type == "prompt_submitted"]
        if not prompt_indices:
            # Telemetry-only sessions (cost but no hook-captured prompt) keep
            # one row; stub sessions with neither prompt nor spend are skipped.
            whole = session_cost(record, events, manager.config, manager.repo_path)
            if _float_value((whole.get("cost_usd") or {}).get("value")) <= 0:
                continue
            rows.append(_pilot_prompt_row(record, manager, events, segment=events, prompt_number=None, prompt_text=None, is_last_segment=True))
            continue
        for number, start in enumerate(prompt_indices, start=1):
            end = prompt_indices[number] if number < len(prompt_indices) else len(events)
            # Leading pre-prompt events (session_started, stray telemetry)
            # belong to the first prompt's segment.
            segment = events[0:end] if number == 1 else events[start:end]
            prompt_text = str(events[start].payload.get("prompt") or "")
            rows.append(_pilot_prompt_row(
                record, manager, events, segment=segment, prompt_number=number,
                prompt_text=prompt_text, is_last_segment=number == len(prompt_indices),
            ))

    default_total = sum(_float_value(row.get("estimatedDefaultCostUsd")) for row in rows)
    sidecar_total = sum(_float_value(row.get("sidecarCostUsd")) for row in rows)
    savings_total = default_total - sidecar_total
    tokens_used_total = sum(_int_value(row.get("tokensUsed")) for row in rows)
    avoided_tokens_total = sum(_int_value(row.get("estimatedAvoidedTokens")) for row in rows)
    default_tokens_total = tokens_used_total + avoided_tokens_total
    plan_multiplier = round(default_tokens_total / tokens_used_total, 3) if tokens_used_total > 0 else 1.0
    billing = detect_billing(manager.config)
    plan_monthly = billing.get("planMonthlyUsd")
    effective_plan_value = round(float(plan_monthly) * plan_multiplier, 2) if isinstance(plan_monthly, (int, float)) else None
    arms = report.get("arms") or {}
    assist = arms.get("assist") or {}
    control = arms.get("control") or {}
    return {
        "generatedAt": _iso(utc_now()),
        "billing": billing,
        "totals": {
            "promptCount": len(rows),
            "sessionCount": len({row.get("sessionId") for row in rows}),
            "estimatedDefaultCostUsd": round(default_total, 6),
            "sidecarCostUsd": round(sidecar_total, 6),
            "estimatedSavingsUsd": round(savings_total, 6),
            "estimatedSavingsPercent": _fraction(savings_total, default_total),
            "tokensUsed": tokens_used_total,
            "estimatedAvoidedTokens": avoided_tokens_total,
            "estimatedDefaultTokens": default_tokens_total,
            "planMultiplier": plan_multiplier,
            "apiEquivalentUsd": round(sidecar_total, 6),
            "effectivePlanValueUsd": effective_plan_value,
            "assistSessions": _int_value(assist.get("sessions")),
            "controlSessions": _int_value(control.get("sessions")),
            "refinementsDelivered": _int_value(assist.get("refinements_delivered")) + _int_value(control.get("refinements_delivered")),
            "refinementsSuppressed": _int_value(assist.get("refinements_suppressed")) + _int_value(control.get("refinements_suppressed")),
            "steeringRecommendations": _int_value(assist.get("steering_recommendations")) + _int_value(control.get("steering_recommendations")),
            "shadowDetections": _int_value(assist.get("shadow_detections")) + _int_value(control.get("shadow_detections")),
        },
        "defaultCostAlgorithm": {
            "basis": "k-calibration",
            "description": "estimated default cost = measured sidecar cost + k-estimated avoided iterations x measured cost per iteration",
            "kCalibrated": k_calibration_path(manager.repo_path).exists(),
            "kValues": report.get("k_calibration") or {},
        },
        "measurement": report,
        "prompts": rows,
        "history": _pilot_history(rows),
    }


def _pilot_prompt_row(
    record: SessionRecord,
    manager: SessionManager,
    events: list[SidecarEvent],
    *,
    segment: list[SidecarEvent],
    prompt_number: int | None,
    prompt_text: str | None,
    is_last_segment: bool,
) -> dict[str, Any]:
    measured = _measured_from_api_requests(segment)
    if measured is not None:
        cost_info = measured.get("cost_usd") or {}
        model = measured.get("model")
        tokens_info = measured.get("tokens") or {}
    else:
        whole = session_cost(record, events, manager.config, manager.repo_path)
        cost_info = (whole.get("cost_usd") or {}) if prompt_number is None else {}
        model = whole.get("model") if prompt_number is None else None
        tokens_info = (whole.get("tokens") or {}) if prompt_number is None else {}
    sidecar_cost = _float_value(cost_info.get("value"))
    tokens_used = _int_value(tokens_info.get("input")) + _int_value(tokens_info.get("output"))
    avoided_iterations = 0.0
    observed_iterations = 0
    refinements_delivered = 0
    refinements_suppressed = 0
    steering_recommendations = 0
    shadow_detections = 0
    for event in segment:
        if event.event_type in PILOT_ITERATION_EVENT_TYPES:
            observed_iterations += 1
        elif event.event_type == "prompt_refined":
            refinements_delivered += 1
        elif event.event_type == "refinement_suppressed":
            refinements_suppressed += 1
        elif event.event_type == "steering_recommendation":
            steering_recommendations += 1
            waste = event.payload.get("estimated_avoided_waste") or {}
            iterations = waste.get("iterations")
            if isinstance(iterations, (int, float)) and iterations > 0:
                avoided_iterations += float(iterations)
        elif event.event_type == "shadow_detection":
            shadow_detections += 1
    cost_per_iteration = sidecar_cost / observed_iterations if observed_iterations > 0 else 0.0
    avoided_cost = round(avoided_iterations * cost_per_iteration, 6)
    default_cost = round(sidecar_cost + avoided_cost, 6)
    tokens_per_iteration = tokens_used / observed_iterations if observed_iterations > 0 else 0.0
    avoided_tokens = int(round(avoided_iterations * tokens_per_iteration))
    started_at = segment[0].timestamp if segment else record.started_at
    updated_at = segment[-1].timestamp if segment else record.stopped_at or record.started_at
    truncated_prompt = None
    if prompt_text:
        truncated_prompt = prompt_text if len(prompt_text) <= PROMPT_TEXT_LIMIT else prompt_text[: PROMPT_TEXT_LIMIT - 1].rstrip() + "…"
    label = f"Prompt {prompt_number}" if prompt_number is not None else "Telemetry only"
    return _drop_none({
        "id": f"{record.session_id}:p{prompt_number}" if prompt_number is not None else record.session_id,
        "sessionId": record.session_id,
        "label": label,
        "promptText": truncated_prompt,
        "arm": assigned_arm(record.session_id, manager.config),
        "status": "active" if record.status == "active" and is_last_segment else "completed",
        "startedAt": _iso(started_at),
        "updatedAt": _iso(updated_at),
        "completedAt": _iso(record.stopped_at) if record.stopped_at and is_last_segment else None,
        "estimatedDefaultCostUsd": default_cost,
        "sidecarCostUsd": round(sidecar_cost, 6),
        "estimatedAvoidedCostUsd": avoided_cost,
        "tokensUsed": tokens_used,
        "estimatedAvoidedTokens": avoided_tokens,
        "estimatedDefaultTokens": tokens_used + avoided_tokens,
        "avoidedIterations": round(avoided_iterations, 2),
        "observedIterations": observed_iterations,
        "costPrecision": str(cost_info.get("precision") or Precision.approximate.value),
        "promptsSubmitted": 1 if prompt_number is not None else 0,
        "refinementsDelivered": refinements_delivered,
        "refinementsSuppressed": refinements_suppressed,
        "steeringRecommendations": steering_recommendations,
        "shadowDetections": shadow_detections,
        "modelRoute": str(model or record.model or "") or None,
        "taskType": _task_type(segment),
        "promptHashCount": _prompt_hash_count(segment),
    })


def _pilot_history(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Daily rollup of the prompt rows, oldest day first."""
    days: dict[str, dict[str, Any]] = {}
    day_sessions: dict[str, set[str]] = {}
    for row in rows:
        day = str(row.get("startedAt") or "")[:10]
        if not day:
            continue
        bucket = days.setdefault(day, {
            "day": day,
            "sessions": 0,
            "promptsSubmitted": 0,
            "estimatedDefaultCostUsd": 0.0,
            "sidecarCostUsd": 0.0,
            "estimatedSavingsUsd": 0.0,
            "tokensUsed": 0,
            "estimatedAvoidedTokens": 0,
        })
        day_sessions.setdefault(day, set()).add(str(row.get("sessionId")))
        bucket["promptsSubmitted"] += _int_value(row.get("promptsSubmitted"))
        bucket["tokensUsed"] += _int_value(row.get("tokensUsed"))
        bucket["estimatedAvoidedTokens"] += _int_value(row.get("estimatedAvoidedTokens"))
        bucket["estimatedDefaultCostUsd"] = round(bucket["estimatedDefaultCostUsd"] + _float_value(row.get("estimatedDefaultCostUsd")), 6)
        bucket["sidecarCostUsd"] = round(bucket["sidecarCostUsd"] + _float_value(row.get("sidecarCostUsd")), 6)
        bucket["estimatedSavingsUsd"] = round(bucket["estimatedDefaultCostUsd"] - bucket["sidecarCostUsd"], 6)
    for day, bucket in days.items():
        bucket["sessions"] = len(day_sessions.get(day, set()))
    return [days[day] for day in sorted(days)]


def _dashboard_totals(runs: list[dict[str, Any]]) -> dict[str, Any]:
    default_cost = sum(_float_value(run.get("defaultCostUsd")) for run in runs)
    sidecar_cost = sum(_float_value(run.get("sidecarCostUsd")) for run in runs)
    savings = default_cost - sidecar_cost
    timing_runs = [
        run for run in runs
        if run.get("defaultExecutionMs") is not None and run.get("sidecarExecutionMs") is not None
    ]
    default_ms = sum(_int_value(run.get("defaultExecutionMs")) for run in timing_runs)
    sidecar_ms = sum(_int_value(run.get("sidecarExecutionMs")) for run in timing_runs)
    evaluated = [run for run in runs if run.get("qualityVerdict") != "not_evaluated"]
    preserved = [run for run in evaluated if run.get("qualityVerdict") == "preserved"]
    return {
        "runCount": len(runs),
        "defaultCostUsd": round(default_cost, 6),
        "sidecarCostUsd": round(sidecar_cost, 6),
        "savingsUsd": round(savings, 6),
        "savingsPercent": _fraction(savings, default_cost),
        "defaultExecutionMs": default_ms if timing_runs else None,
        "sidecarExecutionMs": sidecar_ms if timing_runs else None,
        "executionDeltaMs": sidecar_ms - default_ms if timing_runs else None,
        "timingSampleCount": len(timing_runs),
        "qualityPreservedRuns": len(preserved),
        "qualityEvaluatedRuns": len(evaluated),
        "qualityPreservationRate": _fraction(len(preserved), len(evaluated)),
    }


def _swebench_timestamp(value: str) -> str:
    try:
        parsed = datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return _iso(utc_now())
    return _iso(parsed)


def _optional_score(*values: Any) -> int | None:
    for value in values:
        if isinstance(value, bool):
            continue
        if isinstance(value, int):
            return value
        if isinstance(value, float) and value.is_integer():
            return int(value)
        if isinstance(value, str):
            try:
                return int(value)
            except ValueError:
                continue
    return None


def _model_route_from_sources(*phases: dict[str, Any]) -> str | None:
    sources: list[str] = []
    for phase in phases:
        by_source = phase.get("by_source") if isinstance(phase.get("by_source"), dict) else {}
        sources.extend(str(key) for key in by_source)
    return ", ".join(dict.fromkeys(sources)) or None


def _task_type(events: list[SidecarEvent]) -> str:
    for event in reversed(events):
        task_type = event.payload.get("task_type") or event.payload.get("taskType")
        if task_type:
            return str(task_type)
    if any(event.event_type == "file_edit_observed" for event in events):
        return "code_edit"
    if any(event.event_type == "prompt_refined" for event in events):
        return "coding_prompt"
    return "coding_session"


def _prompt_hash_count(events: list[SidecarEvent]) -> int:
    hashes: set[str] = set()
    for event in events:
        for key in ("prompt_hash", "optimized_prompt_hash", "original_prompt_hash", "promptHash", "optimizedPromptHash", "originalPromptHash"):
            value = event.payload.get(key)
            if value:
                hashes.add(str(value))
        for key in ("prompt", "refined_prompt"):
            value = event.payload.get(key)
            if value:
                hashes.add(hashlib.sha256(str(value).encode("utf-8")).hexdigest())
    return len(hashes)


def _duration_ms(started_at: datetime, ended_at: datetime | None) -> int | None:
    if ended_at is None:
        return None
    return max(0, int((ended_at - started_at).total_seconds() * 1000))


def _optional_delta(left: Any, right: Any) -> int | None:
    left_int = _optional_int(left)
    right_int = _optional_int(right)
    if left_int is None or right_int is None:
        return None
    return right_int - left_int


def _optional_int(value: Any) -> int | None:
    if value is None:
        return None
    return _int_value(value)


def _int_value(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _float_value(value: Any) -> float:
    try:
        return float(value or 0.0)
    except (TypeError, ValueError):
        return 0.0


def _fraction(numerator: float | int, denominator: float | int) -> float:
    denominator_float = float(denominator or 0.0)
    return round(float(numerator or 0.0) / denominator_float, 6) if denominator_float > 0 else 0.0


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _drop_none(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _drop_none(item) for key, item in value.items() if item is not None}
    if isinstance(value, list):
        return [_drop_none(item) for item in value]
    return value


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
