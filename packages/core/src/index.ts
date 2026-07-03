import { z } from "zod";

export const AGENT_SIDECAR_DAEMON_DEFAULT_PORT = 4319;

const IsoDateTime = z.string().datetime({ offset: true });
const ShortText = z.string().max(2_000);
const Identifier = z.string().min(1).max(200);

const CompactJsonValue: z.ZodType<
  | string
  | number
  | boolean
  | null
  | Array<string | number | boolean | null>
  | { [key: string]: string | number | boolean | null | Array<string | number | boolean | null> }
> = z.lazy(() =>
  z.union([
    z.string().max(2_000),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).max(50),
    z
      .record(
        z.string().max(100),
        z.union([
          z.string().max(1_000),
          z.number(),
          z.boolean(),
          z.null(),
          z.array(z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).max(50)
        ])
      )
      .refine((value) => Object.keys(value).length <= 50, "Compact objects may contain at most 50 keys")
  ])
);

const CompactRecord = z.record(z.string().max(100), CompactJsonValue);

export const AgentKind = z.enum(["codex", "claude-code", "generic"]);
export type AgentKind = z.infer<typeof AgentKind>;

export const HookEventType = z.enum([
  "run_started",
  "prompt",
  "tool_call",
  "tool_result",
  "file_edit",
  "validation",
  "final_attempt",
  "compaction",
  "run_finished",
  "error"
]);
export type HookEventType = z.infer<typeof HookEventType>;

export const ToolKind = z.enum([
  "shell",
  "file_editor",
  "search",
  "web",
  "git",
  "package_manager",
  "test_runner",
  "build_runner",
  "other"
]);
export type ToolKind = z.infer<typeof ToolKind>;

export const CommandType = z.enum(["shell", "git", "package_manager", "test", "build", "lint", "format", "search", "delete", "network", "unknown", "other"]);
export type CommandType = z.infer<typeof CommandType>;

export const FailureType = z.enum([
  "semantic_loop",
  "stale_evidence",
  "validation_missing",
  "dangerous_command",
  "protected_path",
  "broad_change",
  "policy_violation",
  "model_invalid",
  "unknown"
]);
export type FailureType = z.infer<typeof FailureType>;

export const InterventionAction = z.enum([
  "allow",
  "warn",
  "block",
  "block_continue",
  "require_validation",
  "require_approval",
  "inject_context"
]);
export type InterventionAction = z.infer<typeof InterventionAction>;

export const PromptRewriteMode = z.enum(["initial_task", "continuation", "compaction", "lesson_injection"]);
export type PromptRewriteMode = z.infer<typeof PromptRewriteMode>;

export const TokenUsage = z
  .object({
    inputTokens: z.number().int().nonnegative().default(0),
    outputTokens: z.number().int().nonnegative().default(0),
    totalTokens: z.number().int().nonnegative().default(0)
  })
  .strict();
export type TokenUsage = z.infer<typeof TokenUsage>;

export const CostEstimate = z
  .object({
    amountUsd: z.number().nonnegative().default(0),
    source: z.enum(["provider", "estimated"]).default("estimated")
  })
  .strict();
export type CostEstimate = z.infer<typeof CostEstimate>;

export const NormalizedCommand = z
  .object({
    type: CommandType,
    executable: Identifier,
    args: z.array(z.string().max(500)).max(100).default([]),
    cwd: z.string().max(1_000).optional(),
    normalized: ShortText,
    riskLevel: z.enum(["low", "medium", "high"]).default("low"),
    toolKind: ToolKind.default("shell")
  })
  .strict();
export type NormalizedCommand = z.infer<typeof NormalizedCommand>;

export const NormalizedFileEdit = z
  .object({
    paths: z.array(z.string().min(1).max(1_000)).max(500),
    operation: z.enum(["create", "modify", "delete", "rename", "mixed"]),
    filesChanged: z.number().int().nonnegative(),
    linesChanged: z.number().int().nonnegative().optional(),
    protectedPathMatches: z.array(z.string().max(1_000)).max(100).default([])
  })
  .strict();
export type NormalizedFileEdit = z.infer<typeof NormalizedFileEdit>;

