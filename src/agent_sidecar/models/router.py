from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

from agent_sidecar.models.local_services import ServingBackend, model_is_served
from agent_sidecar.models.registry import ModelRegistryEntry, load_registry
from agent_sidecar.schema.config import SidecarConfig, load_config
from agent_sidecar.schema.model_io import ModelRole


@dataclass(frozen=True)
class ModelRoute:
    role: ModelRole
    model_id: str
    litellm_model: str
    api_base: str
    serving: ServingBackend
    kind: Literal["base", "tuned"]
    available: bool = True
    reason: str | None = None
    served: bool | None = None


class ModelRouter:
    def __init__(self, repo_path: Path, config: SidecarConfig | None = None) -> None:
        self.repo_path = repo_path
        self.config = config or load_config(repo_path)

    def resolve(self, role: ModelRole) -> ModelRoute:
        active = load_registry(self.repo_path).active_for_role(role)
        if active:
            return self._route_from_registry_entry(active)
        role_config = self.config.models.roles[role.value]
        serving = role_config.serving or infer_serving(role, role_config.fallback_base)
        endpoint = self.config.models.endpoints.get(serving)
        if endpoint is None:
            return self._unavailable(role, f"missing model endpoint: {serving}")
        return ModelRoute(
            role=role,
            model_id=role_config.fallback_base,
            litellm_model=f"{endpoint.litellm_prefix}{role_config.fallback_base}",
            api_base=endpoint.api_base,
            serving=serving,
            kind="base",
        )

    def table(self, *, check_served: bool = False) -> list[dict[str, str | bool | None]]:
        rows: list[dict[str, str | bool | None]] = []
        for role in ModelRole:
            route = self.resolve(role)
            available = route.available
            reason = route.reason
            served = route.served
            if check_served and route.available:
                served, service_reason = model_is_served(route.model_id, route.serving, route.api_base)
                if not served:
                    available = False
                    reason = service_reason
            rows.append({
                "role": role.value,
                "model_id": route.model_id,
                "serving": route.serving,
                "kind": route.kind,
                "available": available,
                "reason": reason,
                "api_base": route.api_base,
                "served": served,
                "litellm_model": route.litellm_model,
            })
        return rows

    def _route_from_registry_entry(self, entry: ModelRegistryEntry) -> ModelRoute:
        endpoint_key = entry.serving
        endpoint = self.config.models.endpoints[endpoint_key]
        return ModelRoute(
            role=entry.role,
            model_id=entry.name,
            litellm_model=f"{endpoint.litellm_prefix}{entry.name}",
            api_base=endpoint.api_base,
            serving=endpoint_key,
            kind=entry.kind,
        )

    def _unavailable(self, role: ModelRole, reason: str) -> ModelRoute:
        return ModelRoute(role=role, model_id="", litellm_model="", api_base="", serving="ollama", kind="base", available=False, reason=reason)


def resolve_hardware_tier(configured: str) -> str:
    if configured != "auto":
        return configured
    try:
        pages = os.sysconf("SC_PHYS_PAGES")
        page_size = os.sysconf("SC_PAGE_SIZE")
        gib = pages * page_size / (1024**3)
    except (AttributeError, OSError, ValueError):
        return "small"
    if gib >= 96:
        return "max"
    if gib >= 48:
        return "large"
    if gib >= 24:
        return "medium"
    return "small"


def infer_serving(role: ModelRole, model_id: str) -> ServingBackend:
    normalized = model_id.lower()
    if normalized.startswith("deepseek-v4") or normalized.startswith("deepseek-ai/deepseek-v4"):
        return "llama_server"
    if normalized.startswith("qwen/qwen3-coder-next") or normalized.startswith("qwen3-coder-next"):
        return "llama_server"
    if role == ModelRole.reasoning:
        return "ollama"
    if normalized.startswith("deepseek-r1") or normalized.startswith("deepseek-coder") or normalized.startswith("qwen"):
        return "ollama"
    if normalized.startswith("kimi"):
        return "llama_server"
    if normalized.startswith("deepseek-chat") or normalized.startswith("deepseek-reasoner"):
        return "deepseek"
    return "llama_server"


def validate_route_allowed(route: ModelRoute, config: SidecarConfig) -> bool:
    if not route.available:
        return False
    if not config.models.remote_fallback and not is_loopback_url(route.api_base):
        return False
    for pattern in config.models.allowlist:
        model_pattern, _, api_base = pattern.partition("@")
        if api_base and api_base.rstrip("/") != route.api_base.rstrip("/"):
            continue
        if not config.models.remote_fallback and api_base and not is_loopback_url(api_base):
            continue
        if _model_matches(model_pattern, route.litellm_model):
            return True
    return False


def is_loopback_url(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.hostname in {"localhost", "127.0.0.1", "::1"}


def _model_matches(pattern: str, model: str) -> bool:
    if pattern.endswith("*"):
        return model.startswith(pattern[:-1])
    return pattern == model
