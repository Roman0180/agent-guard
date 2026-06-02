export type AgentKind = "codex" | "claude-code" | "generic";
export type HookEventType = "run_started" | "prompt" | "tool_call" | "tool_result" | "file_edit" | "validation" | "final_attempt" | "compaction" | "run_finished" | "error";
export type PromptRewriteMode = "initial_task" | "continuation" | "compaction" | "lesson_injection";
export type Lesson = { id: string; trigger: Record<string, unknown>; text: string; confidence: number; evidence: Record<string, unknown>[]; scope: Record<string, unknown>; status: "candidate" | "approved" | "disabled" | "expired"; createdAt: string; updatedAt: string; expiresAt?: string };
export type TaskContract = { task: string; scope: string[]; constraints: string[]; acceptance_criteria: string[]; pr_boundaries: string[]; test_expectations: string[]; validation_requirements: string[]; relevant_lessons: string[]; risk_notes: string[] };
export type ContextSnapshot = { repoType?: string; agentsMd?: string[]; previousPlans?: string[]; fileTree?: string[]; activeBranch?: string; relevantDiffs?: string[] };
export type PromptOptimizationInput = { runId: string; eventId: string; mode: PromptRewriteMode; agent: AgentKind; originalPrompt?: string; original_prompt?: string; repoPath?: string; eventType?: HookEventType; compactRunState?: Record<string, unknown>; policySummary?: string[]; approvedMatchingLessons?: Lesson[]; validationStatus?: string; latestErrorSignature?: string; changedFileCount: number; recentCommandSignatures: string[]; contextSnapshot?: ContextSnapshot; normalizedEvent: { summary: string; compactMetadata?: Record<string, unknown> } & Record<string, unknown>; runState: Record<string, unknown>; policy: { protectedPaths: string[] } & Record<string, unknown>; approvedLessons: Lesson[]; maxPromptLength: number };
export type PromptOptimizationResult = { id: string; runId: string; eventId: string; mode: PromptRewriteMode; originalPrompt?: string; optimizedPrompt: string; estimatedOptimizedTokens: number; resultQuality: "unknown" | "accepted" | "needs_followup" | "failed"; taskContract: TaskContract; constraints: string[]; validationRequirements: string[]; relevantLessons: Lesson[]; riskNotes: string[]; estimatedTokenDelta: number; rewriteReason: string; shouldInject: boolean; injected: boolean; deterministicOrModel: "deterministic" | "model_assisted"; createdAt: string };
export type LocalModelPromptOptimizerOptions = { enabled?: boolean; baseUrl?: string; model?: string; timeoutMs?: number; fetch?: typeof fetch };

export type PromptOptimizerOptions = {
  maxPromptLength?: number;
  now?: () => string;
  idFactory?: () => string;
  localModel?: LocalModelPromptOptimizerOptions;
};

const DEFAULT_MAX_PROMPT_LENGTH = 2_400;
const DEFAULT_LOCAL_MODEL_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_LOCAL_MODEL = "deepseek-r1:7b";
const DEFAULT_LOCAL_MODEL_TIMEOUT_MS = 60_000;
const VAGUE_PROMPT_PATTERN = /^(fix|do|implement|update|make|add|improve|help|work on)\b.{0,80}$/i;
const TROUBLESHOOTING_PROMPT_PATTERN = /\b(can you figure it out|whatever is wrong|not working|keeps? breaking|keeps? failing|something is wrong|debug this|look into (it|this))\b/i;

export class PromptOptimizer {
  private readonly maxPromptLength: number;
  private readonly now: () => string;
  private readonly idFactory: () => string;
  private readonly localModel?: Required<LocalModelPromptOptimizerOptions>;

