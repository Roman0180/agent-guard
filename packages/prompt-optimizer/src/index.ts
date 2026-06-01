export type AgentKind = "codex" | "claude-code" | "generic";
export type HookEventType = "run_started" | "prompt" | "tool_call" | "tool_result" | "file_edit" | "validation" | "final_attempt" | "compaction" | "run_finished" | "error";
export type PromptRewriteMode = "initial_task" | "continuation" | "compaction" | "lesson_injection";
export type Lesson = { id: string; trigger: Record<string, unknown>; text: string; confidence: number; evidence: Record<string, unknown>[]; scope: Record<string, unknown>; status: "candidate" | "approved" | "disabled" | "expired"; createdAt: string; updatedAt: string; expiresAt?: string };
export type TaskContract = { task: string; scope: string[]; constraints: string[]; validation_requirements: string[]; relevant_lessons: string[]; risk_notes: string[] };
export type PromptOptimizationInput = { runId: string; eventId: string; mode: PromptRewriteMode; agent: AgentKind; originalPrompt?: string; original_prompt?: string; repoPath?: string; eventType?: HookEventType; compactRunState?: Record<string, unknown>; policySummary?: string[]; approvedMatchingLessons?: Lesson[]; validationStatus?: string; latestErrorSignature?: string; changedFileCount: number; recentCommandSignatures: string[]; normalizedEvent: { summary: string; compactMetadata?: Record<string, unknown> } & Record<string, unknown>; runState: Record<string, unknown>; policy: { protectedPaths: string[] } & Record<string, unknown>; approvedLessons: Lesson[]; maxPromptLength: number };
export type PromptOptimizationResult = { id: string; runId: string; eventId: string; mode: PromptRewriteMode; optimizedPrompt: string; taskContract: TaskContract; constraints: string[]; validationRequirements: string[]; relevantLessons: Lesson[]; riskNotes: string[]; estimatedTokenDelta: number; rewriteReason: string; shouldInject: boolean; injected: boolean; deterministicOrModel: "deterministic" | "model_assisted"; createdAt: string };

export type PromptOptimizerOptions = {
  maxPromptLength?: number;
  now?: () => string;
  idFactory?: () => string;
};

const DEFAULT_MAX_PROMPT_LENGTH = 2_400;
const VAGUE_PROMPT_PATTERN = /^(fix|do|implement|update|make|add|improve|help|work on)\b.{0,80}$/i;

export class PromptOptimizer {
  private readonly maxPromptLength: number;
  private readonly now: () => string;
  private readonly idFactory: () => string;

