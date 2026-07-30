from __future__ import annotations

import os
import time
import socket
from pathlib import Path
from typing import Callable
from urllib.parse import urlparse

import httpx
from pydantic import BaseModel

from agent_sidecar.models.local_services import model_is_served
from agent_sidecar.models.router import ModelRoute, ModelRouter, validate_route_allowed
from agent_sidecar.models.validation import validate_json_text
from agent_sidecar.schema.config import SidecarConfig, load_config
from agent_sidecar.schema.events import EventMeta, EventSource, SidecarEvent
from agent_sidecar.schema.model_io import ModelRole


EventSink = Callable[[SidecarEvent], None]


class LiteLLMModelProvider:
    def __init__(
        self,
        repo_path: Path,
        config: SidecarConfig | None = None,
        *,
        session_id: str | None = None,
        event_sink: EventSink | None = None,
    ) -> None:
        self.repo_path = repo_path
        self.config = config or load_config(repo_path)
        self.router = ModelRouter(repo_path, self.config)
        self.session_id = session_id
        self.event_sink = event_sink

    def complete_json(
        self,
        role: ModelRole,
        task: str,
        prompt: str,
        schema: type[BaseModel],
        timeout_ms: int | None = None,
    ) -> BaseModel | None:
        started = time.monotonic()
        route = self.router.resolve(role)
        valid_json = False
        fallback_used = True
        failure_reason: str | None = None
        try:
            if not validate_route_allowed(route, self.config):
                failure_reason = "route_not_allowed"
                return None
            if not _endpoint_reachable(route.api_base):
                failure_reason = "endpoint_unreachable"
                return None
            served, _reason = model_is_served(route.model_id, route.serving, route.api_base, timeout_s=0.5)
            if not served:
                failure_reason = _reason or "model_not_served"
                return None
            timeout_s = self._timeout_ms(timeout_ms) / 1000
            response = self._completion(route, task, prompt, timeout_s)
            parsed = validate_json_text(response, schema)
            if parsed is None:
                retry = self._completion(
                    route,
                    "Return strict JSON only for the requested schema.",
                    f"Previous response was invalid. Reformat this as strict JSON only:\n{response}",
                    timeout_s,
                )
                parsed = validate_json_text(retry, schema)
            valid_json = parsed is not None
            fallback_used = parsed is None
            if parsed is None:
                failure_reason = "invalid_json"
            return parsed
        except Exception:
            failure_reason = "model_call_failed"
            return None
        finally:
            self._emit_model_call(role, route.model_id or "unavailable", started, valid_json, fallback_used, failure_reason=failure_reason)

    def health(self) -> dict:
        return {"roles": self.router.table()}

    def _timeout_ms(self, timeout_ms: int | None = None) -> int:
        if timeout_ms is not None:
            return timeout_ms
        configured = os.environ.get("AGENT_SIDECAR_MODEL_TIMEOUT_MS")
        if configured:
            try:
                return int(configured)
            except ValueError:
                pass
        return self.config.models.timeout_ms

    def _max_tokens(self) -> int:
        configured = os.environ.get("AGENT_SIDECAR_MODEL_MAX_TOKENS")
        if configured:
            try:
                return int(configured)
            except ValueError:
                pass
        return 768

    def _completion(self, route: ModelRoute, task: str, prompt: str, timeout_s: float) -> str:
        if route.serving == "ollama":
            return self._ollama_completion(route, task, prompt, timeout_s)

        import litellm

        extra: dict[str, object] = {"max_tokens": self._max_tokens()}
        if route.serving == "llama_server":
            extra["api_key"] = os.environ.get("AGENT_SIDECAR_LLAMA_SERVER_API_KEY", "local")
        elif route.serving == "deepseek":
            api_key = os.environ.get("DEEPSEEK_API_KEY") or os.environ.get("AGENT_SIDECAR_DEEPSEEK_API_KEY")
            if api_key:
                extra["api_key"] = api_key

        response = litellm.completion(
            model=route.litellm_model,
            api_base=route.api_base,
            messages=[
                {"role": "system", "content": f"{task}\nReturn only a single JSON object."},
                {"role": "user", "content": prompt},
            ],
            temperature=0,
            timeout=timeout_s,
            **extra,
        )
        content = response.choices[0].message.content
        return str(content or "")

    def _ollama_completion(self, route: ModelRoute, task: str, prompt: str, timeout_s: float) -> str:
        response = httpx.post(
            f"{route.api_base.rstrip('/')}/api/chat",
            json={
                "model": route.model_id,
                "messages": [
                    {"role": "system", "content": f"{task}\nReturn only a single JSON object."},
                    {"role": "user", "content": prompt},
                ],
                "stream": False,
                "format": "json",
                "think": False,
                "options": {"temperature": 0, "num_predict": self._max_tokens()},
            },
            timeout=timeout_s,
        )
        response.raise_for_status()
        payload = response.json()
        message = payload.get("message") if isinstance(payload, dict) else None
        if isinstance(message, dict):
            content = message.get("content")
            if isinstance(content, str):
                return content
            reasoning = message.get("reasoning_content") or message.get("thinking")
            if isinstance(reasoning, str):
                return reasoning
        return ""

    def _emit_model_call(self, role: ModelRole, model_id: str, started: float, valid_json: bool, fallback_used: bool, *, failure_reason: str | None = None) -> None:
        if not self.event_sink or not self.session_id:
            return
        event = SidecarEvent(
            session_id=self.session_id,
            event_type="model_call_completed",
            source=EventSource.detector,
            payload={
                "role": role.value,
                "model_id": model_id,
                "latency_ms": int((time.monotonic() - started) * 1000),
                "valid_json": valid_json,
                "fallback_used": fallback_used,
                "failure_reason": failure_reason,
            },
            metadata=EventMeta(repo_path=str(self.repo_path)),
        )
        self.event_sink(event)


def _endpoint_reachable(api_base: str) -> bool:
    parsed = urlparse(api_base)
    host = parsed.hostname
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    if not host:
        return False
    try:
        with socket.create_connection((host, port), timeout=1.0):
            return True
    except OSError:
        return False
