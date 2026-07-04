from __future__ import annotations

from datetime import datetime
from pathlib import Path

from agent_sidecar.schema.config import SidecarConfig, load_config, trace_dir
from agent_sidecar.schema.events import EventMeta, EventSource, SidecarEvent, ensure_session_id, utc_now
from agent_sidecar.schema.session import CostBudget, Money, Precision, SessionRecord, TokenUsage
from agent_sidecar.store.jsonl import append_event, read_events, read_raw_lines


class SessionManager:
    def __init__(self, repo_path: Path, config: SidecarConfig | None = None) -> None:
        self.repo_path = repo_path.resolve()
        self.config = config or load_config(self.repo_path)
        self.trace_dir = trace_dir(self.repo_path, self.config)
        self.trace_dir.mkdir(parents=True, exist_ok=True)
        self._records: dict[str, SessionRecord] = {}

    def trace_path(self, session_id: str) -> Path:
        return self.trace_dir / f"{ensure_session_id(session_id)}.jsonl"

    def create_session(self, session_id: str, *, repo_path: str | None = None, source: EventSource = EventSource.cli) -> SessionRecord:
        normalized = ensure_session_id(session_id)
        existing = self.get_session(normalized)
        if existing:
            return existing
        now = utc_now()
        record = SessionRecord(
            session_id=normalized,
            repo_path=repo_path or str(self.repo_path),
            status="active",
            started_at=now,
            trace_path=str(self.trace_path(normalized)),
            event_count=0,
            observation={"hooks": False, "otlp": False, "manual": False},
            config_snapshot=self.config.model_dump(mode="json"),
        )
        self._records[normalized] = record
        if source is not EventSource.hook:
            event = SidecarEvent(
                session_id=normalized,
                event_type="session_started",
                source=source,
                timestamp=now,
                payload={"created_by": source.value},
                metadata=EventMeta(repo_path=record.repo_path, confidence=1.0),
            )
            self.add_event(event)
        return self._records[normalized]

    def get_session(self, session_id: str) -> SessionRecord | None:
        normalized = ensure_session_id(session_id)
        if normalized in self._records:
            return self._records[normalized]
        path = self.trace_path(normalized)
        events = read_events(path)
        if not events:
            return None
        record = self._record_from_events(normalized, events, path)
        self._records[normalized] = record
        return record

    def list_sessions(self) -> list[SessionRecord]:
        for path in sorted(self.trace_dir.glob("cc-*.jsonl")):
            self.get_session(path.stem)
        return sorted(self._records.values(), key=lambda record: record.started_at)

    def add_event(self, event: SidecarEvent) -> SessionRecord:
        record = self.get_session(event.session_id)
        if record is None:
            record = self._auto_record(event)
            self._records[event.session_id] = record
        append_event(Path(record.trace_path), event)
        updated = self._apply_event(record, event)
        self._records[event.session_id] = updated
        return updated

    def stop_session(self, session_id: str) -> SessionRecord:
        record = self.get_session(session_id) or self.create_session(session_id)
        event = SidecarEvent(
            session_id=record.session_id,
            event_type="session_stopped",
            source=EventSource.cli,
            payload={"stopped_by": "cli"},
            metadata=EventMeta(repo_path=record.repo_path),
        )
        self.add_event(event)
        return self._records[record.session_id]

    def trace_lines(self, session_id: str) -> list[str]:
        return read_raw_lines(self.trace_path(session_id))

    def events(self, session_id: str) -> list[SidecarEvent]:
        return read_events(self.trace_path(session_id))

    def _auto_record(self, event: SidecarEvent) -> SessionRecord:
        return SessionRecord(
            session_id=event.session_id,
            repo_path=event.metadata.repo_path,
            status="active",
            started_at=event.timestamp,
            trace_path=str(self.trace_path(event.session_id)),
            event_count=0,
            observation={"hooks": False, "otlp": False, "manual": False},
            config_snapshot=self.config.model_dump(mode="json"),
        )

    def _record_from_events(self, session_id: str, events: list[SidecarEvent], path: Path) -> SessionRecord:
        first = events[0]
        record = SessionRecord(
            session_id=session_id,
            repo_path=first.metadata.repo_path,
            status="active",
            started_at=first.timestamp,
            trace_path=str(path),
            event_count=0,
            observation={"hooks": False, "otlp": False, "manual": False},
            config_snapshot=self.config.model_dump(mode="json"),
        )
        for event in events:
            record = self._apply_event(record, event)
        return record

    def _apply_event(self, record: SessionRecord, event: SidecarEvent) -> SessionRecord:
        observation = dict(record.observation)
        if event.source is EventSource.hook:
            observation["hooks"] = True
        if event.source is EventSource.otlp:
            observation["otlp"] = True
        if event.source in {EventSource.cli, EventSource.manual}:
            observation["manual"] = True
        status = "stopped" if event.event_type == "session_stopped" else record.status
        stopped_at: datetime | None = event.timestamp if event.event_type == "session_stopped" else record.stopped_at
        tokens = record.tokens
        cost = record.cost_usd
        budget = record.budget
        model = record.model
        if event.event_type == "cost_estimate_updated":
            precision = Precision(event.payload.get("precision", Precision.approximate.value))
            tokens = TokenUsage(
                input=int(event.payload.get("gen_ai.usage.input_tokens", tokens.input if tokens else 0) or 0),
                output=int(event.payload.get("gen_ai.usage.output_tokens", tokens.output if tokens else 0) or 0),
                cache_read=int(event.payload.get("gen_ai.usage.cache_read_tokens", tokens.cache_read if tokens else 0) or 0),
                precision=precision,
            )
            cost = Money(value=float(event.payload.get("cost_usd", cost.value if cost else 0) or 0), precision=precision)
            model = str(event.payload.get("gen_ai.request.model") or model or "")
        if event.event_type == "budget_configured":
            precision = Precision(event.payload.get("precision", Precision.approximate.value))
            budget = CostBudget(
                baseline_session_id=event.payload.get("baseline_session_id"),
                baseline_cost_usd=Money(value=float(event.payload.get("baseline_cost_usd") or 0.0), precision=precision),
                limit_usd=Money(value=float(event.payload.get("budget_usd") or 0.0), precision=precision),
                target_savings_pct=float(event.payload.get("target_savings_pct") or 0.0),
                warning_threshold_pct=float(event.payload.get("warning_threshold_pct") or 80.0),
                enforcement=str(event.payload.get("enforcement") or "block"),
            )
        return record.model_copy(update={
            "status": status,
            "stopped_at": stopped_at,
            "event_count": record.event_count + 1,
            "observation": observation,
            "tokens": tokens,
            "cost_usd": cost,
            "budget": budget,
            "model": model or None,
        })
