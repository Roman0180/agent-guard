from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

from agent_sidecar.models.local_services import model_is_served
from agent_sidecar.models.registry import ModelRegistryEntry, load_registry
from agent_sidecar.schema.config import SidecarConfig, load_config
from agent_sidecar.schema.model_io import ModelRole


@dataclass(frozen=True)
class ModelRoute:
    role: ModelRole
    model_id: str
    litellm_model: str
    api_base: str
    serving: Literal["ollama", "llama_server"]
    kind: Literal["base", "tuned"]
    available: bool = True
    reason: str | None = None
    served: bool | None = None


class ModelRouter:
    def __init__(self, repo_path: Path, config: SidecarConfig | None = None) -> None:
        self.repo_path = repo_path
        self.config = config or load_config(repo_path)

    def resolve(self, role: ModelRole) -> ModelRoute:
        tier = resolve_hardware_tier(self.config.models.hardware_tier)
        active = load_registry(self.repo_path).active_for_role(role)
        if active:
            return self._route_from_registry_entry(active)
        if role == ModelRole.coding and tier == "small":
            return self._unavailable(role, "coding role disabled on small hardware tier")
        role_config = self.config.models.roles[role.value]
        serving: Literal["ollama", "llama_server"] = "ollama" if role == ModelRole.reasoning else "llama_server"
        endpoint = self.config.models.endpoints[serving]
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
        endpoint_key: Literal["ollama", "llama_server"] = entry.serving
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
