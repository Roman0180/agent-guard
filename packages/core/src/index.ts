import { z } from "zod";

export const AGENT_SIDECAR_DAEMON_DEFAULT_PORT = 4737;

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

export const CommandType = z.enum(["shell", "git", "package_manager", "test", "build", "lint", "format", "other"]);
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
    costEstimate: CostEstimate.default({ amountUsd: 0, source: "estimated" })
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
    optimizedPrompt: z.string().min(1).max(20_000),
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

export type AgentProvider = AgentKind;
export type RuntimeDecisionAction = InterventionAction;
export type RuntimeDecision = Decision;
