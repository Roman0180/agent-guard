from __future__ import annotations

import json
from pathlib import Path

import pytest
import respx
import httpx

from agent_sidecar.intel.calibration import calibrate
from agent_sidecar.intel.cost import load_price_map, price_map_metadata, price_tokens, refresh_price_map
from agent_sidecar.intel.refiner import CodingRefinementRequiredError, ModelEnsembleRequiredError, ReasoningRefinementRequiredError, refine_prompt
from agent_sidecar.intel.refiner_fallback import refine_deterministically
from agent_sidecar.intel.steering import collect_findings, steer
from agent_sidecar.models.evals import parse_promotion_result, run_promotion_eval
from agent_sidecar.models.local_services import list_ollama_models, list_openai_models, model_is_served, pull_ollama_model
from agent_sidecar.models.registry import ModelRegistry, ModelRegistryEntry, RegistryEval, load_registry, promote, rollback, save_registry
from agent_sidecar.models.router import ModelRoute, ModelRouter, is_loopback_url, validate_route_allowed
from agent_sidecar.schema.config import SidecarConfig
from agent_sidecar.schema.events import SidecarEvent
from agent_sidecar.schema.model_io import ModelRole, NextStepDraft, RefineDraft, RefineJudgment, SteerResult
from agent_sidecar.models.provider import LiteLLMModelProvider
from agent_sidecar.models.validation import validate_json_text


class StubProvider:
    def __init__(self, responses: dict[ModelRole, object]) -> None:
        self.responses = responses
        self.calls: list[ModelRole] = []

    def complete_json(self, role, task, prompt, schema, timeout_ms=None):
        self.calls.append(role)
        value = self.responses.get(role)
        return value if isinstance(value, schema) else None

    def health(self) -> dict:
        return {}