export const ValidationSignal = z
  .object({
    command: ShortText,
    commandType: CommandType,
    status: z.enum(["passed", "failed", "unknown"]),
    summary: ShortText,
    completedAt: IsoDateTime
  })
  .strict();
export type ValidationSignal = z.infer<typeof ValidationSignal>;

export const NormalizedAgentEvent = z
  .object({
    id: Identifier,
    rawEventId: Identifier.optional(),
    runId: Identifier,
    agent: AgentKind,
    providerEventType: z.string().min(1).max(200).optional(),
    eventType: HookEventType,
    timestamp: IsoDateTime,
    actor: z.enum(["agent", "user", "tool", "system"]),
    summary: ShortText,
    command: NormalizedCommand.optional(),
    fileEdit: NormalizedFileEdit.optional(),
    validation: ValidationSignal.optional(),
    tokenUsage: TokenUsage.optional(),
    costEstimate: CostEstimate.optional(),
    compactMetadata: CompactRecord.default({})
  })
  .strict();
export type NormalizedAgentEvent = z.infer<typeof NormalizedAgentEvent>;

export const PendingApproval = z
  .object({
    id: Identifier,
    reasonCode: Identifier,
    summary: ShortText,
    createdAt: IsoDateTime
  })
  .strict();
export type PendingApproval = z.infer<typeof PendingApproval>;

