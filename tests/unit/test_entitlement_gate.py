from __future__ import annotations

from agent_sidecar.cloud.credentials import CloudCredentials, Entitlement
from agent_sidecar.models.router import ModelRoute, validate_route_allowed
from agent_sidecar.schema.config import ModelEndpointConfig, SidecarConfig
from agent_sidecar.schema.model_io import ModelRole

PAID_BASE = "https://api.hosted-vendor.example/v1"


def _paid_config() -> SidecarConfig:
    config = SidecarConfig()
    config.models.remote_fallback = True
    config.models.endpoints["hosted"] = ModelEndpointConfig(
        api_base=PAID_BASE, litellm_prefix="openai/", requires_entitlement=True
    )
    config.models.allowlist = [f"openai/*@{PAID_BASE}"]
    return config


def _paid_route() -> ModelRoute:
    return ModelRoute(
        role=ModelRole.reasoning,
        model_id="hosted-model",
        litellm_model="openai/hosted-model",
        api_base=PAID_BASE,
        serving="llama_server",
        kind="base",
    )


def _paid_creds(expires_at: str | None = None) -> CloudCredentials:
    return CloudCredentials(
        ingest_url="https://x",
        device_token="d",
        entitlement=Entitlement(tier="pro", expires_at=expires_at),
    )


def test_paid_endpoint_denied_without_entitlement() -> None:
    assert validate_route_allowed(_paid_route(), _paid_config(), load_credentials=lambda: None) is False


def test_paid_endpoint_allowed_with_active_entitlement() -> None:
    assert validate_route_allowed(_paid_route(), _paid_config(), load_credentials=_paid_creds) is True


def test_paid_endpoint_denied_when_entitlement_expired() -> None:
    creds = _paid_creds(expires_at="2000-01-01T00:00:00Z")
    assert validate_route_allowed(_paid_route(), _paid_config(), load_credentials=lambda: creds) is False


def test_free_endpoint_unaffected_by_entitlement() -> None:
    # Default loopback endpoint has requires_entitlement=False, so it is allowed
    # even with no credentials — no existing config changes behavior.
    config = SidecarConfig()
    route = ModelRoute(
        role=ModelRole.reasoning,
        model_id="llama3:latest",
        litellm_model="ollama_chat/llama3:latest",
        api_base="http://localhost:11434",
        serving="ollama",
        kind="base",
    )
    assert validate_route_allowed(route, config, load_credentials=lambda: None) is True
