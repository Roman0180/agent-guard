from __future__ import annotations

from agent_sidecar.schema.model_io import RefineResult


VAGUE_TERMS = {"fix", "make", "improve", "better", "broken", "not working", "tests"}

# Echoing the raw prompt verbatim into the task contract is unbounded: a long issue body
# (or oracle test-list content embedded in it) gets faithfully amplified into the contract
# and can push Claude toward doing much more work than the original prompt asked for, for
# no quality gain. Cap what gets echoed so acceptance criteria/validation/boundaries always
# reach Claude intact instead of being crowded out or invisibly copied wholesale.
MAX_ECHOED_TASK_CHARS = 700


def refine_deterministically(prompt: str) -> RefineResult:
    issues = detect_issues(prompt)
    task = _truncate(prompt.strip(), MAX_ECHOED_TASK_CHARS) or "Complete the requested coding task"
    acceptance = [
        "Identify the smallest relevant code path before editing.",
        "Preserve unrelated behavior and avoid broad refactors.",
        "Run the narrowest relevant validation, then a broader test if the change touches shared behavior.",
    ]
    refined = "\n".join(
        [
            f"Task: {task}",
            "",
            "Context to establish before editing:",
            "- Inspect the files and tests directly involved in the request.",
            "- Reuse existing project patterns and keep changes narrowly scoped.",
            "",
            "Constraints:",
            "- Do not rewrite unrelated modules.",
            "- Do not change public behavior outside the requested task unless required by failing tests.",
            "",
            "Acceptance criteria:",
            *[f"- {item}" for item in acceptance],
            "",
            "Validation:",
            "- Run the relevant test/lint/build command and report the result.",
        ]
    )
    quality = "low" if issues else "medium"
    return RefineResult(
        quality=quality,
        issues=issues,
        refined_prompt=refined,
        acceptance_criteria=acceptance,
        testing_expectations="Run the relevant validation command before stopping.",
        do_not_change=["unrelated files", "public behavior outside the requested scope"],
        source="deterministic",
    )


def detect_issues(prompt: str) -> list[str]:
    text = prompt.strip().lower()
    issues: list[str] = []
    if not text:
        return ["empty prompt"]
    if len(text.split()) < 6 or any(term in text for term in VAGUE_TERMS):
        issues.append("prompt is underspecified")
    if not any(word in text for word in ["test", "lint", "build", "validate", "pytest", "pnpm"]):
        issues.append("no validation expectation stated")
    if not any(token in text for token in ["/", ".py", ".ts", ".tsx", "file", "component", "module", "auth", "api"]):
        issues.append("no likely files or components named")
    return issues


def _truncate(text: str, limit: int) -> str:
    compact = " ".join(text.split())
    return compact if len(compact) <= limit else compact[: max(0, limit - 3)].rstrip() + "..."
