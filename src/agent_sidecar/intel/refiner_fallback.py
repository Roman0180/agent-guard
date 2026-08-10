from __future__ import annotations

import re

from agent_sidecar.schema.model_io import RefineResult


# Word-boundary patterns only: substring matching used to flag well-specified prompts
# as vague ("make the current state visibly change" matched "make", "No tests" matched
# "tests"). "make" and "tests" are dropped entirely — both appear routinely in thorough
# prompts and signal specificity, not vagueness.
VAGUE_PATTERNS = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (r"\bfix\b", r"\bimprove\b", r"\bbetter\b", r"\bbroken\b", r"\bnot working\b")
)

# Explicit user opt-outs of test/validation runs. When one is present, the contract must
# not instruct Claude to run validation — that contradiction made the agent attempt test
# commands the user forbade and narrate the failure, spending output tokens for nothing.
VALIDATION_OPT_OUT_PATTERNS = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\bno tests?\b",
        r"\bno validation\b",
        r"\bwithout (?:running )?(?:the )?(?:tests?|validation)\b",
        r"\b(?:do not|don'?t) run (?:the )?(?:tests?|validation)\b",
        r"\bskip (?:the )?(?:tests?|validation)\b",
    )
)

NO_VALIDATION_EXPECTATION = "The user asked for no test or validation runs; do not run them."

# Echoing the raw prompt verbatim into the task contract is unbounded: a long issue body
# (or oracle test-list content embedded in it) gets faithfully amplified into the contract
# and can push Claude toward doing much more work than the original prompt asked for, for
# no quality gain. Cap what gets echoed so acceptance criteria/validation/boundaries always
# reach Claude intact instead of being crowded out or invisibly copied wholesale.
MAX_ECHOED_TASK_CHARS = 700
# Users put scope constraints at the end of prompts ("No tests...", "Briefly summarize"),
# so truncation preserves the tail instead of cutting it.
TRUNCATED_TAIL_CHARS = 200

DEFAULT_DO_NOT_CHANGE = ["unrelated files", "public behavior outside the requested scope"]


def refine_deterministically(prompt: str) -> RefineResult:
    issues = detect_issues(prompt)
    opt_out = has_validation_opt_out(prompt)
    task = _truncate_middle(prompt.strip(), MAX_ECHOED_TASK_CHARS) or "Complete the requested coding task"

    if not issues:
        # Well-specified prompt: the generic guidance below adds Claude input tokens
        # without adding information. Echo only the task and scope boundaries.
        return RefineResult(
            quality="medium",
            issues=[],
            refined_prompt=f"Task: {task}",
            acceptance_criteria=[],
            testing_expectations=NO_VALIDATION_EXPECTATION if opt_out else "",
            do_not_change=list(DEFAULT_DO_NOT_CHANGE),
            source="deterministic",
            validation_opt_out=opt_out,
        )

    acceptance = [
        "Identify the smallest relevant code path before editing.",
        "Preserve unrelated behavior and avoid broad refactors.",
    ]
    if not opt_out:
        acceptance.append("Run the narrowest relevant validation, then a broader test if the change touches shared behavior.")
    constraints = [
        "- Do not rewrite unrelated modules.",
        "- Do not change public behavior outside the requested task unless required by failing tests.",
    ]
    if opt_out:
        constraints.append("- Do not run tests or validation commands; the user asked for none.")
    lines = [
        f"Task: {task}",
        "",
        "Context to establish before editing:",
        "- Inspect the files and tests directly involved in the request.",
        "- Reuse existing project patterns and keep changes narrowly scoped.",
        "",
        "Constraints:",
        *constraints,
        "",
        "Acceptance criteria:",
        *[f"- {item}" for item in acceptance],
    ]
    if not opt_out:
        lines.extend(["", "Validation:", "- Run the relevant test/lint/build command and report the result."])
    return RefineResult(
        quality="low",
        issues=issues,
        refined_prompt="\n".join(lines),
        acceptance_criteria=acceptance,
        testing_expectations=NO_VALIDATION_EXPECTATION if opt_out else "Run the relevant validation command before stopping.",
        do_not_change=list(DEFAULT_DO_NOT_CHANGE),
        source="deterministic",
        validation_opt_out=opt_out,
    )


def has_validation_opt_out(prompt: str) -> bool:
    return any(pattern.search(prompt) for pattern in VALIDATION_OPT_OUT_PATTERNS)


def detect_issues(prompt: str) -> list[str]:
    text = prompt.strip()
    if not text:
        return ["empty prompt"]
    lowered = text.lower()
    issues: list[str] = []
    if len(text.split()) < 6 or any(pattern.search(text) for pattern in VAGUE_PATTERNS):
        issues.append("prompt is underspecified")
    # A stated opt-out ("No tests") is an explicit validation expectation, not a missing one.
    if not has_validation_opt_out(text) and not any(word in lowered for word in ["test", "lint", "build", "validate", "pytest", "pnpm"]):
        issues.append("no validation expectation stated")
    if not any(token in lowered for token in ["/", ".py", ".ts", ".tsx", "file", "component", "module", "auth", "api"]):
        issues.append("no likely files or components named")
    return issues


def _truncate_middle(text: str, limit: int) -> str:
    compact = " ".join(text.split())
    if len(compact) <= limit:
        return compact
    tail = compact[-TRUNCATED_TAIL_CHARS:].lstrip()
    head = compact[: limit - TRUNCATED_TAIL_CHARS - 5].rstrip()
    return f"{head} ... {tail}"
