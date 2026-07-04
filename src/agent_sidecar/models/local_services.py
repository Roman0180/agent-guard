from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

import httpx


ServingBackend = Literal["ollama", "llama_server"]


@dataclass(frozen=True)
class ServiceModel:
    id: str
    backend: ServingBackend
    raw: dict[str, Any]


@dataclass(frozen=True)
class ServiceStatus:
    backend: ServingBackend
    api_base: str
    reachable: bool
    models: list[ServiceModel]
    error: str | None = None


def service_status(backend: ServingBackend, api_base: str, *, timeout_s: float = 0.5) -> ServiceStatus:
    try:
        models = list_ollama_models(api_base, timeout_s=timeout_s) if backend == "ollama" else list_openai_models(api_base, timeout_s=timeout_s)
        return ServiceStatus(backend=backend, api_base=api_base, reachable=True, models=models)
    except (httpx.HTTPError, ValueError) as error:
        return ServiceStatus(backend=backend, api_base=api_base, reachable=False, models=[], error=str(error))


def list_ollama_models(api_base: str, *, timeout_s: float = 0.5) -> list[ServiceModel]:
    response = httpx.get(f"{api_base.rstrip('/')}/api/tags", timeout=timeout_s)
    response.raise_for_status()
    payload = response.json()
    models = payload.get("models")
    if not isinstance(models, list):
        raise ValueError("Ollama /api/tags returned no models list")
    result: list[ServiceModel] = []
    for item in models:
        if not isinstance(item, dict):
            continue
        model_id = item.get("name") or item.get("model")
        if isinstance(model_id, str):
            result.append(ServiceModel(id=model_id, backend="ollama", raw=item))
    return result


def list_openai_models(api_base: str, *, timeout_s: float = 0.5) -> list[ServiceModel]:
    response = httpx.get(f"{api_base.rstrip('/')}/models", timeout=timeout_s)
    response.raise_for_status()
    payload = response.json()
    data = payload.get("data")
    if not isinstance(data, list):
        raise ValueError("OpenAI-compatible /models returned no data list")
    result: list[ServiceModel] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        model_id = item.get("id")
        if isinstance(model_id, str):
            result.append(ServiceModel(id=model_id, backend="llama_server", raw=item))
    return result


def model_is_served(model_id: str, backend: ServingBackend, api_base: str, *, timeout_s: float = 0.5) -> tuple[bool, str | None]:
    status = service_status(backend, api_base, timeout_s=timeout_s)
    if not status.reachable:
        return False, status.error or f"{backend} endpoint is unreachable"
    installed = {model.id for model in status.models}
    if model_id in installed or (backend == "ollama" and ":" not in model_id and f"{model_id}:latest" in installed):
        return True, None
    return False, f"{model_id} is not served by {backend}"


def pull_ollama_model(api_base: str, model_id: str, *, timeout_s: float = 1800.0) -> dict[str, Any]:
    response = httpx.post(f"{api_base.rstrip('/')}/api/pull", json={"name": model_id, "stream": False}, timeout=timeout_s)
    response.raise_for_status()
    payload = response.json()
    return payload if isinstance(payload, dict) else {"status": "ok"}