  constructor(options: PromptOptimizerOptions = {}) {
    this.maxPromptLength = options.maxPromptLength ?? DEFAULT_MAX_PROMPT_LENGTH;
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? (() => `prompt-opt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  }

  optimize(input: PromptOptimizationInput): PromptOptimizationResult {
    const maxLength = Math.min(input.maxPromptLength, this.maxPromptLength);
    const mode = input.mode;
    const lessons = selectRelevantLessons(input).slice(0, 3);
    const taskContract = buildTaskContract(input, lessons);
    const rewrite = renderPrompt(mode, input, taskContract, lessons);
    const optimizedPrompt = truncatePrompt(rewrite.prompt, maxLength);
    const estimatedTokenDelta = estimateTokens(optimizedPrompt) - estimateTokens(input.originalPrompt ?? input.original_prompt ?? input.normalizedEvent.summary);

    return {
      id: this.idFactory(),
      runId: input.runId,
      eventId: input.eventId,
      mode,
      optimizedPrompt,
      taskContract,
      constraints: taskContract.constraints,
      validationRequirements: taskContract.validation_requirements,
      relevantLessons: lessons,
      riskNotes: taskContract.risk_notes,
      estimatedTokenDelta,
      rewriteReason: rewrite.reason,
      shouldInject: shouldInject(mode, input, lessons),
      injected: false,
      deterministicOrModel: "deterministic",
      createdAt: this.now()
    };
  }
}

function shouldInject(mode: PromptRewriteMode, input: PromptOptimizationInput, lessons: Lesson[]): boolean {
  if (mode === "lesson_injection") return lessons.length > 0;
  if (mode === "continuation") return true;
  if (mode === "compaction") return true;
  return Boolean((input.originalPrompt ?? input.original_prompt) && (VAGUE_PROMPT_PATTERN.test(input.originalPrompt ?? input.original_prompt ?? "") || lessons.length > 0));
}

function buildTaskContract(input: PromptOptimizationInput, lessons: Lesson[]): TaskContract {
  const original = clean(input.originalPrompt ?? input.original_prompt ?? input.normalizedEvent.summary);
  const validationStatus = validationStatusText(input);
  return {
    task: original || "Complete the requested coding task.",
    scope: [input.repoPath ?? "", ...stringArray(input.runState.filesInspected), ...stringArray(input.runState.filesChanged)].filter((value): value is string => value.length > 0).slice(0, 8),
    constraints: [
      "Stay within the requested scope; do not implement unrelated future steps.",
      "Use deterministic checks before making risky changes.",
      ...(input.policy.protectedPaths.length ? [`Do not modify protected paths: ${input.policy.protectedPaths.slice(0, 4).join(", ")}.`] : [])
    ].slice(0, 6),
    validation_requirements: validationStatus === "passed"
      ? ["Preserve the existing passing validation evidence."]
      : ["Run an appropriate test or build command before final response."],
    relevant_lessons: lessons.map((lesson) => lesson.text),
    risk_notes: [
      ...(input.latestErrorSignature ? [`Latest error: ${input.latestErrorSignature}`] : []),
      ...(input.changedFileCount > 0 && validationStatus !== "passed" ? ["Files changed without passing validation yet."] : []),
      ...(input.recentCommandSignatures.length > 0 ? [`Recent commands: ${input.recentCommandSignatures.slice(-3).join(", ")}`] : [])
    ].slice(0, 6)
  };
}

function renderPrompt(
  mode: PromptRewriteMode,
  input: PromptOptimizationInput,
  contract: TaskContract,
  lessons: Lesson[]
): { prompt: string; reason: string } {
  if (mode === "continuation") {
    return {
      reason: "Generated a short continuation prompt because validation is missing or the run stopped early.",
      prompt: sections([
        ["Continue", "Do not finalize yet. Validate the edits first."],
        ["Task", contract.task],
        ["Validation", contract.validation_requirements.join(" ")],
        ["Check", "If validation fails, fix only the failing area and rerun validation."]
      ])
    };
  }

  if (mode === "compaction") {
    return {
      reason: "Created compact working memory for compaction without raw traces.",
      prompt: sections([
        ["Goal", contract.task],
        ["Latest errors", input.latestErrorSignature ?? "None recorded."],
        ["Inspected files", listOrNone(stringArray(input.runState.filesInspected).slice(0, 10))],
        ["Changed files", listOrNone(stringArray(input.runState.filesChanged).slice(0, 10))],
        ["Validation", validationStatusText(input)],
        ["Active lessons", listOrNone(lessons.map((lesson) => lesson.text))]
      ])
    };
  }

  if (mode === "lesson_injection") {
    return {
      reason: "Injected only short approved lessons relevant to the current task.",
      prompt: sections([["Relevant lessons", listOrNone(lessons.map((lesson) => lesson.text))]])
    };
  }

  return {
    reason: VAGUE_PROMPT_PATTERN.test(input.originalPrompt ?? input.original_prompt ?? "")
      ? "Converted a vague prompt into a compact deterministic task contract."
      : "Rewrote the prompt as a compact deterministic task contract.",
    prompt: sections([
      ["Task", contract.task],
      ["Scope", listOrNone(contract.scope)],
      ["Constraints", listOrNone(contract.constraints)],
      ["Validation", listOrNone(contract.validation_requirements)],
      ["Relevant lessons", listOrNone(contract.relevant_lessons)]
    ])
  };
}

function selectRelevantLessons(input: PromptOptimizationInput): Lesson[] {
  const haystack = [
    (input.originalPrompt ?? input.original_prompt),
    input.normalizedEvent.summary,
    input.latestErrorSignature,
    ...input.recentCommandSignatures,
    ...stringArray(input.runState.filesChanged),
    ...stringArray(input.runState.filesInspected)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const candidateLessons = input.approvedMatchingLessons?.length ? input.approvedMatchingLessons : input.approvedLessons;
  return candidateLessons.filter((lesson) => {
    if (lesson.status !== "approved") return false;
    const trigger = lesson.trigger as Record<string, unknown>;
    const keywords = [
      ...toStringArray(trigger.tags),
      ...toStringArray(trigger.languages),
      ...toStringArray(trigger.frameworks),
      ...toStringArray(trigger.pathGlobs),
      lesson.text
    ];
    return keywords.some((keyword) => keyword && haystack.includes(keyword.toLowerCase().replace(/[*]/g, "")));
  });
}

function validationStatusText(input: PromptOptimizationInput): string {
  if (input.validationStatus) return input.validationStatus;
  if (input.runState.lastValidationPassed === true || input.runState.validationSinceLastEdit) return "passed";
  if (input.runState.lastValidationPassed === false) return "failed";
  return "missing";
}

function sections(items: Array<[string, string]>): string {
  return items.map(([title, body]) => `${title}:\n${body.trim()}`).join("\n\n");
}

function listOrNone(values: string[]): string {
  const compact = values.map(clean).filter(Boolean).slice(0, 8);
  return compact.length ? compact.map((value) => `- ${value}`).join("\n") : "- None.";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function estimateTokens(value: string): number {
  return Math.ceil(value.length / 4);
}

function truncatePrompt(prompt: string, maxLength: number): string {
  if (prompt.length <= maxLength) return prompt;
  const marker = "\n[truncated deterministically]";
  if (maxLength <= marker.length) return marker.slice(0, maxLength);
  return `${prompt.slice(0, Math.max(0, maxLength - marker.length)).trimEnd()}${marker}`.slice(0, maxLength);
}
