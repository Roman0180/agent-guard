from __future__ import annotations

import hashlib
import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, Field

from agent_sidecar.schema.config import SidecarConfig, TraceCaptureConfig


class TraceUsage(BaseModel):
    input: int = 0
    output: int = 0
    cache_read: int = 0
    cache_creation: int = 0


class PolicyDecision(BaseModel):
    policy: str
    mode: Literal["shadow", "enforce"]
    # What the policy did (enforce) or would have done (shadow).
    action: str
    reason: str
    enforced: bool = False
    estimated_saved_tokens: int = 0
    estimated_saved_usd: float = 0.0


class TraceRecord(BaseModel):
    trace_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str
    session_id: str
    path: str
    model: str | None = None
    status: int
    latency_ms: int
    # Full payloads, or None when the capture layer runs with redact_content on.
    request: dict[str, Any] | None = None
    response: dict[str, Any] | None = None
    redacted: bool = False
    request_sha256: str
    request_chars: int
    response_chars: int = 0
    usage: TraceUsage = Field(default_factory=TraceUsage)
    stop_reason: str | None = None
    is_retry: bool = False
    retry_of: str | None = None
    retry_count: int = 0
    malformed_tool_call: bool = False
    policy_decisions: list[PolicyDecision] = Field(default_factory=list)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def normalized_request_hash(payload: dict[str, Any]) -> tuple[str, int]:
    """Hash of the normalized message content, used for retry detection.

    Normalization collapses whitespace and keeps only role + content, so retries
    that differ in dynamic metadata (ids, timestamps, sampling params) still match.
    """
    messages = payload.get("messages")
    if isinstance(messages, list):
        normalized = [
            {
                "role": str(item.get("role") or ""),
                "content": " ".join(_content_text(item.get("content")).split()),
            }
            for item in messages
            if isinstance(item, dict)
        ]
    else:
        normalized = " ".join(str(payload.get("prompt") or "").split())
    encoded = json.dumps(normalized, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest(), len(encoded)


def _content_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict):
                parts.append(str(block.get("text") or block.get("content") or ""))
            else:
                parts.append(str(block))
        return " ".join(parts)
    return str(content or "")


class RetryDetector:
    """Flags near-duplicate requests within a per-session time window."""

    def __init__(self, window_seconds: float) -> None:
        self.window_seconds = window_seconds
        self._seen: dict[tuple[str, str], list[tuple[float, str]]] = {}
        self._lock = threading.Lock()

    def observe(self, session_id: str, request_hash: str, *, now: float, trace_id: str) -> tuple[bool, str | None, int]:
        """Returns (is_retry, first_matching_trace_id, prior_matches_in_window)."""
        key = (session_id, request_hash)
        with self._lock:
            entries = [entry for entry in self._seen.get(key, []) if now - entry[0] <= self.window_seconds]
            is_retry = bool(entries)
            retry_of = entries[0][1] if entries else None
            entries.append((now, trace_id))
            self._seen[key] = entries
            return is_retry, retry_of, len(entries) - 1

    def count(self, session_id: str, request_hash: str, *, now: float) -> int:
        """Prior matches in the window, without recording an observation."""
        with self._lock:
            entries = self._seen.get((session_id, request_hash), [])
            return sum(1 for ts, _trace_id in entries if now - ts <= self.window_seconds)


class S3Sink:
    """Best-effort mirror of trace records to s3://bucket/prefix. Requires boto3."""

    def __init__(self, s3_url: str) -> None:
        parsed = urlparse(s3_url)
        if parsed.scheme != "s3" or not parsed.netloc:
            raise ValueError(f"invalid S3 trace sink url: {s3_url!r} (expected s3://bucket/prefix)")
        import boto3

        self.bucket = parsed.netloc
        self.prefix = parsed.path.strip("/")
        self._client = boto3.client("s3")

    def put(self, record: TraceRecord) -> None:
        key = f"{self.prefix}/{record.trace_id}.json" if self.prefix else f"{record.trace_id}.json"
        self._client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=record.model_dump_json().encode("utf-8"),
            ContentType="application/json",
        )


class TraceStore:
    def __init__(self, repo_path: Path, capture: TraceCaptureConfig) -> None:
        self.capture = capture
        path = Path(capture.trace_path)
        self.path = path if path.is_absolute() else repo_path / path
        self._lock = threading.Lock()
        self._sink = S3Sink(capture.s3_url) if capture.s3_url else None

    def append(self, record: TraceRecord) -> None:
        with self._lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.open("a", encoding="utf-8") as handle:
                handle.write(record.model_dump_json() + "\n")
        if self._sink is not None:
            try:
                self._sink.put(record)
            except Exception:
                # The local JSONL is the source of truth; a flaky mirror must never
                # fail the request path.
                pass

    def iter_records(self) -> Iterator[TraceRecord]:
        if not self.path.exists():
            return
        with self.path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield TraceRecord.model_validate_json(line)
                except ValueError:
                    continue


def trace_store(repo_path: Path, config: SidecarConfig) -> TraceStore:
    return TraceStore(repo_path, config.gateway.capture)