  constructor(options: PromptOptimizerOptions = {}) {
    this.maxPromptLength = options.maxPromptLength ?? DEFAULT_MAX_PROMPT_LENGTH;
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? (() => `prompt-opt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    this.localModel = options.localModel
      ? {
          enabled: options.localModel.enabled ?? false,
          baseUrl: options.localModel.baseUrl ?? DEFAULT_LOCAL_MODEL_BASE_URL,
          model: options.localModel.model ?? DEFAULT_LOCAL_MODEL,
          timeoutMs: options.localModel.timeoutMs ?? DEFAULT_LOCAL_MODEL_TIMEOUT_MS,
          fetch: options.localModel.fetch ?? fetch
        }
      : undefined;
  }

  optimize(input: PromptOptimizationInput): PromptOptimizationResult {
    const maxLength = Math.min(input.maxPromptLength, this.maxPromptLength);
    const mode = input.mode;
    const lessons = selectRelevantLessons(input).slice(0, 3);
    const taskContract = buildTaskContract(input, lessons);
    const rewrite = renderPrompt(mode, input, taskContract, lessons);
    const optimizedPrompt = truncatePrompt(rewrite.prompt, maxLength);
    const originalPrompt = input.originalPrompt ?? input.original_prompt ?? input.normalizedEvent.summary;
    const estimatedOptimizedTokens = estimateTokens(optimizedPrompt);
    const estimatedTokenDelta = estimatedOptimizedTokens - estimateTokens(originalPrompt);

    return {
      id: this.idFactory(),
      runId: input.runId,
      eventId: input.eventId,
      mode,
      originalPrompt,
      optimizedPrompt,
      estimatedOptimizedTokens,
      resultQuality: "unknown",
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

  async optimizeWithLocalModel(input: PromptOptimizationInput): Promise<PromptOptimizationResult | undefined> {
    if (!this.localModel?.enabled) {
      return undefined;
    }

    const assisted = await requestLocalModelOptimization(input, this.localModel);
    if (!assisted.shouldInject) {
      return undefined;
    }

    const maxLength = Math.min(input.maxPromptLength, this.maxPromptLength);
    const optimizedPrompt = truncatePrompt(assisted.optimizedPrompt, maxLength);
    const taskContract = assisted.taskContract ?? emptyTaskContract(input);
    const lessons = selectRelevantLessons(input).slice(0, 3);
    const originalPrompt = input.originalPrompt ?? input.original_prompt ?? input.normalizedEvent.summary;
    const estimatedOptimizedTokens = estimateTokens(optimizedPrompt);

    return {
      id: this.idFactory(),
      runId: input.runId,
      eventId: input.eventId,
      mode: input.mode,
      originalPrompt,
      optimizedPrompt,
      estimatedOptimizedTokens,
      resultQuality: "unknown",
      taskContract,
      constraints: taskContract.constraints,
      validationRequirements: taskContract.validation_requirements,
      relevantLessons: lessons,
      riskNotes: taskContract.risk_notes,
      estimatedTokenDelta: estimatedOptimizedTokens - estimateTokens(originalPrompt),
      rewriteReason: assisted.rewriteReason || `Optimized by local model ${this.localModel.model}.`,
      shouldInject: assisted.shouldInject,
      injected: false,
      deterministicOrModel: "model_assisted",
      createdAt: this.now()
    };
  }
}

async function requestLocalModelOptimization(
  input: PromptOptimizationInput,
  localModel: Required<LocalModelPromptOptimizerOptions>
): Promise<{ optimizedPrompt: string; rewriteReason?: string; shouldInject: boolean; taskContract?: TaskContract }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), localModel.timeoutMs);

  try {
    const response = await localModel.fetch(`${localModel.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: localModel.model,
        stream: false,
        format: "json",
        think: false,
        options: {
          temperature: 0,
          num_predict: 900
        },
        messages: [
          {
            role: "system",
            content:
              "Return only minified JSON. No markdown. No explanation. Schema: {\"shouldInject\":true,\"optimizedPrompt\":\"Task: ...\\n\\nLikely areas to inspect:\\n- ...\\n\\nImplementation approach:\\n- ...\\n\\nConstraints:\\n- ...\\n\\nAcceptance criteria:\\n- ...\\n\\nPR boundaries:\\n- ...\\n\\nTest expectations:\\n- ...\\n\\nValidation:\\n- ...\",\"rewriteReason\":\"...\",\"taskContract\":{\"task\":\"...\",\"scope\":[],\"constraints\":[],\"acceptance_criteria\":[],\"pr_boundaries\":[],\"test_expectations\":[],\"validation_requirements\":[],\"relevant_lessons\":[],\"risk_notes\":[]}}. Every user prompt is missing operational detail before it is sent to a coding agent. DeepSeek R1 must fill in that missing detail. The optimizedPrompt must be a multi-section task brief and must be substantially more detailed than the original prompt. Include likely files or areas to inspect, concrete implementation steps, constraints, acceptance criteria, PR boundaries, risks, test expectations, and validation commands. Preserve user intent, but do not simply restate the prompt. Never say the original prompt is already concise enough. Always return shouldInject true unless the prompt is unsafe or unrelated to coding."
          },
          {
            role: "user",
            content: [
              `Prompt: ${input.originalPrompt ?? input.original_prompt ?? input.normalizedEvent.summary}`,
              `Mode: ${input.mode}`,
              input.repoPath ? `Repo: ${input.repoPath}` : undefined,
              input.validationStatus ? `Validation: ${input.validationStatus}` : undefined,
              input.latestErrorSignature ? `Latest error: ${input.latestErrorSignature}` : undefined,
              input.recentCommandSignatures.length ? `Recent commands: ${input.recentCommandSignatures.slice(-5).join(", ")}` : undefined,
              renderContextSnapshot(input.compactRunState)
            ].filter(Boolean).join("\n")
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`local_model_http_${response.status}`);
    }

    const body = await response.json() as { message?: { content?: string }; response?: string };
    const content = stripThinking(body.message?.content ?? body.response ?? "");
    const parsed = parseJsonObject(content);
    const shouldInject = parsed.shouldInject !== false;
    const parsedTaskContract = taskContractFromUnknown(parsed.taskContract) ?? taskContractFromUnknown(parsed.optimizedPrompt);
    const optimizedPrompt = typeof parsed.optimizedPrompt === "string"
      ? parsed.optimizedPrompt.trim()
      : parsedTaskContract
        ? renderTaskContractPrompt(parsedTaskContract)
        : "";
    if (shouldInject && !optimizedPrompt) {
      throw new Error("local_model_missing_optimized_prompt");
    }
    if (shouldInject && !isExpandedPrompt(input, optimizedPrompt)) {
      throw new Error("local_model_restatement");
    }

    return {
      optimizedPrompt,
      rewriteReason: typeof parsed.rewriteReason === "string" ? parsed.rewriteReason.trim() : undefined,
      shouldInject,
      taskContract: parsedTaskContract
    };
  } finally {
    clearTimeout(timeout);
  }
}

function renderContextSnapshot(snapshot: Record<string, unknown> | undefined): string | undefined {
  if (!snapshot || Object.keys(snapshot).length === 0) {
    return undefined;
  }

  const fileTree = toStringArray(snapshot.fileTree).slice(0, 80);
  const previousPlans = toStringArray(snapshot.previousPlans).slice(0, 2);
  const agentsInstructions =
    typeof snapshot.agentsInstructions === "string" ? snapshot.agentsInstructions : toStringArray(snapshot.agentsMd).join("\n\n");
  const relevantDiffs =
    typeof snapshot.relevantDiffs === "string" ? snapshot.relevantDiffs : toStringArray(snapshot.relevantDiffs).join("\n");
  return [
    "Sidecar repo context:",
    typeof snapshot.repoType === "string" ? `Repo type: ${snapshot.repoType}` : undefined,
    typeof snapshot.activeBranch === "string" ? `Active branch: ${snapshot.activeBranch}` : undefined,
    agentsInstructions.trim()
      ? `AGENTS.md excerpt:\n${agentsInstructions.slice(0, 1_500)}`
      : undefined,
    previousPlans.length ? `Previous plans:\n${previousPlans.join("\n\n").slice(0, 2_000)}` : undefined,
    fileTree.length ? `File tree excerpt:\n${fileTree.join("\n")}` : undefined,
    relevantDiffs.trim()
      ? `Relevant diff stat:\n${relevantDiffs.slice(0, 1_500)}`
      : undefined
  ].filter(Boolean).join("\n\n");
}

function isExpandedPrompt(input: PromptOptimizationInput, optimizedPrompt: string): boolean {
  const original = clean(input.originalPrompt ?? input.original_prompt ?? input.normalizedEvent.summary).toLowerCase();
  const optimized = clean(optimizedPrompt).toLowerCase();
  if (!original) return optimizedPrompt.length >= 80;
  if (optimized === original) return false;
  return optimizedPrompt.length >= Math.max(120, original.length * 2) && /\b(validation|test|inspect|implementation|constraint|risk|files?|areas?)\b/i.test(optimizedPrompt);
}

function emptyTaskContract(input: PromptOptimizationInput): TaskContract {
  const task = clean(input.originalPrompt ?? input.original_prompt ?? input.normalizedEvent.summary);
  return {
    task: task || "Complete the requested coding task.",
    scope: [],
    constraints: [],
    acceptance_criteria: [],
    pr_boundaries: [],
    test_expectations: [],
    validation_requirements: [],
    relevant_lessons: [],
    risk_notes: []
  };
}

function renderTaskContractPrompt(contract: TaskContract): string {
  return sections([
    ["Task", contract.task],
    ["Likely areas to inspect", listOrNone(contract.scope)],
    ["Implementation approach", listOrNone(contract.risk_notes.length ? contract.risk_notes : contract.constraints)],
    ["Constraints", listOrNone(contract.constraints)],
    ["Acceptance criteria", listOrNone(contract.acceptance_criteria)],
    ["PR boundaries", listOrNone(contract.pr_boundaries)],
    ["Test expectations", listOrNone(contract.test_expectations)],
    ["Validation", listOrNone(contract.validation_requirements)],
    ["Relevant lessons", listOrNone(contract.relevant_lessons)]
  ]);
}

function shouldInject(mode: PromptRewriteMode, input: PromptOptimizationInput, lessons: Lesson[]): boolean {
  if (mode === "lesson_injection") return lessons.length > 0;
  if (mode === "continuation") return true;
  if (mode === "compaction") return true;
  const originalPrompt = input.originalPrompt ?? input.original_prompt ?? "";
  return Boolean(originalPrompt && (isVagueOrTroubleshootingPrompt(originalPrompt) || lessons.length > 0));
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
      ...(input.contextSnapshot?.activeBranch ? [`Keep changes on branch ${input.contextSnapshot.activeBranch}.`] : []),
      ...(input.policy.protectedPaths.length ? [`Do not modify protected paths: ${input.policy.protectedPaths.slice(0, 4).join(", ")}.`] : [])
    ].slice(0, 8),
    acceptance_criteria: [
      "The requested behavior is implemented without unrelated changes.",
      "Relevant existing behavior remains compatible.",
      "The final response summarizes changed files and validation evidence."
    ],
    pr_boundaries: [
      "Keep the PR focused on this task only.",
      "Do not include speculative refactors or follow-up features.",
      "Call out any intentionally deferred work in the final response."
    ],
    test_expectations: validationStatus === "passed"
      ? ["Preserve existing passing validation evidence and rerun if files change."]
      : ["Run the narrowest reliable test, build, or lint command that proves the change."],
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
    reason: rewriteReasonForInitialTask(input.originalPrompt ?? input.original_prompt ?? ""),
    prompt: sections([
      ["Task", contract.task],
      ["Context", contextSummary(input)],
      ["Scope", listOrNone(contract.scope)],
      ["Constraints", listOrNone(contract.constraints)],
      ["Acceptance criteria", listOrNone(contract.acceptance_criteria)],
      ["PR boundaries", listOrNone(contract.pr_boundaries)],
      ["Test expectations", listOrNone(contract.test_expectations)],
      ["Validation", listOrNone(contract.validation_requirements)],
      ["Relevant lessons", listOrNone(contract.relevant_lessons)]
    ])
  };
}

