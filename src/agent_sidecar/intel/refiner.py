from __future__ import annotations

import re
from pathlib import Path
from importlib import resources

from agent_sidecar.intel.refiner_fallback import refine_deterministically
from agent_sidecar.models.validation import is_material_restatement
from agent_sidecar.schema.events import EventMeta, EventSource, SidecarEvent
from agent_sidecar.schema.model_io import ModelProvider, ModelRole, NextStepDraft, RefineDraft, RefineJudgment, RefineResult


class ModelEnsembleRequiredError(RuntimeError):
    """Raised when model-only refinement is required but the ensemble cannot produce it."""


class ReasoningRefinementRequiredError(RuntimeError):
    """Raised when DeepSeek-only prompt refinement is required but unavailable."""


class CodingRefinementRequiredError(RuntimeError):
    """Raised when coding-model refinement is required but unavailable."""


def refine_prompt(
    prompt: str,
    *,
    repo_path: Path,
    session_id: str | None = None,
    provider: ModelProvider | None = None,
    record_prompt_submitted: bool = True,
    require_model_ensemble: bool = False,
    require_reasoning_refinement: bool = False,
    require_coding_refinement: bool = False,
) -> tuple[RefineResult, list[SidecarEvent]]:
    deterministic = refine_deterministically(prompt)
    validation_opt_out = deterministic.validation_opt_out
    coding_task = _prompt_template("refine_coding.txt")
    reasoning_task = _prompt_template("refine_reasoning.txt")

    if require_reasoning_refinement:
        draft = provider.complete_json(ModelRole.reasoning, _reasoning_refinement_task(), prompt, RefineDraft) if provider else None
        if not isinstance(draft, RefineDraft):
            raise ReasoningRefinementRequiredError("DeepSeek did not produce a valid refinement draft")
        if is_material_restatement(prompt, draft.refined_prompt):
            raise ReasoningRefinementRequiredError("DeepSeek refinement was only a material restatement of the original prompt")

        if require_coding_refinement:
            coding_draft = provider.complete_json(ModelRole.coding, _coding_followup_task(), _coding_followup_prompt(prompt, draft), NextStepDraft) if provider else None
            if not isinstance(coding_draft, NextStepDraft):
                raise CodingRefinementRequiredError("coding model did not produce a valid coding next step")
            result = RefineResult(
                quality="medium",
                issues=[],
                refined_prompt=_with_focus(draft.refined_prompt, coding_draft.next_step, prompt),
                acceptance_criteria=draft.acceptance_criteria,
                testing_expectations=draft.testing_expectations,
                do_not_change=draft.do_not_change,
                source="reasoning-then-coding",
                validation_opt_out=validation_opt_out,
            )
            return result, _refinement_events(
                result,
                prompt,
                repo_path=repo_path,
                session_id=session_id,
                record_prompt_submitted=record_prompt_submitted,
            )

        result = RefineResult(
            quality="medium",
            issues=[],
            refined_prompt=draft.refined_prompt,
            acceptance_criteria=draft.acceptance_criteria,
            testing_expectations=draft.testing_expectations,
            do_not_change=draft.do_not_change,
            source="reasoning-only",
            validation_opt_out=validation_opt_out,
        )
        return result, _refinement_events(
            result,
            prompt,
            repo_path=repo_path,
            session_id=session_id,
            record_prompt_submitted=record_prompt_submitted,
        )

    if require_coding_refinement and not require_model_ensemble:
        # Well-specified prompt: the deterministic pass found nothing to improve, so the
        # coding model can only restate it — and its Focus line is discarded by the novelty
        # gate anyway. Skip the blocking local call entirely (measured ~13s of pure latency
        # for a thrown-away result). Coding refinement is consulted only when it can help.
        if not deterministic.issues:
            return deterministic, _refinement_events(
                deterministic,
                prompt,
                repo_path=repo_path,
                session_id=session_id,
                record_prompt_submitted=record_prompt_submitted,
            )
        coding_draft = provider.complete_json(ModelRole.coding, _coding_followup_task(), _coding_followup_prompt(prompt, deterministic), NextStepDraft) if provider else None
        if not isinstance(coding_draft, NextStepDraft):
            raise CodingRefinementRequiredError("coding model did not produce a valid coding next step")
        result = deterministic.model_copy(
            update={
                "refined_prompt": _with_focus(deterministic.refined_prompt, coding_draft.next_step, prompt),
                "source": "deterministic-then-coding",
            }
        )
        return result, _refinement_events(
            result,
            prompt,
            repo_path=repo_path,
            session_id=session_id,
            record_prompt_submitted=record_prompt_submitted,
        )

    draft = provider.complete_json(ModelRole.coding, coding_task, prompt, RefineDraft) if provider else None
    judgment_prompt = prompt
    if draft is not None:
        judgment_prompt = f"Original prompt:\n{prompt}\n\nDraft JSON:\n{draft.model_dump_json()}"
    judgment = provider.complete_json(ModelRole.reasoning, reasoning_task, judgment_prompt, RefineJudgment) if provider else None

    draft_is_usable = isinstance(draft, RefineDraft) and not is_material_restatement(prompt, draft.refined_prompt)
    judgment_approves = isinstance(judgment, RefineJudgment) and judgment.approved

    if require_model_ensemble and not (draft_is_usable and judgment_approves):
        raise ModelEnsembleRequiredError(_ensemble_failure_reason(prompt, draft, judgment))

    if draft_is_usable:
        if judgment_approves:
            result = RefineResult(
                quality=judgment.quality,
                issues=judgment.issues,
                refined_prompt=draft.refined_prompt,
                acceptance_criteria=draft.acceptance_criteria,
                testing_expectations=draft.testing_expectations,
                do_not_change=draft.do_not_change,
                source="ensemble",
                validation_opt_out=validation_opt_out,
            )
        else:
            result = RefineResult(
                quality="medium",
                issues=deterministic.issues,
                refined_prompt=draft.refined_prompt,
                acceptance_criteria=draft.acceptance_criteria,
                testing_expectations=draft.testing_expectations,
                do_not_change=draft.do_not_change,
                source="coding-only",
                validation_opt_out=validation_opt_out,
            )
    else:
        result = deterministic
        if isinstance(judgment, RefineJudgment):
            result = result.model_copy(update={"quality": judgment.quality, "issues": judgment.issues or result.issues})

    return result, _refinement_events(
        result,
        prompt,
        repo_path=repo_path,
        session_id=session_id,
        record_prompt_submitted=record_prompt_submitted,
    )


