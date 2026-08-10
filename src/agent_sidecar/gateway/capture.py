from __future__ import annotations

import json
from typing import Any

from agent_sidecar.gateway.traces import (
    PolicyDecision,
    RetryDetector,
    TraceRecord,
    TraceUsage,
    normalized_request_hash,
    utc_now_iso,
)
from agent_sidecar.schema.config import TraceCaptureConfig


def build_trace(
    *,
    session_id: str,
    path: str,
    request_body: bytes,
    response_body: bytes,
    status: int,
    latency_ms: int,
    capture: TraceCaptureConfig,
    detector: RetryDetector,
    now: float,
    policy_decisions: list[PolicyDecision] | None = None,
) -> TraceRecord:
    request = _parse_json(request_body)
    response = _parse_json(response_body)
    request_hash, request_chars = normalized_request_hash(request or {})
    record = TraceRecord(
        timestamp=utc_now_iso(),
        session_id=session_id,
        path=path,
        model=_model_of(request, response),
        status=status,
        latency_ms=latency_ms,
        request=None if capture.redact_content else request,
        response=None if capture.redact_content else response,
        redacted=capture.redact_content,
        request_sha256=request_hash,
        request_chars=request_chars,
        response_chars=len(response_body),
        usage=usage_from_response(response),
        stop_reason=stop_reason_from_response(response),
        malformed_tool_call=has_malformed_tool_call(response),
        policy_decisions=policy_decisions or [],
    )
    is_retry, retry_of, retry_count = detector.observe(session_id, request_hash, now=now, trace_id=record.trace_id)
    record.is_retry = is_retry
    record.retry_of = retry_of
    record.retry_count = retry_count
    return record


def usage_from_response(response: dict[str, Any] | None) -> TraceUsage:
    if not isinstance(response, dict):
        return TraceUsage()
    usage = response.get("usage")
    if isinstance(usage, dict):
        # OpenAI-compatible and Anthropic shapes.
        return TraceUsage(
            input=_as_int(usage.get("prompt_tokens", usage.get("input_tokens"))),
            output=_as_int(usage.get("completion_tokens", usage.get("output_tokens"))),
            cache_read=_as_int(usage.get("cache_read_input_tokens")),
            cache_creation=_as_int(usage.get("cache_creation_input_tokens")),
        )
    # Ollama native shape.
    return TraceUsage(
        input=_as_int(response.get("prompt_eval_count")),
        output=_as_int(response.get("eval_count")),
    )


def stop_reason_from_response(response: dict[str, Any] | None) -> str | None:
    if not isinstance(response, dict):
        return None
    for key in ("stop_reason", "done_reason"):
        value = response.get(key)
        if isinstance(value, str) and value:
            return value
    choices = response.get("choices")
    if isinstance(choices, list) and choices and isinstance(choices[0], dict):
        value = choices[0].get("finish_reason")
        if isinstance(value, str) and value:
            return value
    return None


def has_malformed_tool_call(response: dict[str, Any] | None) -> bool:
    """A tool call whose arguments fail to parse as JSON. Anthropic tool_use inputs
    arrive pre-parsed, so only string-argument shapes (OpenAI/Ollama) can be malformed."""
    if not isinstance(response, dict):
        return False
    for call in _tool_calls(response):
        function = call.get("function") if isinstance(call.get("function"), dict) else call
        arguments = function.get("arguments")
        if isinstance(arguments, str):
            try:
                json.loads(arguments)
            except json.JSONDecodeError:
                return True
    return False


def _tool_calls(response: dict[str, Any]) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []
    choices = response.get("choices")
    if isinstance(choices, list):
        for choice in choices:
            message = choice.get("message") if isinstance(choice, dict) else None
            if isinstance(message, dict) and isinstance(message.get("tool_calls"), list):
                calls.extend(call for call in message["tool_calls"] if isinstance(call, dict))
    message = response.get("message")
    if isinstance(message, dict) and isinstance(message.get("tool_calls"), list):
        calls.extend(call for call in message["tool_calls"] if isinstance(call, dict))
    return calls


def _model_of(request: dict[str, Any] | None, response: dict[str, Any] | None) -> str | None:
    for payload in (response, request):
        if isinstance(payload, dict):
            model = payload.get("model")
            if isinstance(model, str) and model:
                return model
    return None


def _parse_json(body: bytes) -> dict[str, Any] | None:
    if not body:
        return None
    try:
        parsed = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _as_int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0