function isVagueOrTroubleshootingPrompt(prompt: string): boolean {
  const compactPrompt = clean(prompt);
  return VAGUE_PROMPT_PATTERN.test(compactPrompt) || TROUBLESHOOTING_PROMPT_PATTERN.test(compactPrompt);
}

function rewriteReasonForInitialTask(prompt: string): string {
  const compactPrompt = clean(prompt);
  if (VAGUE_PROMPT_PATTERN.test(compactPrompt)) {
    return "Converted a vague prompt into a compact deterministic task contract.";
  }
  if (TROUBLESHOOTING_PROMPT_PATTERN.test(compactPrompt)) {
    return "Converted a vague troubleshooting prompt into a compact deterministic task contract.";
  }
  return "Rewrote the prompt as a compact deterministic task contract.";
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

function contextSummary(input: PromptOptimizationInput): string {
  const context = input.contextSnapshot;
  if (!context) return "- No sidecar context snapshot recorded.";
  return listOrNone([
    context.repoType ? `Repo type: ${context.repoType}` : "",
    context.activeBranch ? `Active branch: ${context.activeBranch}` : "",
    ...(context.agentsMd ?? []).map((item) => `AGENTS.md: ${item}`),
    ...(context.previousPlans ?? []).map((item) => `Previous plan: ${item}`),
    ...(context.fileTree ?? []).slice(0, 6).map((item) => `File tree: ${item}`),
    ...(context.relevantDiffs ?? []).slice(0, 4).map((item) => `Relevant diff: ${item}`)
  ]);
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

function stripThinking(value: string): string {
  return value.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) return {};
    const parsed = JSON.parse(match[0]) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  }
}

function taskContractFromUnknown(value: unknown): TaskContract | undefined {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  if (!record) return undefined;
  const task = typeof record.task === "string" ? clean(record.task) : "";
  if (!task) return undefined;

  return {
    task,
    scope: toStringArray(record.scope).map(clean).filter(Boolean).slice(0, 8),
    constraints: toStringArray(record.constraints).map(clean).filter(Boolean).slice(0, 8),
    acceptance_criteria: toStringArray(record.acceptance_criteria).map(clean).filter(Boolean).slice(0, 8),
    pr_boundaries: toStringArray(record.pr_boundaries).map(clean).filter(Boolean).slice(0, 8),
    test_expectations: toStringArray(record.test_expectations).map(clean).filter(Boolean).slice(0, 8),
    validation_requirements: toStringArray(record.validation_requirements).map(clean).filter(Boolean).slice(0, 8),
    relevant_lessons: toStringArray(record.relevant_lessons).map(clean).filter(Boolean).slice(0, 8),
    risk_notes: toStringArray(record.risk_notes).map(clean).filter(Boolean).slice(0, 8)
  };
}
