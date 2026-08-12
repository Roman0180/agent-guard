from __future__ import annotations

import json
import os
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
    max_tokens: int = 768
    # Ollama keep_alive sent with every request; -1 pins the model resident so
    # interactive calls never pay the multi-second cold load. Set e.g. "5m" to
    # let the serving host reclaim memory between sessions.
    ollama_keep_alive: int | str = -1
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


class MeasurementConfig(BaseModel):
    # Fraction of sessions randomly assigned to the control arm (no refinement or
    # steering delivered; capture and shadow detection continue). 0 disables arms.
    control_fraction: float = Field(default=0.0, ge=0.0, le=1.0)
    # Run detectors on event ingest: assist sessions get steering context delivered
    # through the hook response; control sessions get silent shadow_detection events.
    steer_on_ingest: bool = False
    # Operator endpoint that receives the aggregate measurement report when a
    # session stops. Aggregates only (the `measurement report --json` payload);
    # never prompt text, code, or per-event traces. None disables the push, and
    # an unreachable endpoint is ignored — the session is never affected.
    report_push_url: str | None = None


class BillingConfig(BaseModel):
    # "auto" detects from Claude Code local state (billingType/tier); "credits"
    # forces the dollars-first view, "plan" the capacity-first view.
    mode: Literal["auto", "credits", "plan"] = "auto"
    # Plan tier/price overrides for when detection is unavailable or wrong.
    tier: str | None = None
    monthly_usd: float | None = None
    # Explicit monthly plan token allowance. Plans publish no token quota, so when
    # unset the capacity denominator is estimated from plan price at the user's
    # own blended API-equivalent $/token.
    plan_token_allowance: int | None = None


class TraceCaptureConfig(BaseModel):
    trace_path: str = ".agent-sidecar/traces/traces.jsonl"
    # Privacy-sensitive customers: keep hashes, sizes, tokens, and timing but never
    # message or response content.
    redact_content: bool = False
    # A request whose normalized message hash matches a prior request in the same
    # session within this window is flagged as a retry.
    retry_window_seconds: float = Field(default=600.0, gt=0.0)
    # Optional mirror: "s3://bucket/prefix". Local JSONL is always written; S3 is
    # best-effort and requires boto3.
    s3_url: str | None = None


class RetrySuppressionPolicyConfig(BaseModel):
    mode: Literal["shadow", "enforce"] = "shadow"
    # Retries of the same normalized request allowed before the policy fires.
    max_retries: int = Field(default=2, ge=0)


class ContextCompactionPolicyConfig(BaseModel):
    # Enforcement (actual compaction) is not implemented yet; enforce behaves as shadow.
    mode: Literal["shadow", "enforce"] = "shadow"
    context_token_threshold: int = Field(default=60000, gt=0)


class TokenCapPolicyConfig(BaseModel):
    mode: Literal["shadow", "enforce"] = "shadow"
    max_output_tokens: int = Field(default=2048, gt=0)


class GatewayPoliciesConfig(BaseModel):
    retry_suppression: RetrySuppressionPolicyConfig = Field(default_factory=RetrySuppressionPolicyConfig)
    context_compaction: ContextCompactionPolicyConfig = Field(default_factory=ContextCompactionPolicyConfig)
    token_caps: TokenCapPolicyConfig = Field(default_factory=TokenCapPolicyConfig)


class GatewayConfig(BaseModel):
    listen_host: str = "127.0.0.1"
    listen_port: int = 7455
    target_base: str = "http://127.0.0.1:11434"
    capture: TraceCaptureConfig = Field(default_factory=TraceCaptureConfig)
    policies: GatewayPoliciesConfig = Field(default_factory=GatewayPoliciesConfig)


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
    measurement: MeasurementConfig = Field(default_factory=MeasurementConfig)
    billing: BillingConfig = Field(default_factory=BillingConfig)
    gateway: GatewayConfig = Field(default_factory=GatewayConfig)
    exporters: ExportersConfig = Field(default_factory=ExportersConfig)


def config_dir(repo_path: Path) -> Path:
    return repo_path / ".agent-sidecar"


def config_path(repo_path: Path) -> Path:
    return config_dir(repo_path) / "config.json"


def load_config(repo_path: Path, *, create: bool = True) -> SidecarConfig:
    path = config_path(repo_path)
    if path.exists():
        return _apply_env_overrides(SidecarConfig.model_validate_json(path.read_text(encoding="utf-8")))
    config = SidecarConfig()
    if create:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(config.model_dump(mode="json"), indent=2) + "\n", encoding="utf-8")
    return _apply_env_overrides(config)


def _apply_env_overrides(config: SidecarConfig) -> SidecarConfig:
    ollama_api_base = os.environ.get("AGENT_SIDECAR_OLLAMA_API_BASE", "").strip()
    if ollama_api_base and "ollama" in config.models.endpoints:
        config.models.endpoints["ollama"] = config.models.endpoints["ollama"].model_copy(
            update={"api_base": ollama_api_base.rstrip("/")}
        )
    return config


def trace_dir(repo_path: Path, config: SidecarConfig) -> Path:
    path = Path(config.trace_dir)
    return path if path.is_absolute() else repo_path / path
