from __future__ import annotations

from enum import Enum
from typing import Literal, Protocol

from pydantic import BaseModel

from agent_sidecar.schema.session import Precision


class ModelRole(str, Enum):
    reasoning = "reasoning"
    coding = "coding"


class ModelProvider(Protocol):
    def complete_json(self, role: ModelRole, task: str, prompt: str, schema: type[BaseModel], timeout_ms: int | None = None) -> BaseModel | None:
        ...

    def health(self) -> dict:
        ...


class RefineDraft(BaseModel):
    refined_prompt: str
    acceptance_criteria: list[str]
    testing_expectations: str
    do_not_change: list[str]
    files_or_components: list[str]


class RefineJudgment(BaseModel):
    quality: Literal["low", "medium", "high"]
    issues: list[str]
    approved: bool
    revision_notes: str | None = None


class RefineResult(BaseModel):
    quality: str
    issues: list[str]
    refined_prompt: str
    acceptance_criteria: list[str]
    testing_expectations: str
    do_not_change: list[str]
    source: Literal["ensemble", "reasoning-only", "reasoning-then-coding", "coding-only", "deterministic", "deterministic-then-coding"]
    validation_opt_out: bool = False


class SteerResult(BaseModel):
    decision: Literal["continue", "suggest", "warn"]
    recommendation: str
    evidence_event_ids: list[str]
    confidence: float


class NextStepDraft(BaseModel):
    next_step: str
    rationale: str


class KimiWrapperResult(BaseModel):
    display_response: str
    implementation_summary: str
    files_changed: list[str]
    validation_performed: str
    needs_claude_execution: bool


class WasteEstimate(BaseModel):
    repeated_actions: int | None = None
    cost_usd: float | None = None
    precision: Precision


class CostEstimate(BaseModel):
    value: float
    precision: Precision


class EvaluatorFinding(BaseModel):
    evaluator_id: str
    severity: Literal["info", "suggest", "warn"]
    confidence: float
    evidence_event_ids: list[str]
    summary: str
    recommendation: str | None = None
    estimated_waste: WasteEstimate | None = None