export const RunState = z
  .object({
    runId: Identifier,
    status: z.enum(["active", "blocked", "completed", "failed"]),
    startedAt: IsoDateTime,
    updatedAt: IsoDateTime,
    agent: AgentKind,
    repoRoot: z.string().max(1_000).optional(),
    branch: z.string().max(500).optional(),
    taskSummary: ShortText.optional(),
    eventCounts: z.partialRecord(HookEventType, z.number().int().nonnegative()).default({}),
    recentCommands: z.array(NormalizedCommand).max(25).default([]),
    commandFrequency: z.record(z.string().max(500), z.number().int().nonnegative()).default({}),
    editedFiles: z.array(z.string().max(1_000)).max(500).default([]),
    changedFileCount: z.number().int().nonnegative().default(0),
    estimatedChangedLines: z.number().int().nonnegative().default(0),
    validationSinceLastEdit: z.boolean().default(false),
    lastValidation: ValidationSignal.optional(),
    pendingApprovals: z.array(PendingApproval).max(100).default([]),
    interventions: z.partialRecord(InterventionAction, z.number().int().nonnegative()).default({}),
    tokenUsage: TokenUsage.default({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
    costEstimate: CostEstimate.default({ amountUsd: 0, source: "estimated" }),
    filesChanged: z.array(z.string().max(1_000)).max(500).default([]),
    filesRead: z.array(z.string().max(1_000)).max(500).default([]),
    filesInspected: z.array(z.string().max(1_000)).max(500).default([]),
    commandSignatures: z.array(z.string().max(500)).max(1_000).default([]),
    recentCommandSignatures: z.array(z.string().max(500)).max(25).default([]),
    repeatedCommandCounts: z.record(z.string().max(500), z.number().int().nonnegative()).default({}),
    latestErrorSignature: z.string().max(500).optional(),
    latestErrors: z.array(z.string().max(1_000)).max(10).default([]),
    lastEditAt: IsoDateTime.optional(),
    lastValidationAt: IsoDateTime.optional(),
    lastValidationPassed: z.boolean().optional(),
    validationCommandCount: z.number().int().nonnegative().default(0),
    toolCallCount: z.number().int().nonnegative().default(0),
    riskEvents: z.array(z.string().max(500)).max(100).default([]),
    injectedLessons: z.array(Identifier).max(100).default([]),
    promptOptimizationCount: z.number().int().nonnegative().default(0),
    continuationPromptCount: z.number().int().nonnegative().default(0),
    compactionPromptCount: z.number().int().nonnegative().default(0)
  })
  .strict();
export type RunState = z.infer<typeof RunState>;

export const Decision = z
  .object({
    id: Identifier,
    runId: Identifier,
    eventId: Identifier,
    createdAt: IsoDateTime,
    source: z.enum(["runtime_monitor", "steering_ensemble", "manual", "system"]),
    action: InterventionAction,
    severity: z.enum(["info", "warning", "error"]),
    reasonCode: Identifier,
    message: ShortText,
    monitorId: Identifier.optional(),
    lessonIds: z.array(Identifier).max(10).optional(),
    steeringDecisionId: Identifier.optional(),
    continuationPrompt: z.string().max(4_000).optional(),
    expiresAt: IsoDateTime.optional(),
    compactMetadata: CompactRecord.default({})
  })
  .strict();
export type Decision = z.infer<typeof Decision>;

export const Policy = z
  .object({
    version: z.literal(1),
    failMode: z.enum(["open", "closed"]),
    protectedPaths: z.array(z.string().min(1).max(1_000)).max(500).default([]),
    dangerousCommands: z.array(z.string().min(1).max(1_000)).max(500).default([]),
    broadChangeThreshold: z
      .object({
        maxFilesChanged: z.number().int().positive(),
        maxLinesChanged: z.number().int().positive()
      })
      .strict(),
    validation: z
      .object({
        requireAfterEdit: z.boolean(),
        acceptedCommands: z.array(z.string().min(1).max(1_000)).max(100)
      })
      .strict(),
    steering: z
      .object({
        enabled: z.boolean(),
        providers: z.array(z.string().max(100)).max(10).default([]),
        maxCallsPerRun: z.number().int().nonnegative(),
        maxCostUsdPerRun: z.number().nonnegative().default(0)
      })
      .strict()
  })
  .strict();
export type Policy = z.infer<typeof Policy>;

export const LessonTrigger = z
  .object({
    languages: z.array(z.string().max(100)).max(25).default([]),
    frameworks: z.array(z.string().max(100)).max(25).default([]),
    pathGlobs: z.array(z.string().max(500)).max(100).default([]),
    commandTypes: z.array(CommandType).max(25).default([]),
    failureTypes: z.array(FailureType).max(25).default([]),
    tags: z.array(z.string().max(100)).max(50).default([])
  })
  .strict();
export type LessonTrigger = z.infer<typeof LessonTrigger>;

export const LessonEvidence = z
  .object({
    runId: Identifier,
    eventIds: z.array(Identifier).max(25).default([]),
    summary: ShortText
  })
  .strict();
export type LessonEvidence = z.infer<typeof LessonEvidence>;

export const LessonScope = z
  .object({
    kind: z.enum(["global", "repo", "path", "language", "framework"]),
    value: z.string().max(1_000).optional()
  })
  .strict();
export type LessonScope = z.infer<typeof LessonScope>;

export const Lesson = z
  .object({
    id: Identifier,
    trigger: LessonTrigger,
    text: z.string().min(1).max(500),
    confidence: z.number().min(0).max(1),
    evidence: z.array(LessonEvidence).max(25).default([]),
    scope: LessonScope,
    status: z.enum(["candidate", "approved", "disabled", "expired"]),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
    expiresAt: IsoDateTime.optional()
  })
  .strict();
export type Lesson = z.infer<typeof Lesson>;

export const SteeringEnsembleInput = z
  .object({
    runId: Identifier,
    eventId: Identifier.optional(),
    purpose: z.enum([
      "semantic_loop",
      "stale_evidence",
      "premature_final",
      "broad_edit",
      "lesson_selection",
      "failure_category",
      "prompt_optimization"
    ]),
    agent: AgentKind,
    eventType: HookEventType.optional(),
    taskSummary: ShortText.optional(),
    recentEventSummaries: z.array(ShortText).max(20).default([]),
    state: CompactRecord.default({}),
    features: CompactRecord.default({}),
    allowedActions: z.array(InterventionAction).min(1).max(10),
    candidateLessons: z.array(Lesson).max(10).default([]),
    maxCostUsd: z.number().nonnegative().default(0),
    candidateProviders: z.array(z.string().max(100)).max(10).default([])
  })
  .strict();
export type SteeringEnsembleInput = z.infer<typeof SteeringEnsembleInput>;

export const SteeringEnsembleOutput = z
  .object({
    action: InterventionAction,
    confidence: z.number().min(0).max(1),
    reasonCode: Identifier,
    message: ShortText,
    participatingModels: z.array(z.string().max(100)).max(10).default([]),
    lessonIds: z.array(Identifier).max(10).optional(),
    failureType: FailureType.optional()
  })
  .strict();
export type SteeringEnsembleOutput = z.infer<typeof SteeringEnsembleOutput>;

export const TaskContract = z
  .object({
    task: ShortText,
    scope: z.array(z.string().max(500)).max(50),
    constraints: z.array(z.string().max(500)).max(50),
    acceptance_criteria: z.array(z.string().max(500)).max(50),
    pr_boundaries: z.array(z.string().max(500)).max(50),
    test_expectations: z.array(z.string().max(500)).max(50),
    validation_requirements: z.array(z.string().max(500)).max(50),
    relevant_lessons: z.array(z.string().max(500)).max(10),
    risk_notes: z.array(z.string().max(500)).max(25)
  })
  .strict();
export type TaskContract = z.infer<typeof TaskContract>;

export const PromptOptimizationInput = z
  .object({
    runId: Identifier,
    eventId: Identifier,
    mode: PromptRewriteMode,
    agent: AgentKind,
    originalPrompt: z.string().max(8_000).optional(),
    original_prompt: z.string().max(8_000).optional(),
    repoPath: z.string().max(1_000).optional(),
    eventType: HookEventType.optional(),
    compactRunState: CompactRecord.default({}),
    policySummary: z.array(z.string().max(500)).max(50).default([]),
    approvedMatchingLessons: z.array(Lesson).max(10).default([]),
    validationStatus: z.string().max(100).optional(),
    latestErrorSignature: z.string().max(500).optional(),
    changedFileCount: z.number().int().nonnegative().default(0),
    recentCommandSignatures: z.array(z.string().max(500)).max(25).default([]),
    contextSnapshot: z
      .object({
        repoType: z.string().max(200).optional(),
        agentsMd: z.array(z.string().max(2_000)).max(20).default([]),
        previousPlans: z.array(z.string().max(2_000)).max(20).default([]),
        fileTree: z.array(z.string().max(1_000)).max(500).default([]),
        activeBranch: z.string().max(500).optional(),
        relevantDiffs: z.array(z.string().max(2_000)).max(50).default([])
      })
      .strict()
      .optional(),
    normalizedEvent: NormalizedAgentEvent,
    runState: RunState,
    policy: Policy,
    approvedLessons: z.array(Lesson).max(10).default([]),
    maxPromptLength: z.number().int().positive().max(20_000)
  })
  .strict();
export type PromptOptimizationInput = z.infer<typeof PromptOptimizationInput>;

export const PromptOptimizationResult = z
  .object({
    id: Identifier,
    runId: Identifier,
    eventId: Identifier,
    mode: PromptRewriteMode,
    originalPrompt: z.string().max(8_000).optional(),
    optimizedPrompt: z.string().min(1).max(20_000),
    estimatedOptimizedTokens: z.number().int().nonnegative(),
    resultQuality: z.enum(["unknown", "accepted", "needs_followup", "failed"]).default("unknown"),
    taskContract: TaskContract,
    constraints: z.array(z.string().max(500)).max(50),
    validationRequirements: z.array(z.string().max(500)).max(50),
    relevantLessons: z.array(Lesson).max(10),
    riskNotes: z.array(z.string().max(500)).max(25),
    estimatedTokenDelta: z.number().int(),
    rewriteReason: ShortText,
    shouldInject: z.boolean(),
    injected: z.boolean(),
    deterministicOrModel: z.enum(["deterministic", "model_assisted"]),
    createdAt: IsoDateTime
  })
  .strict();
export type PromptOptimizationResult = z.infer<typeof PromptOptimizationResult>;


export type RawHookPayload = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function nowIso(): string {
  return new Date().toISOString();
}

function tokenizeCommand(command: string): string[] {
  const matches = command.match(/"(?:\\"|[^"])*"|'(?:\\'|[^'])*'|\S+/g) ?? [];
  return matches.map((part) => part.replace(/^['"]|['"]$/g, ""));
}

function basename(executable: string): string {
  return executable.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? executable.toLowerCase();
}

function compactTerm(value: string): string {
  return value.toLowerCase().replace(/['"`]/g, "").replace(/[^a-z0-9_./*-]+/g, " ").trim();
}

function truncateText(value: string, maxLength = 2_000): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

export function classifyCommand(command: string): CommandType {
  const tokens = tokenizeCommand(command);
  const exe = basename(tokens[0] ?? "");
  const normalized = compactTerm(command);

  if (["rg", "grep", "find"].includes(exe)) return "search";
  if (exe === "git") return "git";
  if (["rm", "del", "remove-item"].includes(exe)) return "delete";
  if (["curl", "wget"].includes(exe)) return "network";

  if (/\b(dotnet test|npm test|npm run test|pnpm test|yarn test|pytest|go test|cargo test|mvn test|gradle test|\.\/gradlew test)\b/.test(normalized)) {
    return "test";
  }
  if (/\b(dotnet build|npm run build|pnpm build|yarn build|cargo build|go build|mvn package|mvn compile|gradle build|\.\/gradlew build)\b/.test(normalized)) {
    return "build";
  }
  return "unknown";
}

export function normalizeCommandSignature(command: string): string {
  const tokens = tokenizeCommand(command);
  const type = classifyCommand(command);
  const exe = basename(tokens[0] ?? "unknown");

  if (type === "search") {
    const nonOption = tokens.slice(1).filter((token) => !token.startsWith("-") && token !== "--");
    const pattern = compactTerm(nonOption[0] ?? "").split(/\s+/)[0] ?? "";
    const path = compactTerm(nonOption.find((token, index) => index > 0 && /[/.]/.test(token)) ?? nonOption[1] ?? "")
      .replace(/\/$/, "")
      .split(/\s+/)[0];
    return ["search", pattern, path].filter(Boolean).join(":");
  }

  if (type === "test" || type === "build") {
    const lowered = compactTerm(command);
    const family = lowered.match(/(dotnet|npm|pnpm|yarn|pytest|go|cargo|mvn|gradle|gradlew)/)?.[1] ?? exe;
    return `${type}:${family}`;
  }

  if (type === "git") return `git:${compactTerm(tokens[1] ?? "command").split(/\s+/)[0]}`;
  if (type === "delete") return `delete:${compactTerm(tokens.slice(1).join(" ")).slice(0, 120)}`;
  if (type === "network") return `network:${exe}`;
  return `unknown:${compactTerm(command).slice(0, 120)}`;
}

function inferToolName(raw: Record<string, unknown>): string | undefined {
  const tool = asRecord(raw.tool);
  return firstString(raw.toolName, raw.tool_name, raw.name, tool.name, asRecord(raw.tool_input).toolName);
}

function inferToolInput(raw: Record<string, unknown>): unknown {
  return raw.toolInput ?? raw.tool_input ?? raw.input ?? asRecord(raw.tool).input ?? raw.arguments;
}

function inferCommand(raw: Record<string, unknown>): string | undefined {
  const input = inferToolInput(raw);
  const inputRecord = asRecord(input);
  return firstString(raw.command, inputRecord.command, inputRecord.cmd, inputRecord.script, raw.cmd);
}

function inferPrompt(raw: Record<string, unknown>): string | undefined {
  const message = asRecord(raw.message);
  return firstString(raw.prompt, raw.userPrompt, raw.user_prompt, raw.text, message.content, asRecord(raw.input).prompt);
}

function inferRawOutput(raw: Record<string, unknown>): string | undefined {
  const result = asRecord(raw.result);
  return firstString(raw.output, raw.rawOutput, raw.raw_output, raw.stdout, raw.stderr, result.output, result.stdout, result.stderr);
}

function inferTokenUsage(raw: Record<string, unknown>): TokenUsage | undefined {
  const usage = asRecord(raw.tokenUsage ?? raw.token_usage ?? raw.usage);
  const inputTokens = firstNumber(usage.inputTokens, usage.input_tokens, usage.prompt_tokens, raw.inputTokens, raw.input_tokens);
  const outputTokens = firstNumber(usage.outputTokens, usage.output_tokens, usage.completion_tokens, raw.outputTokens, raw.output_tokens);
  const totalTokens = firstNumber(usage.totalTokens, usage.total_tokens, raw.totalTokens, raw.total_tokens) ?? (inputTokens ?? 0) + (outputTokens ?? 0);

  if (!inputTokens && !outputTokens && !totalTokens) {
    return undefined;
  }

  return TokenUsage.parse({
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    totalTokens
  });
}

function inferCostEstimate(raw: Record<string, unknown>): CostEstimate | undefined {
  const cost = asRecord(raw.costEstimate ?? raw.cost_estimate ?? raw.cost);
  const amountUsd = firstNumber(cost.amountUsd, cost.amount_usd, cost.costUsd, cost.cost_usd, raw.amountUsd, raw.amount_usd, raw.costUsd, raw.cost_usd);

  if (amountUsd === undefined) {
    return undefined;
  }

  const source = firstString(cost.source, raw.costSource, raw.cost_source);
  return CostEstimate.parse({
    amountUsd,
    source: source === "provider" ? "provider" : "estimated"
  });
}

function detectPathsFromText(text: string): string[] {
  const matches = text.match(/(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+|[A-Za-z0-9_.-]+\.[A-Za-z0-9]{1,8}/g) ?? [];
  return Array.from(new Set(matches.filter((path) => !/^https?:/.test(path)).slice(0, 100)));
}

function inferTouchedPaths(raw: Record<string, unknown>, command?: string): string[] {
  const explicit = raw.touchedPaths ?? raw.touched_paths ?? raw.paths ?? raw.files;
  const values = Array.isArray(explicit) ? explicit.filter((v): v is string => typeof v === "string") : [];
  const input = inferToolInput(raw);
  const inputRecord = asRecord(input);
  const inputPaths = [inputRecord.path, inputRecord.file_path, inputRecord.filePath].filter((v): v is string => typeof v === "string");
  const commandPaths = command ? detectPathsFromText(command) : [];
  return Array.from(new Set([...values, ...inputPaths, ...commandPaths])).slice(0, 100);
}

function normalizeHookEventType(rawType: string | undefined, toolName?: string, command?: string): HookEventType {
  const type = (rawType ?? "").toLowerCase();
  const tool = (toolName ?? "").toLowerCase();
  if (type.includes("userpromptsubmit") || type === "prompt" || type.includes("prompt_submit")) return "prompt";
  if (type.includes("precompact") || type.includes("postcompact") || type.includes("compact")) return "compaction";
  if (type.includes("stop") || type.includes("final")) return "final_attempt";
  if (type.includes("posttool") || type.includes("toolresult")) return "tool_result";
  if (type.includes("pretool") || type.includes("toolcall")) return "tool_call";
  if (type.includes("edit") || type.includes("write") || ["edit", "write", "apply_patch"].includes(tool)) return "file_edit";
  if (command && ["test", "build"].includes(classifyCommand(command))) return "validation";
  return command ? "tool_call" : "prompt";
}

function normalizeAnyHook(raw: unknown, agent: AgentKind): NormalizedAgentEvent {
  const body = asRecord(raw);
  const providerEventType = firstString(body.providerEventType, body.eventType, body.event_type, body.hook_event_name, body.type);
  const toolName = inferToolName(body);
  const toolInput = inferToolInput(body);
  const command = inferCommand(body);
  const commandType = command ? classifyCommand(command) : undefined;
  const timestamp = firstString(body.timestamp, body.created_at) ?? nowIso();
  const runId = firstString(body.runId, body.run_id, body.sessionId, body.session_id, body.conversation_id) ?? "unknown-session";
  const prompt = inferPrompt(body);
  const rawOutput = inferRawOutput(body);
  const tokenUsage = inferTokenUsage(body);
  const costEstimate = inferCostEstimate(body);
  const exitCode = firstNumber(body.exitCode, body.exit_code, asRecord(body.result).exitCode, asRecord(body.result).exit_code);
  const paths = inferTouchedPaths(body, command);
  const eventType = normalizeHookEventType(providerEventType, toolName, command);
  const normalizedCommand = command
    ? {
        type: commandType ?? "unknown",
        executable: basename(tokenizeCommand(command)[0] ?? "unknown") || "unknown",
        args: tokenizeCommand(command).slice(1),
        cwd: firstString(body.cwd, body.repoRoot, body.repo_root),
        normalized: normalizeCommandSignature(command),
        riskLevel: commandType === "delete" ? "high" as const : commandType === "network" ? "medium" as const : "low" as const,
        toolKind: commandType === "search" ? "search" as const : commandType === "git" ? "git" as const : commandType === "test" ? "test_runner" as const : commandType === "build" ? "build_runner" as const : "shell" as const
      }
    : undefined;

  const fileOperation = eventType === "file_edit" || ["edit", "write", "apply_patch", "notebookedit", "multiedit"].includes((toolName ?? "").toLowerCase());
  const validation = command && (commandType === "test" || commandType === "build")
    ? {
        command: truncateText(command),
        commandType,
        status: exitCode === undefined ? "unknown" as const : exitCode === 0 ? "passed" as const : "failed" as const,
        summary: rawOutput ? truncateText(rawOutput) : `${commandType} command ${exitCode === 0 ? "passed" : exitCode === undefined ? "ran" : "failed"}`,
        completedAt: timestamp
      }
    : undefined;
  const summary = truncateText(prompt ?? command ?? rawOutput ?? providerEventType ?? "hook event");

  return NormalizedAgentEvent.parse({
    id: firstString(body.id, body.eventId, body.event_id) ?? `${runId}:${timestamp}:${providerEventType ?? "event"}`,
    rawEventId: firstString(body.rawEventId, body.raw_event_id),
    runId,
    agent,
    providerEventType,
    eventType: validation ? "validation" : eventType,
    timestamp,
    actor: eventType === "prompt" ? "user" : "tool",
    summary,
    command: normalizedCommand,
    fileEdit: fileOperation ? { paths, operation: "modify", filesChanged: paths.length || 1, protectedPathMatches: [] } : undefined,
    validation,
    tokenUsage,
    costEstimate,
    compactMetadata: {
      cwd: firstString(body.cwd, body.repoRoot, body.repo_root) ?? null,
      toolName: toolName ?? null,
      toolInput: typeof toolInput === "string" ? toolInput.slice(0, 1_000) : toolInput ? JSON.stringify(toolInput).slice(0, 1_000) : null,
      touchedPaths: paths,
      rawOutput: rawOutput ? truncateText(rawOutput) : null,
      exitCode: exitCode ?? null,
      userPrompt: prompt ? truncateText(prompt) : null,
      command: command ? truncateText(command) : null,
      isValidationCommand: Boolean(validation),
      isPossiblyDestructive: commandType === "delete" || /\b(rm\s+-rf|git\s+push\s+--force|chmod\s+-R\s+777)\b/i.test(command ?? ""),
      isFileRead: ["read", "glob", "ls"].includes((toolName ?? "").toLowerCase()),
      isFileWrite: Boolean(fileOperation),
      isPromptSubmit: eventType === "prompt",
      isCompaction: eventType === "compaction",
      isStop: eventType === "final_attempt"
    }
  });
}

export function normalizeCodexHook(raw: unknown): NormalizedAgentEvent {
  return normalizeAnyHook(raw, "codex");
}

export function normalizeClaudeHook(raw: unknown): NormalizedAgentEvent {
  return normalizeAnyHook(raw, "claude-code");
}

export function normalizeGenericHook(raw: unknown): NormalizedAgentEvent {
  return normalizeAnyHook(raw, "generic");
}

export type RunStateStorage = {
  getLatestRunStateSnapshot(runId: string): { state: RunState } | undefined;
  saveRunStateSnapshot(snapshot: { id: string; runId: string; eventId: string; createdAt: string; state: RunState }): unknown;
};

export class RunStateManager {
  constructor(private readonly storage: RunStateStorage) {}

  loadLatest(runId: string): RunState | undefined {
    return this.storage.getLatestRunStateSnapshot(runId)?.state;
  }

  applyEvent(event: NormalizedAgentEvent): RunState {
    const existing = this.loadLatest(event.runId);
    const state = existing ?? createInitialRunState(event);
    const updated = updateRunState(state, event);
    this.storage.saveRunStateSnapshot({
      id: `${event.id}:state`,
      runId: event.runId,
      eventId: event.id,
      createdAt: event.timestamp,
      state: updated
    });
    return updated;
  }
}

export function createInitialRunState(event: NormalizedAgentEvent): RunState {
  return RunState.parse({
    runId: event.runId,
    status: "active",
    startedAt: event.timestamp,
    updatedAt: event.timestamp,
    agent: event.agent,
    repoRoot: typeof event.compactMetadata.cwd === "string" ? event.compactMetadata.cwd : undefined,
    taskSummary: event.eventType === "prompt" ? event.summary : undefined
  });
}

function pushUnique(values: string[] | undefined, additions: string[]): string[] {
  return Array.from(new Set([...(values ?? []), ...additions])).slice(0, 500);
}

function extractErrors(event: NormalizedAgentEvent): string[] {
  const output = typeof event.compactMetadata.rawOutput === "string" ? event.compactMetadata.rawOutput : event.summary;
  return output.split(/\r?\n/).filter((line) => /error|exception|failed|fatal/i.test(line)).slice(0, 10);
}

export function updateRunState(previous: RunState, event: NormalizedAgentEvent): RunState {
  const eventCounts = { ...(previous.eventCounts ?? {}) };
  eventCounts[event.eventType] = (eventCounts[event.eventType] ?? 0) + 1;
  const state: RunState = RunState.parse({ ...previous, updatedAt: event.timestamp, eventCounts });

  if (event.command) {
    state.recentCommands = [...(state.recentCommands ?? []), event.command].slice(-25);
    state.commandFrequency = { ...(state.commandFrequency ?? {}), [event.command.normalized]: ((state.commandFrequency ?? {})[event.command.normalized] ?? 0) + 1 };
    state.commandSignatures = [...state.commandSignatures, event.command.normalized].slice(-1000);
    state.recentCommandSignatures = [...state.recentCommandSignatures, event.command.normalized].slice(-25);
    state.repeatedCommandCounts = { ...state.repeatedCommandCounts, [event.command.normalized]: (state.repeatedCommandCounts[event.command.normalized] ?? 0) + 1 };
    state.toolCallCount += 1;
    if (event.command.type === "search") {
      const paths = Array.isArray(event.compactMetadata.touchedPaths) ? event.compactMetadata.touchedPaths.filter((v): v is string => typeof v === "string") : [];
      state.filesInspected = pushUnique(state.filesInspected, paths);
    }
    if (event.command.riskLevel !== "low") state.riskEvents = [...state.riskEvents, `${event.command.type}:${event.command.normalized}`].slice(-100);
  }

  const touched = Array.isArray(event.compactMetadata.touchedPaths) ? event.compactMetadata.touchedPaths.filter((v): v is string => typeof v === "string") : [];
  if (event.compactMetadata.isFileRead === true) state.filesRead = pushUnique(state.filesRead, touched);

  if (event.fileEdit) {
    const paths = event.fileEdit.paths.length ? event.fileEdit.paths : touched;
    state.editedFiles = pushUnique(state.editedFiles ?? [], paths);
    state.filesChanged = pushUnique(state.filesChanged, paths);
    state.changedFileCount = state.filesChanged.length || event.fileEdit.filesChanged;
    state.estimatedChangedLines = (state.estimatedChangedLines ?? 0) + (event.fileEdit.linesChanged ?? 0);
    state.validationSinceLastEdit = false;
    state.lastEditAt = event.timestamp;
  } else if (event.command && /\b(>|>>|tee|sed\s+-i|python.+-c|node.+-e|apply_patch|mv|cp)\b/.test(event.summary)) {
    state.riskEvents = [...state.riskEvents, `unknown_file_modification:${event.command.normalized}`].slice(-100);
  }

  if (event.validation) {
    state.lastValidation = event.validation;
    state.lastValidationAt = event.timestamp;
    state.lastValidationPassed = event.validation.status === "passed";
    state.validationCommandCount += 1;
    if (event.validation.status === "passed") state.validationSinceLastEdit = true;
    if (event.validation.status === "failed") {
      state.validationSinceLastEdit = false;
      const errors = extractErrors(event);
      state.latestErrors = errors;
      state.latestErrorSignature = errors[0]?.toLowerCase().replace(/\s+/g, " ").slice(0, 500) ?? `${event.validation.commandType}:failed`;
    }
  }

  if (event.eventType === "compaction") state.compactionPromptCount += 1;
  return RunState.parse(state);
}

export type AgentProvider = AgentKind;
export type RuntimeDecisionAction = InterventionAction;
export type RuntimeDecision = Decision;