def fixture_events() -> list[SidecarEvent]:
    return [
        SidecarEvent.model_validate_json(line)
        for line in Path("evals/fixtures/traces/auth-refresh-loop.jsonl").read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def test_router_rejects_remote_route_by_default(tmp_path: Path) -> None:
    config = SidecarConfig()
    remote = ModelRoute(
        role=ModelRole.reasoning,
        model_id="remote",
        litellm_model="openai/gpt-4.1",
        api_base="https://api.openai.com/v1",
        serving="llama_server",
        kind="base",
    )

    assert is_loopback_url("http://127.0.0.1:8080/v1") is True
    assert validate_route_allowed(remote, config) is False


def test_provider_rejects_remote_endpoint_before_socket_or_litellm(tmp_path: Path, monkeypatch) -> None:
    config = SidecarConfig()
    config.models.endpoints["ollama"].api_base = "https://api.openai.com/v1"

    def fail_socket(*args, **kwargs):
        raise AssertionError("remote endpoint should be rejected before socket use")

    monkeypatch.setattr("agent_sidecar.models.provider.socket.create_connection", fail_socket)
    provider = LiteLLMModelProvider(tmp_path, config)

    assert provider.complete_json(ModelRole.reasoning, "task", "{}", RefineJudgment) is None


@respx.mock
def test_local_service_discovery_for_ollama_and_llama_server() -> None:
    respx.get("http://127.0.0.1:11434/api/tags").mock(
        return_value=httpx.Response(200, json={"models": [{"name": "deepseek-r1:8b"}]})
    )
    respx.get("http://127.0.0.1:8080/v1/models").mock(
        return_value=httpx.Response(200, json={"data": [{"id": "kimi-linear-48b-a3b"}]})
    )

    assert [model.id for model in list_ollama_models("http://127.0.0.1:11434")] == ["deepseek-r1:8b"]
    assert [model.id for model in list_openai_models("http://127.0.0.1:8080/v1")] == ["kimi-linear-48b-a3b"]
    assert model_is_served("deepseek-r1:8b", "ollama", "http://127.0.0.1:11434")[0] is True
    assert model_is_served("kimi-linear-48b-a3b", "llama_server", "http://127.0.0.1:8080/v1")[0] is True


@respx.mock
def test_ollama_pull_uses_api_pull_endpoint() -> None:
    route = respx.post("http://127.0.0.1:11434/api/pull").mock(return_value=httpx.Response(200, json={"status": "success"}))

    result = pull_ollama_model("http://127.0.0.1:11434", "deepseek-r1:8b")

    assert result["status"] == "success"
    assert route.calls.last.request.content == b'{"name":"deepseek-r1:8b","stream":false}'


def test_provider_skips_litellm_when_model_is_not_served(tmp_path: Path, monkeypatch) -> None:
    config = SidecarConfig()
    config.models.hardware_tier = "medium"
    monkeypatch.setattr("agent_sidecar.models.provider._endpoint_reachable", lambda _api_base: True)
    monkeypatch.setattr("agent_sidecar.models.provider.model_is_served", lambda *args, **kwargs: (False, "not installed"))

    def fail_completion(*args, **kwargs):
        raise AssertionError("LiteLLM should not be called when the model is not served")

    monkeypatch.setattr(LiteLLMModelProvider, "_completion", fail_completion)

    assert LiteLLMModelProvider(tmp_path, config).complete_json(ModelRole.reasoning, "task", "{}", RefineJudgment) is None


def test_registry_promote_requires_passing_eval(tmp_path: Path) -> None:
    registry = ModelRegistry(entries=[
        ModelRegistryEntry(
            name="sidecar-deepseek-reasoning",
            role=ModelRole.reasoning,
            base="deepseek-r1:8b",
            eval=RegistryEval(suite="evals/promotion.promptfoo.yaml", score=0.5, base_score=0.6, passed=False),
        )
    ])
    save_registry(tmp_path, registry)

    with pytest.raises(ValueError):
        promote(tmp_path, "sidecar-deepseek-reasoning")

    registry.entries[0].eval = RegistryEval(suite="evals/promotion.promptfoo.yaml", score=0.7, base_score=0.6, passed=True)
    save_registry(tmp_path, registry)
    promoted = promote(tmp_path, "sidecar-deepseek-reasoning")
    assert promoted.status == "active"
    assert load_registry(tmp_path).active_for_role(ModelRole.reasoning).name == "sidecar-deepseek-reasoning"
    assert rollback(tmp_path, "sidecar-deepseek-reasoning").status == "inactive"


def test_promotion_eval_injection_updates_registry(tmp_path: Path, monkeypatch) -> None:
    entry = ModelRegistryEntry(name="sidecar-kimi-coding", role=ModelRole.coding, base="kimi-linear-48b-a3b", serving="llama_server")
    save_registry(tmp_path, ModelRegistry(entries=[entry]))
    monkeypatch.setenv(
        "AGENT_SIDECAR_PROMOTION_RESULT",
        json.dumps({"suite": "evals/promotion.promptfoo.yaml", "score": 0.91, "base_score": 0.84, "passed": True}),
    )

    eval_result = run_promotion_eval(entry, repo_path=tmp_path)
    promoted = promote(tmp_path, "sidecar-kimi-coding", eval_result=eval_result)

    assert promoted.status == "active"
    assert promoted.eval.score == 0.91


def test_promptfoo_stats_result_parser_requires_no_failures() -> None:
    result = parse_promotion_result({"stats": {"successes": 3, "failures": 0}, "base_score": 0.5})

    assert result.score == 1.0
    assert result.passed is True


def test_deterministic_refiner_labels_source() -> None:
    result = refine_deterministically("make the app better")

    assert result.source == "deterministic"
    assert "prompt is underspecified" in result.issues
    assert "Acceptance criteria:" in result.refined_prompt


def test_cost_engine_prices_known_model(tmp_path: Path) -> None:
    estimate = price_tokens("claude-sonnet-4", 1000, 100, 0, SidecarConfig(), tmp_path)

    assert estimate.precision.value == "priced"
    assert estimate.value > 0


def test_price_map_refresh_writes_metadata(tmp_path: Path) -> None:
    config = SidecarConfig()
    path = refresh_price_map(config, tmp_path)
    prices = load_price_map(config, tmp_path)
    meta = price_map_metadata(config, tmp_path)

    assert path.exists()
    assert prices
    assert meta["source"] == "litellm.model_cost"
    assert meta["model_count"] > 100


def test_ensemble_refiner_uses_coding_draft_and_reasoning_judgment(tmp_path: Path) -> None:
    provider = StubProvider({
        ModelRole.coding: RefineDraft(
            refined_prompt="Task: fix auth refresh in packages/auth/src/refresh.ts and run pnpm test.",
            acceptance_criteria=["auth refresh succeeds", "pnpm test passes"],
            testing_expectations="Run pnpm test.",
            do_not_change=["unrelated auth behavior"],
            files_or_components=["packages/auth/src/refresh.ts"],
        ),
        ModelRole.reasoning: RefineJudgment(quality="high", issues=[], approved=True),
    })

    result, events = refine_prompt("fix auth refresh", repo_path=tmp_path, session_id="demo", provider=provider)

    assert result.source == "ensemble"
    assert result.quality == "high"
    assert [event.event_type for event in events] == ["prompt_submitted", "prompt_refined"]


def test_required_ensemble_refiner_raises_instead_of_falling_back(tmp_path: Path) -> None:
    provider = StubProvider({})

    with pytest.raises(ModelEnsembleRequiredError, match="coding model did not produce"):
        refine_prompt("fix auth refresh", repo_path=tmp_path, provider=provider, require_model_ensemble=True)


def test_required_reasoning_refiner_uses_deepseek_role_without_kimi(tmp_path: Path) -> None:
    provider = StubProvider({
        ModelRole.reasoning: RefineDraft(
            refined_prompt="Task: fix auth refresh in packages/auth/src/refresh.ts and run pnpm test.",
            acceptance_criteria=["auth refresh succeeds", "pnpm test passes"],
            testing_expectations="Run pnpm test.",
            do_not_change=["unrelated auth behavior"],
            files_or_components=["packages/auth/src/refresh.ts"],
        ),
    })

    result, events = refine_prompt(
        "fix auth refresh",
        repo_path=tmp_path,
        session_id="demo",
        provider=provider,
        require_reasoning_refinement=True,
    )

    assert result.source == "reasoning-only"
    assert result.refined_prompt.startswith("Task: fix auth refresh")
    assert [event.event_type for event in events] == ["prompt_submitted", "prompt_refined"]


def test_required_reasoning_refiner_raises_instead_of_falling_back(tmp_path: Path) -> None:
    provider = StubProvider({})

    with pytest.raises(ReasoningRefinementRequiredError, match="DeepSeek did not produce"):
        refine_prompt("fix auth refresh", repo_path=tmp_path, provider=provider, require_reasoning_refinement=True)


def test_required_kimi_coding_uses_deterministic_refinement_without_deepseek(tmp_path: Path) -> None:
    provider = StubProvider({
        ModelRole.coding: NextStepDraft(
            next_step="Update packages/auth/src/refresh.ts so auth refresh succeeds, then run pnpm test.",
            rationale="Preserves the auth refresh scope and validation request.",
        ),
    })

    result, events = refine_prompt(
        "fix auth refresh",
        repo_path=tmp_path,
        session_id="demo",
        provider=provider,
        require_coding_refinement=True,
    )

    assert result.source == "deterministic-then-coding"
    assert result.refined_prompt.startswith("Task: fix auth refresh")
    assert "Kimi implementation focus: Update packages/auth/src/refresh.ts" in result.refined_prompt
    assert provider.calls == [ModelRole.coding]
    assert [event.event_type for event in events] == ["prompt_submitted", "prompt_refined"]


def test_required_reasoning_then_coding_refiner_uses_deepseek_and_kimi(tmp_path: Path) -> None:
    provider = StubProvider({
        ModelRole.reasoning: RefineDraft(
            refined_prompt="Task: fix auth refresh in packages/auth/src/refresh.ts and run pnpm test.",
            acceptance_criteria=["auth refresh succeeds", "pnpm test passes"],
            testing_expectations="Run pnpm test.",
            do_not_change=["unrelated auth behavior"],
            files_or_components=["packages/auth/src/refresh.ts"],
        ),
        ModelRole.coding: NextStepDraft(
            next_step="Update packages/auth/src/refresh.ts so auth refresh succeeds, then run pnpm test.",
            rationale="Preserves the auth refresh scope and validation request.",
        ),
    })

    result, events = refine_prompt(
        "fix auth refresh",
        repo_path=tmp_path,
        session_id="demo",
        provider=provider,
        require_reasoning_refinement=True,
        require_coding_refinement=True,
    )

    assert result.source == "reasoning-then-coding"
    assert result.refined_prompt.startswith("Task: fix auth refresh")
    assert "Kimi coding focus: Update packages/auth/src/refresh.ts" in result.refined_prompt
    assert [event.event_type for event in events] == ["prompt_submitted", "prompt_refined"]


def test_required_coding_refiner_raises_instead_of_falling_back(tmp_path: Path) -> None:
    provider = StubProvider({
        ModelRole.reasoning: RefineDraft(
            refined_prompt="Task: fix auth refresh in packages/auth/src/refresh.ts and run pnpm test.",
            acceptance_criteria=["auth refresh succeeds", "pnpm test passes"],
            testing_expectations="Run pnpm test.",
            do_not_change=["unrelated auth behavior"],
            files_or_components=["packages/auth/src/refresh.ts"],
        ),
    })

    with pytest.raises(CodingRefinementRequiredError, match="Kimi did not produce"):
        refine_prompt(
            "fix auth refresh",
            repo_path=tmp_path,
            provider=provider,
            require_reasoning_refinement=True,
            require_coding_refinement=True,
        )


def test_model_validation_normalizes_common_local_json_shapes() -> None:
    text = """```json
{"refined_prompt":"x","acceptance_criteria":"a","testing_expectations":["t1","t2"],"do_not_change":"d","files_or_components":["f"]}
```"""

    result = validate_json_text(text, RefineDraft)

    assert isinstance(result, RefineDraft)
    assert result.acceptance_criteria == ["a"]
    assert result.testing_expectations == "t1\nt2"
    assert result.do_not_change == ["d"]


def test_model_validation_skips_non_schema_json_before_valid_object() -> None:
    text = """
{"note":"not the requested schema"}

Final answer:
{"refined_prompt":"x","acceptance_criteria":["a"],"testing_expectations":"t","do_not_change":["d"],"files_or_components":["f"]}
"""

    result = validate_json_text(text, RefineDraft)

    assert isinstance(result, RefineDraft)
    assert result.refined_prompt == "x"


def test_steering_fixture_warns_on_failed_test_loop(tmp_path: Path) -> None:
    config = SidecarConfig()
    events = fixture_events()

    findings = collect_findings(events, config)
    result, findings, recommendation = steer(events, config=config, repo_path=tmp_path, session_id="auth-refresh-loop")

    assert any(finding.evaluator_id == "failed_test_loop" for finding in findings)
    assert result.decision == "warn"
    assert result.evidence_event_ids
    assert recommendation.payload["decision"] == "warn"


def test_steering_rejects_model_evidence_outside_detector_subset(tmp_path: Path) -> None:
    provider = StubProvider({
        ModelRole.reasoning: SteerResult(decision="continue", recommendation="ignore evidence", evidence_event_ids=["made-up"], confidence=0.99)
    })

    result, _, event = steer(fixture_events(), config=SidecarConfig(), repo_path=tmp_path, session_id="auth-refresh-loop", provider=provider)

    assert result.decision == "warn"
    assert event.payload["source"] == "deterministic"


def test_detector_calibration_reports_labeled_fixture() -> None:
    report = calibrate(Path("evals/fixtures/datasets/steering_labels.jsonl"), base_dir=Path.cwd())
    by_id = {row.evaluator_id: row for row in report.evaluators}

    assert report.cases == 1
    assert by_id["failed_test_loop"].true_positive == 1
    assert by_id["repeated_command"].precision == 1.0
