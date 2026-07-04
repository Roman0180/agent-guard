from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

from agent_sidecar.schema.config import config_dir
from agent_sidecar.schema.model_io import ModelRole


class RegistryEval(BaseModel):
    suite: str
    score: float
    base_score: float
    passed: bool


class ModelRegistryEntry(BaseModel):
    name: str
    role: ModelRole
    kind: Literal["base", "tuned"] = "tuned"
    base: str
    serving: Literal["ollama", "llama_server"] = "ollama"
    adapter_sha256: str | None = None
    gguf_sha256: str | None = None
    trained_at: str | None = None
    recipe: str | None = None
    eval: RegistryEval | None = None
    status: Literal["active", "inactive"] = "inactive"


class ModelRegistry(BaseModel):
    version: int = 1
    entries: list[ModelRegistryEntry] = Field(default_factory=list)

    def active_for_role(self, role: ModelRole) -> ModelRegistryEntry | None:
        for entry in self.entries:
            if entry.role == role and entry.status == "active" and entry.eval and entry.eval.passed:
                return entry
        return None

    def by_name(self, name: str) -> ModelRegistryEntry | None:
        return next((entry for entry in self.entries if entry.name == name), None)


def registry_path(repo_path: Path) -> Path:
    return config_dir(repo_path) / "models" / "registry.json"


def load_registry(repo_path: Path, *, create: bool = True) -> ModelRegistry:
    path = registry_path(repo_path)
    if path.exists():
        return ModelRegistry.model_validate_json(path.read_text(encoding="utf-8"))
    registry = ModelRegistry()
    if create:
        save_registry(repo_path, registry)
    return registry


def save_registry(repo_path: Path, registry: ModelRegistry) -> None:
    path = registry_path(repo_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(registry.model_dump(mode="json"), indent=2) + "\n", encoding="utf-8")


def promote(repo_path: Path, name: str, *, eval_result: dict[str, Any] | RegistryEval | None = None) -> ModelRegistryEntry:
    registry = load_registry(repo_path)
    entry = registry.by_name(name)
    if entry is None:
        if eval_result is None:
            raise ValueError(f"model is not registered: {name}")
        entry = ModelRegistryEntry.model_validate(eval_result)
        registry.entries.append(entry)
    elif eval_result is not None:
        entry.eval = eval_result if isinstance(eval_result, RegistryEval) else RegistryEval.model_validate(eval_result)
    if not entry.eval or not entry.eval.passed:
        raise ValueError("promotion refused: model does not have a passing eval")
    for candidate in registry.entries:
        if candidate.role == entry.role:
            candidate.status = "inactive"
    entry.status = "active"
    save_registry(repo_path, registry)
    return entry


def rollback(repo_path: Path, name: str) -> ModelRegistryEntry:
    registry = load_registry(repo_path)
    entry = registry.by_name(name)
    if entry is None:
        raise ValueError(f"model is not registered: {name}")
    entry.status = "inactive"
    save_registry(repo_path, registry)
    return entry