def _refinement_events(
    result: RefineResult,
    prompt: str,
    *,
    repo_path: Path,
    session_id: str | None,
    record_prompt_submitted: bool,
) -> list[SidecarEvent]:
    events: list[SidecarEvent] = []
    if session_id and record_prompt_submitted:
        events.append(
            SidecarEvent(
                session_id=session_id,
                event_type="prompt_submitted",
                source=EventSource.detector,
                payload={"prompt": prompt},
                metadata=EventMeta(repo_path=str(repo_path)),
            )
        )
    if session_id:
        events.append(
            SidecarEvent(
                session_id=session_id,
                event_type="prompt_refined",
                source=EventSource.detector,
                payload={**result.model_dump(mode="json"), "original_prompt": prompt},
                metadata=EventMeta(repo_path=str(repo_path)),
            )
        )
    return events


def _ensemble_failure_reason(prompt: str, draft: RefineDraft | None, judgment: RefineJudgment | None) -> str:
    reasons: list[str] = []
    if not isinstance(draft, RefineDraft):
        reasons.append("coding model did not produce a valid refinement draft")
    elif is_material_restatement(prompt, draft.refined_prompt):
        reasons.append("coding model draft was only a material restatement of the original prompt")
    if not isinstance(judgment, RefineJudgment):
        reasons.append("reasoning model did not produce a valid judgment")
    elif not judgment.approved:
        reasons.append("reasoning model rejected the coding draft")
    return "; ".join(reasons) or "model ensemble did not produce an approved refinement"


_WORD_PATTERN = re.compile(r"[a-zA-Z][a-zA-Z0-9_-]{2,}")

# The Focus line only earns its Claude input tokens when it adds information the
# contract does not already carry. Local drafting is free, so the model is always
# consulted; what gets gated is the injected text.
MIN_NOVEL_WORD_RATIO = 0.2


def _with_focus(refined: str, next_step: str, prompt: str) -> str:
    focus = " ".join(next_step.split())
    if not focus:
        return refined
    focus_words = _content_words(focus)
    if not focus_words:
        return refined
    known_words = _content_words(refined) | _content_words(prompt)
    novel = focus_words - known_words
    if len(novel) / len(focus_words) < MIN_NOVEL_WORD_RATIO:
        return refined
    return f"{refined}\n\nFocus: {focus}"


def _content_words(text: str) -> set[str]:
    return {word.lower() for word in _WORD_PATTERN.findall(text)}


def _coding_followup_prompt(prompt: str, draft: RefineDraft | RefineResult) -> str:
    criteria = "\n".join(f"- {_truncate(item, 90)}" for item in draft.acceptance_criteria[:2])
    boundaries = "\n".join(f"- {_truncate(item, 80)}" for item in draft.do_not_change[:2])
    return (
        f"Original: {_truncate(prompt, 650)}\n"
        f"Refined task contract: {_truncate(draft.refined_prompt, 220)}\n"
        "Criteria:\n"
        f"{criteria or '- Keep the requested behavior scoped and verifiable.'}\n\n"
        f"Validation: {_truncate(draft.testing_expectations, 120)}\n"
        "Boundaries:\n"
        f"{boundaries or '- Do not change unrelated files.'}\n\n"
        "Write the compact coding-agent contract Claude Code should execute. "
        "Preserve the user's requested sections and interactions exactly; do not invent new UI behavior."
    )


def _coding_followup_task() -> str:
    return """Return compact, task-specific JSON only.

Fields:
- next_step: one concrete coding instruction under 45 words.
- rationale: one short reason this instruction preserves the task.

Do not copy field descriptions, placeholder text, or examples into values."""


def _reasoning_refinement_task() -> str:
    return """Return compact, task-specific JSON only.

Fields:
- refined_prompt: one concise coding-agent instruction under 80 words that preserves the user's requested files, sections, interactions, and scope.
- acceptance_criteria: 2 or 3 short, specific success checks, each under 12 words.
- testing_expectations: one short validation sentence under 18 words.
- do_not_change: 1 or 2 concrete scope boundaries, each under 10 words.
- files_or_components: exact file or component names.

Optimize for fewer Claude Code tokens. Remove repetition, examples, background, and obvious restatements.
Do not add explanation, markdown, placeholder text, or requirements the user did not ask for."""


def _truncate(text: str, limit: int) -> str:
    compact = " ".join(text.split())
    return compact if len(compact) <= limit else compact[: max(0, limit - 3)].rstrip() + "..."


def _prompt_template(name: str) -> str:
    return resources.files("agent_sidecar.models.prompts").joinpath(name).read_text(encoding="utf-8")
