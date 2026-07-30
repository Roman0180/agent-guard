from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class DaemonConfig(BaseModel):
    api_port: int = 7433
    otlp_port: int = 4318


class HooksConfig(BaseModel):
    payload_max_bytes: int = 32768
    test_command_patterns: list[str] = Field(default_factory=lambda: ["pnpm test", "npm test", "pytest", "cargo test", "go test"])


class ModelRoleConfig(BaseModel):
    model: str
    fallback_base: str
    serving: Literal["ollama", "llama_server", "deepseek"] | None = None


class ModelEndpointConfig(BaseModel):
    api_base: str
    litellm_prefix: str


class ModelsConfig(BaseModel):
    roles: dict[str, ModelRoleConfig] = Field(default_factory=lambda: {
        "reasoning": ModelRoleConfig(
            model="sidecar-llama3-reasoning",
            fallback_base="llama3:latest",
            serving="ollama",
        ),
        "coding": ModelRoleConfig(
            model="sidecar-llama3-coding",
            fallback_base="llama3:latest",
            serving="llama_server",
        ),
    })
    endpoints: dict[str, ModelEndpointConfig] = Field(default_factory=lambda: {
        "ollama": ModelEndpointConfig(api_base="http://localhost:11434", litellm_prefix="ollama_chat/"),
        "llama_server": ModelEndpointConfig(api_base="http://localhost:8080/v1", litellm_prefix="openai/"),
        "deepseek": ModelEndpointConfig(api_base="https://api.deepseek.com", litellm_prefix="deepseek/"),
    })
    allowlist: list[str] = Field(default_factory=lambda: [
        "ollama_chat/*",
        "openai/*@http://localhost:8080/v1",
    ])
    remote_fallback: bool = False
    timeout_ms: int = 12000
    hardware_tier: str = "auto"


class CostConfig(BaseModel):
    price_map: str = ".agent-sidecar/cost-map/litellm_prices.json"


class BudgetConfig(BaseModel):
    target_savings_pct: float = Field(default=10.0, ge=0.0, le=100.0)
    warning_threshold_pct: float = Field(default=80.0, ge=0.0, le=100.0)
    enforcement: Literal["off", "warn", "block"] = "block"


class SteeringConfig(BaseModel):
    loop_threshold: float = 0.82
    validation_required_after_edits: bool = True
    max_warnings_per_turn: int = 1
    coding_next_step: bool = True


class RulesConfig(BaseModel):
    warn_on_repeated_failed_tests: bool = True
    warn_on_out_of_scope_edits: bool = True


class LangfuseExporterConfig(BaseModel):
    enabled: bool = False
    base_url: str | None = None
    auto_export: bool = False


class ExportersConfig(BaseModel):
    langfuse: LangfuseExporterConfig = Field(default_factory=LangfuseExporterConfig)


class SidecarConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int = 3
    trace_dir: str = ".agent-sidecar/sessions"
    daemon: DaemonConfig = Field(default_factory=DaemonConfig)
    hooks: HooksConfig = Field(default_factory=HooksConfig)
    models: ModelsConfig = Field(default_factory=ModelsConfig)
    cost: CostConfig = Field(default_factory=CostConfig)
    budget: BudgetConfig = Field(default_factory=BudgetConfig)
    steering: SteeringConfig = Field(default_factory=SteeringConfig)
    rules: RulesConfig = Field(default_factory=RulesConfig)
    exporters: ExportersConfig = Field(default_factory=ExportersConfig)


def config_dir(repo_path: Path) -> Path:
    return repo_path / ".agent-sidecar"


def config_path(repo_path: Path) -> Path:
    return config_dir(repo_path) / "config.json"


def load_config(repo_path: Path, *, create: bool = True) -> SidecarConfig:
    path = config_path(repo_path)
    if path.exists():
        return SidecarConfig.model_validate_json(path.read_text(encoding="utf-8"))
    config = SidecarConfig()
    if create:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(config.model_dump(mode="json"), indent=2) + "\n", encoding="utf-8")
    return config


def trace_dir(repo_path: Path, config: SidecarConfig) -> Path:
    path = Path(config.trace_dir)
    return path if path.is_absolute() else repo_path / path
