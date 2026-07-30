from __future__ import annotations

from importlib import resources
from pathlib import Path

from agent_sidecar.intel.refiner_fallback import refine_deterministically
from agent_sidecar.models.validation import is_material_restatement
from agent_sidecar.schema.events import EventMeta, EventSource, SidecarEvent
from agent_sidecar.schema.model_io import KimiWrapperResult, ModelProvider, ModelRole, RefineDraft, RefineResult


class KimiWrapperRequiredError(RuntimeError):
    """Raised when coding-wrapper execution is requested but unavailable."""


def wrap_prompt_with_kimi(
    prompt: str,
    *,
    repo_path: Path,
    session_id: str | None = None,
    provider: ModelProvider | None = None,
    record_prompt_submitted: bool = True,
) -> tuple[RefineResult, KimiWrapperResult, list[SidecarEvent]]:
    if provider is None:
        raise KimiWrapperRequiredError("coding wrapper requires a model provider")

    refined = _refine_for_wrapper(prompt, provider)
    result = provider.complete_json(
        ModelRole.coding,
        _prompt_template("wrapper_implementation.txt"),
        _wrapper_prompt(prompt, refined),
        KimiWrapperResult,
    )
    if not isinstance(result, KimiWrapperResult):
        raise KimiWrapperRequiredError("coding model did not produce a valid wrapper result")

    return refined, result, _wrapper_events(
        result,
        refined,
        prompt,
        repo_path=repo_path,
        session_id=session_id,
        record_prompt_submitted=record_prompt_submitted,
    )


def _refine_for_wrapper(prompt: str, provider: ModelProvider) -> RefineResult:
    deterministic = refine_deterministically(prompt)
    if deterministic.issues:
        return deterministic

    draft = provider.complete_json(ModelRole.reasoning, _reasoning_refinement_task(), prompt, RefineDraft)
    if isinstance(draft, RefineDraft) and not is_material_restatement(prompt, draft.refined_prompt):
        return RefineResult(
            quality="medium",
            issues=[],
            refined_prompt=draft.refined_prompt,
            acceptance_criteria=draft.acceptance_criteria,
            testing_expectations=draft.testing_expectations,
            do_not_change=draft.do_not_change,
            source="reasoning-only",
        )
    return deterministic


def _wrapper_prompt(prompt: str, refined: RefineResult) -> str:
    acceptance = "\n".join(f"- {item}" for item in refined.acceptance_criteria)
    boundaries = "\n".join(f"- {item}" for item in refined.do_not_change)
    return (
        "Original Claude Code prompt:\n"
        f"{prompt.strip()}\n\n"
        "Agent Sidecar refined task contract:\n"
        f"{refined.refined_prompt}\n\n"
        "Acceptance criteria:\n"
        f"{acceptance or '- Preserve the user request.'}\n\n"
        "Validation expectation:\n"
        f"{refined.testing_expectations}\n\n"
        "Scope boundaries:\n"
        f"{boundaries or '- Avoid unrelated changes.'}\n"
    )


def _wrapper_events(
    result: KimiWrapperResult,
    refined: RefineResult,
    prompt: str,
    *,
    repo_path: Path,
    session_id: str | None,
    record_prompt_submitted: bool,
) -> list[SidecarEvent]:
    if not session_id:
        return []
    events: list[SidecarEvent] = []
    if record_prompt_submitted:
        events.append(
            SidecarEvent(
                session_id=session_id,
                event_type="prompt_submitted",
                source=EventSource.detector,
                payload={"prompt": prompt},
                metadata=EventMeta(repo_path=str(repo_path)),
            )
        )
    events.append(
        SidecarEvent(
            session_id=session_id,
            event_type="prompt_refined",
            source=EventSource.detector,
            payload={**refined.model_dump(mode="json"), "original_prompt": prompt},
            metadata=EventMeta(repo_path=str(repo_path)),
        )
    )
    events.append(
        SidecarEvent(
            session_id=session_id,
            event_type="kimi_wrapper_completed",
            source=EventSource.detector,
            payload={
                **result.model_dump(mode="json"),
                "original_prompt": prompt,
                "refined_prompt": refined.refined_prompt,
                "refinement_source": refined.source,
            },
            metadata=EventMeta(repo_path=str(repo_path)),
        )
    )
    return events


def _reasoning_refinement_task() -> str:
    return """Return compact, task-specific JSON only.

Fields:
- refined_prompt: one concise coding-agent instruction that preserves the user's requested files, sections, interactions, and scope.
- acceptance_criteria: 2 or 3 short, specific success checks.
- testing_expectations: one short validation sentence.
- do_not_change: 1 or 2 concrete scope boundaries.
- files_or_components: exact file or component names.

Do not add explanation, markdown, placeholder text, or requirements the user did not ask for."""


def _prompt_template(name: str) -> str:
    return resources.files("agent_sidecar.models.prompts").joinpath(name).read_text(encoding="utf-8")
