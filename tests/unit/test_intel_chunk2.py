from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest
import respx
import httpx

from agent_sidecar.intel.calibration import calibrate
from agent_sidecar.intel.cost import load_price_map, price_map_metadata, price_tokens, refresh_price_map
from agent_sidecar.intel.detectors import missing_validation
from agent_sidecar.intel.refiner import CodingRefinementRequiredError, ModelEnsembleRequiredError, ReasoningRefinementRequiredError, refine_prompt
from agent_sidecar.intel.refiner_fallback import detect_issues, refine_deterministically
from agent_sidecar.intel.steering import collect_findings, steer
from agent_sidecar.intel.wrapper import KimiWrapperRequiredError, wrap_prompt_with_kimi
from agent_sidecar.models.evals import parse_promotion_result, run_promotion_eval
from agent_sidecar.models.local_services import list_ollama_models, list_openai_models, model_is_served, pull_ollama_model
from agent_sidecar.models.registry import ModelRegistry, ModelRegistryEntry, RegistryEval, load_registry, promote, rollback, save_registry
from agent_sidecar.models.router import ModelRoute, ModelRouter, infer_serving, is_loopback_url, validate_route_allowed
from agent_sidecar.schema.config import SidecarConfig
from agent_sidecar.schema.events import EventMeta, EventSource, SidecarEvent
from agent_sidecar.schema.model_io import KimiWrapperResult, ModelRole, NextStepDraft, RefineDraft, RefineJudgment, SteerResult
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


def test_router_defaults_coding_to_local_llama3(tmp_path: Path) -> None:
    config = SidecarConfig()
    config.models.hardware_tier = "medium"

    route = ModelRouter(tmp_path, config).resolve(ModelRole.coding)

    assert route.model_id == "llama3:latest"
    assert route.serving == "llama_server"
    assert route.litellm_model == "openai/llama3:latest"


def test_deepseek_v4_infers_local_openai_compatible_serving() -> None:
    assert infer_serving(ModelRole.reasoning, "deepseek-v4-flash") == "llama_server"
    assert infer_serving(ModelRole.coding, "deepseek-ai/DeepSeek-V4-Flash") == "llama_server"


def test_qwen3_coder_next_infers_local_openai_compatible_serving() -> None:
    assert infer_serving(ModelRole.coding, "Qwen/Qwen3-Coder-Next") == "llama_server"
    assert infer_serving(ModelRole.coding, "qwen3-coder-next") == "llama_server"


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


def test_provider_calls_litellm_with_one_api_base_for_llama_server(tmp_path: Path, monkeypatch) -> None:
    config = SidecarConfig()
    config.models.hardware_tier = "medium"
    config.models.roles["coding"].fallback_base = "kimi-linear-48b-a3b"
    config.models.roles["coding"].serving = "llama_server"
    monkeypatch.setattr("agent_sidecar.models.provider._endpoint_reachable", lambda _api_base: True)
    monkeypatch.setattr("agent_sidecar.models.provider.model_is_served", lambda *args, **kwargs: (True, None))
    calls: dict[str, object] = {}

    def completion(**kwargs):
        calls.update(kwargs)
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content=json.dumps({"next_step": "Edit the focused file.", "rationale": "Keeps the requested scope."})
                    )
                )
            ]
        )

    monkeypatch.setattr("litellm.completion", completion)

    result = LiteLLMModelProvider(tmp_path, config).complete_json(ModelRole.coding, "task", "prompt", NextStepDraft)

    assert isinstance(result, NextStepDraft)
    assert calls["model"] == "openai/kimi-linear-48b-a3b"
    assert calls["api_base"] == "http://localhost:8080/v1"
    assert calls["api_key"] == "local"


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


WELL_SPECIFIED_PROMPT = (
    "Replace boilerplate.html with a single-file dynamic Agent Sidecar demo page. "
    "Keep it dependency-free: one HTML file with semantic HTML, inline CSS, and inline JavaScript only. "
    "Include a header with an inline-SVG logo, a grid of at least six feature cards each with a distinct icon and label, "
    "and at least four working buttons: a light/dark theme toggle, a counter with increment and reset, "
    "a show/hide toggle for a details panel, and a button that cycles a status pill through Idle, Running, and Done. "
    "Wire every button with plain JavaScript and make the current state visibly change on the page. Keep the HTML under 250 lines. "
    "No tests, extra files, or final file reread. Briefly summarize the change."
)


def test_deterministic_refiner_labels_source() -> None:
    result = refine_deterministically("make the app better")

    assert result.source == "deterministic"
    assert "prompt is underspecified" in result.issues
    assert "Acceptance criteria:" in result.refined_prompt


def test_detect_issues_uses_word_boundaries_not_substrings() -> None:
    issues = detect_issues("Update the header component file and make the counter state visibly change on the page")

    assert "prompt is underspecified" not in issues


def test_deterministic_refiner_emits_lean_contract_for_well_specified_prompt() -> None:
    result = refine_deterministically(WELL_SPECIFIED_PROMPT)

    assert result.issues == []
    assert result.quality == "medium"
    assert result.validation_opt_out is True
    assert "Acceptance criteria:" not in result.refined_prompt
    assert "Run the relevant test" not in result.refined_prompt
    assert "no test or validation runs" in result.testing_expectations
    # The prompt exceeds the echo cap; truncation must keep the trailing constraints.
    assert "Briefly summarize the change." in result.refined_prompt


