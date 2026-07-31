from __future__ import annotations

import json
from pathlib import Path

from agent_sidecar.models.provider import LiteLLMModelProvider
from agent_sidecar.models.router import ModelRouter, validate_route_allowed
from agent_sidecar.schema.config import SidecarConfig, config_path, load_config
from agent_sidecar.schema.model_io import ModelRole


PILOT_TEMPLATE = Path("docs/examples/pilot-config.json")


def test_max_tokens_defaults_to_768_and_flows_to_provider(tmp_path: Path) -> None:
    config = SidecarConfig()
    assert config.models.max_tokens == 768

    config.models.max_tokens = 256
    provider = LiteLLMModelProvider(tmp_path, config)
    assert provider._max_tokens() == 256


def test_max_tokens_env_override_wins_over_config(tmp_path: Path, monkeypatch) -> None:
    config = SidecarConfig()
    config.models.max_tokens = 256
    monkeypatch.setenv("AGENT_SIDECAR_MODEL_MAX_TOKENS", "128")

    provider = LiteLLMModelProvider(tmp_path, config)
    assert provider._max_tokens() == 128


def test_ollama_api_base_env_override_applies_on_load(tmp_path: Path, monkeypatch) -> None:
    load_config(tmp_path)
    monkeypatch.setenv("AGENT_SIDECAR_OLLAMA_API_BASE", "http://operator-laptop:11434/")

    config = load_config(tmp_path)
    assert config.models.endpoints["ollama"].api_base == "http://operator-laptop:11434"

    monkeypatch.delenv("AGENT_SIDECAR_OLLAMA_API_BASE")
    config = load_config(tmp_path)
    assert config.models.endpoints["ollama"].api_base == "http://localhost:11434"


def test_ollama_api_base_env_override_does_not_rewrite_config_file(tmp_path: Path, monkeypatch) -> None:
    load_config(tmp_path)
    monkeypatch.setenv("AGENT_SIDECAR_OLLAMA_API_BASE", "http://operator-laptop:11434")
    load_config(tmp_path)

    on_disk = json.loads(config_path(tmp_path).read_text(encoding="utf-8"))
    assert on_disk["models"]["endpoints"]["ollama"]["api_base"] == "http://localhost:11434"


def test_ollama_requests_pin_model_residency_by_default(tmp_path: Path, monkeypatch) -> None:
    config = SidecarConfig()
    assert config.models.ollama_keep_alive == -1

    provider = LiteLLMModelProvider(tmp_path, config)
    captured: dict = {}

    class FakeResponse:
        def raise_for_status(self) -> None: ...
        def json(self) -> dict:
            return {"message": {"content": "{}"}}

    def fake_post(url, *, json, timeout):
        captured.update(json)
        return FakeResponse()

    monkeypatch.setattr("agent_sidecar.models.provider.httpx.post", fake_post)
    from agent_sidecar.models.router import ModelRoute

    route = ModelRoute(role=ModelRole.reasoning, model_id="llama3:latest", litellm_model="ollama_chat/llama3:latest",
                       api_base="http://127.0.0.1:11434", serving="ollama", kind="base")
    provider._ollama_completion(route, "task", "prompt", timeout_s=1.0)
    assert captured["keep_alive"] == -1


def test_pilot_template_routes_both_roles_to_remote_ollama(tmp_path: Path) -> None:
    config = SidecarConfig.model_validate_json(PILOT_TEMPLATE.read_text(encoding="utf-8"))
    router = ModelRouter(tmp_path, config)

    for role in (ModelRole.reasoning, ModelRole.coding):
        route = router.resolve(role)
        assert route.serving == "ollama"
        assert route.model_id == "llama3:latest"
        assert route.api_base == "http://OPERATOR-TAILSCALE-IP:11434"
        assert validate_route_allowed(route, config) is True


def test_pilot_template_remote_route_blocked_without_remote_fallback(tmp_path: Path) -> None:
    config = SidecarConfig.model_validate_json(PILOT_TEMPLATE.read_text(encoding="utf-8"))
    config.models.remote_fallback = False
    router = ModelRouter(tmp_path, config)

    route = router.resolve(ModelRole.reasoning)
    assert validate_route_allowed(route, config) is False


def test_pilot_template_allowlist_rejects_other_remote_endpoints(tmp_path: Path) -> None:
    config = SidecarConfig.model_validate_json(PILOT_TEMPLATE.read_text(encoding="utf-8"))
    config.models.endpoints["ollama"] = config.models.endpoints["ollama"].model_copy(
        update={"api_base": "http://some-other-host:11434"}
    )
    router = ModelRouter(tmp_path, config)

    route = router.resolve(ModelRole.reasoning)
    assert validate_route_allowed(route, config) is False