def test_deterministic_refiner_drops_validation_instructions_on_opt_out() -> None:
    result = refine_deterministically("fix the counter bug, no tests please")

    assert result.validation_opt_out is True
    assert "prompt is underspecified" in result.issues
    assert "Do not run tests or validation commands" in result.refined_prompt
    assert "Run the relevant test/lint/build command" not in result.refined_prompt
    assert all("validation" not in item.lower() for item in result.acceptance_criteria)


def _detector_event(event_type: str, payload: dict) -> SidecarEvent:
    return SidecarEvent(
        session_id="cc-detector-test",
        event_type=event_type,
        source=EventSource.manual,
        payload=payload,
        metadata=EventMeta(repo_path="/tmp/repo"),
    )


def test_missing_validation_respects_prompt_opt_out() -> None:
    events = [
        _detector_event("prompt_refined", {"refined_prompt": "Task: x", "validation_opt_out": True}),
        _detector_event("file_edit_observed", {"path": "boilerplate.html"}),
    ]

    assert missing_validation.detect(events) == []


def test_missing_validation_still_fires_without_opt_out() -> None:
    events = [
        _detector_event("prompt_submitted", {"prompt": "update the page layout"}),
        _detector_event("file_edit_observed", {"path": "page.py"}),
    ]
    findings = missing_validation.detect(events)

    assert findings and findings[0].evaluator_id == "missing_validation"


def test_require_coding_skips_model_for_well_specified_prompt(tmp_path: Path) -> None:
    # A well-specified prompt has no issues, so the coding model can only restate it.
    # We must not pay the blocking local call at all — it is skipped entirely.
    provider = StubProvider(
        {
            ModelRole.coding: NextStepDraft(
                next_step="Replace boilerplate.html with a single-file page using inline CSS and inline JavaScript",
                rationale="restates the task",
            )
        }
    )
    result, _ = refine_prompt(
        WELL_SPECIFIED_PROMPT,
        repo_path=tmp_path,
        session_id="demo",
        provider=provider,
        require_coding_refinement=True,
    )

    assert result.source == "deterministic"
    assert ModelRole.coding not in provider.calls  # the blocking call never happened
    assert "Focus:" not in result.refined_prompt
    assert result.validation_opt_out is True


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


def test_required_coding_model_uses_deterministic_refinement_without_deepseek(tmp_path: Path) -> None:
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
    assert "Focus: Update packages/auth/src/refresh.ts" in result.refined_prompt
    assert provider.calls == [ModelRole.coding]
    assert [event.event_type for event in events] == ["prompt_submitted", "prompt_refined"]


def test_required_reasoning_then_coding_refiner_uses_deepseek_and_coding_model(tmp_path: Path) -> None:
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
    assert "Focus: Update packages/auth/src/refresh.ts" in result.refined_prompt
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

    with pytest.raises(CodingRefinementRequiredError, match="coding model did not produce"):
        refine_prompt(
            "fix auth refresh",
            repo_path=tmp_path,
            provider=provider,
            require_reasoning_refinement=True,
            require_coding_refinement=True,
        )


def test_kimi_wrapper_uses_deterministic_rules_before_kimi(tmp_path: Path) -> None:
    provider = StubProvider({
        ModelRole.coding: KimiWrapperResult(
            display_response="Implemented the auth refresh fix as requested.",
            implementation_summary="Focused the task on auth refresh and validation.",
            files_changed=["packages/auth/src/refresh.ts"],
            validation_performed="Run pnpm test.",
            needs_claude_execution=False,
        ),
    })

    refined, result, events = wrap_prompt_with_kimi(
        "fix auth refresh",
        repo_path=tmp_path,
        session_id="demo",
        provider=provider,
    )

    assert refined.source == "deterministic"
    assert result.display_response.startswith("Implemented")
    assert provider.calls == [ModelRole.coding]
    assert [event.event_type for event in events] == ["prompt_submitted", "prompt_refined", "kimi_wrapper_completed"]


def test_kimi_wrapper_uses_deepseek_when_no_deterministic_issue_matches(tmp_path: Path) -> None:
    provider = StubProvider({
        ModelRole.reasoning: RefineDraft(
            refined_prompt=(
                "Task: inspect the auth refresh flow in packages/auth/src/refresh.ts, preserve refresh-token "
                "rotation semantics, avoid unrelated auth changes, and validate the behavior with the focused "
                "auth tests before running pnpm test."
            ),
            acceptance_criteria=["refresh-token rotation semantics are preserved", "focused auth tests and pnpm test pass"],
            testing_expectations="Run pnpm test.",
            do_not_change=["unrelated auth behavior"],
            files_or_components=["packages/auth/src/refresh.ts"],
        ),
        ModelRole.coding: KimiWrapperResult(
            display_response="Use the refined auth-refresh implementation path.",
            implementation_summary="DeepSeek refined the already-specific prompt before Kimi wrapped it.",
            files_changed=[],
            validation_performed="Run pnpm test.",
            needs_claude_execution=True,
        ),
    })

    refined, result, _events = wrap_prompt_with_kimi(
        "Update packages/auth/src/refresh.ts to preserve token rotation and run pnpm test.",
        repo_path=tmp_path,
        session_id="demo",
        provider=provider,
    )

    assert refined.source == "reasoning-only"
    assert result.needs_claude_execution is True
    assert provider.calls == [ModelRole.reasoning, ModelRole.coding]


def test_kimi_wrapper_raises_when_kimi_result_is_unavailable(tmp_path: Path) -> None:
    provider = StubProvider({})

    with pytest.raises(KimiWrapperRequiredError, match="coding model did not produce"):
        wrap_prompt_with_kimi("fix auth refresh", repo_path=tmp_path, provider=provider)


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
