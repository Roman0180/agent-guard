import { randomUUID } from "node:crypto";

import Fastify, { type FastifyInstance } from "fastify";
import {
  RunStateManager,
  RunState as CoreRunStateSchema,
  NormalizedAgentEvent as CoreNormalizedAgentEventSchema,
  normalizeClaudeHook,
  normalizeCodexHook,
  normalizeGenericHook
} from "@agent-sidecar/core";
import { PromptOptimizer, type PromptOptimizationInput } from "@agent-sidecar/prompt-optimizer";
import { SteeringEngine, type LocalModelSteeringOptions, type SteeringDecision } from "@agent-sidecar/steering";
import {
  Storage,
  type Decision,
  type Feedback,
  type Lesson,
  type NormalizedAgentEvent,
  type Policy,
  type PromptOptimizationRecord,
  type PromptOptimizationResult,
  type RunState,
  type StoredRun
} from "@agent-sidecar/storage";

export type HealthResponse = {
  status: "ok";
  service: "agent-sidecar-daemon";
};

export type BuildServerOptions = {
  storage?: Storage;
  databasePath?: string;
  logger?: boolean;
  localPromptOptimizer?: {
    enabled?: boolean;
    baseUrl?: string;
    model?: string;
    timeoutMs?: number;
    fetch?: typeof fetch;
  };
  localSteering?: LocalModelSteeringOptions;
};

type HookProvider = "codex" | "claude" | "generic";

type UnknownRecord = Record<string, unknown>;

type HookIngestResult = {
  action: Decision["action"];
  reason: string;
  message: string;
  run: StoredRun;
  event: NormalizedAgentEvent;
  decision: Decision;
  prompt_optimization?: PromptOptimizationResult;
};

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const storage = options.storage ?? new Storage({ databasePath: options.databasePath ?? ":memory:" });
  const server = Fastify({
    logger: options.logger ?? true
  });

  server.addHook("onRequest", async (request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "content-type");

    if (request.method === "OPTIONS") {
      return reply.code(204).send();
    }
  });

  server.addHook("onClose", async () => {
    storage.close();
  });

  server.get("/health", async (): Promise<HealthResponse> => ({
    status: "ok",
    service: "agent-sidecar-daemon"
  }));

  server.post("/api/runs", async (request, reply) => {
    const now = new Date().toISOString();
    const body = asRecord(request.body);
    const run: StoredRun = {
      id: stringValue(body.id) ?? randomUUID(),
      provider: providerValue(body.provider) ?? "generic",
      externalId: stringValue(body.externalId),
      repoRoot: stringValue(body.repoRoot),
      branch: stringValue(body.branch),
      taskSummary: stringValue(body.taskSummary),
      status: statusValue(body.status) ?? "active",
      startedAt: stringValue(body.startedAt) ?? now,
      updatedAt: stringValue(body.updatedAt) ?? now,
      completedAt: stringValue(body.completedAt),
      successStatus: successStatusValue(body.successStatus),
      totalInputTokens: numberValue(body.totalInputTokens),
      totalOutputTokens: numberValue(body.totalOutputTokens),
      totalEstimatedCostUsd: numberValue(body.totalEstimatedCostUsd)
    };

    const existing = storage.getRun(run.id);
    if (existing) {
      return reply.code(200).send(existing);
    }

    storage.createRun(run);
    return reply.code(201).send(run);
  });

  server.get("/api/runs", async () => storage.listRuns());

  server.get<{ Params: { id: string } }>("/api/runs/:id", async (request, reply) => {
    const run = storage.getRun(request.params.id);
    if (!run) {
      return reply.code(404).send({ error: "run_not_found" });
    }

    return run;
  });

  server.get<{ Params: { id: string } }>("/api/runs/:id/events", async (request) =>
    storage.listEventsForRun(request.params.id)
  );

  server.get<{ Params: { id: string } }>("/api/runs/:id/decisions", async (request) =>
    storage.listDecisionsForRun(request.params.id)
  );

  server.get<{ Params: { id: string } }>("/api/runs/:id/prompt-optimizations", async (request) =>
    storage.getPromptOptimizationsForRun(request.params.id)
  );

  server.post<{ Params: { id: string } }>("/api/runs/:id/steering", async (request, reply) => {
    const decision = await evaluateAndStoreSteering(storage, request.params.id, options);
    if (!decision) {
      return reply.code(404).send({ error: "run_not_found" });
    }

    return reply.code(201).send(decision);
  });

  server.get<{ Params: { id: string } }>("/api/runs/:id/demo", async (request, reply) => {
    const run = storage.getRun(request.params.id);
    if (!run) {
      return reply.code(404).send({ error: "run_not_found" });
    }

    return createDemoReplay(
      run,
      storage.listEventsForRun(run.id),
      storage.listDecisionsForRun(run.id),
      storage.getPromptOptimizationRecordsForRun(run.id),
      storage.getLatestRunStateSnapshot(run.id)
    );
  });

  server.get<{ Params: { id: string } }>("/api/dashboard/runs/:id", async (request, reply) => {
    const run = storage.getRun(request.params.id);
    if (!run) {
      return reply.code(404).send({ error: "run_not_found" });
    }

    return createDemoReplay(
      run,
      storage.listEventsForRun(run.id),
      storage.listDecisionsForRun(run.id),
      storage.getPromptOptimizationRecordsForRun(run.id),
      storage.getLatestRunStateSnapshot(run.id)
    );
  });

  server.get<{ Params: { id: string } }>("/api/runs/:id/state", async (request, reply) => {
    const snapshot = storage.getLatestRunStateSnapshot(request.params.id);
    if (!snapshot) {
      return reply.code(404).send({ error: "run_state_not_found" });
    }

    return snapshot;
  });

  server.post("/api/events", async (request, reply) => {
    const event = request.body as NormalizedAgentEvent & { rawPayload?: unknown };
    ensureRun(storage, event.runId, event.agent);
    storage.addEvent(event);
    storage.updateRunFromEvent(event);
    maybeUpdateRunState(storage, event);
    const steering = await maybeAutoSteer(storage, event.runId, options);
    return reply.code(201).send(steering ? { event, steering } : event);
  });

  server.post("/api/decide", async (request, reply) => {
    const body = asRecord(request.body);
    const eventId = stringValue(body.eventId) ?? randomUUID();
    const runId = stringValue(body.runId) ?? randomUUID();
    ensureRun(storage, runId);
    if (storage.listEventsForRun(runId).every((event) => event.id !== eventId)) {
      storage.addEvent({
        id: eventId,
        runId,
        agent: "generic",
        eventType: "tool_call",
        timestamp: new Date().toISOString(),
        actor: "system",
        summary: "Placeholder decision event",
        compactMetadata: {}
      });
    }
    const decision = createAllowDecision(runId, eventId);
    storage.addDecision(decision);
    return reply.code(201).send(decision);
  });

  server.post("/hooks/generic", async (request, reply) => {
    const result = await ingestHook(storage, "generic", request.body, options);
    return reply.code(201).send(result);
  });

  server.post("/hooks/codex", async (request, reply) => {
    const result = await ingestHook(storage, "codex", request.body, options);
    return reply.code(201).send(result);
  });

  server.post("/hooks/claude", async (request, reply) => {
    const result = await ingestHook(storage, "claude", request.body, options);
    return reply.code(201).send(result);
  });

  server.get("/api/lessons", async (request) => {
    const query = asRecord(request.query);
    const status = lessonStatusValue(query.status);
    return storage.listLessons(status);
  });

  server.post<{ Params: { id: string } }>("/api/lessons/:id/approve", async (request, reply) => {
    const lesson = storage.updateLessonStatus(request.params.id, "approved");
    if (!lesson) {
      return reply.code(404).send({ error: "lesson_not_found" });
    }

    return lesson;
  });

  server.post<{ Params: { id: string } }>("/api/lessons/:id/disable", async (request, reply) => {
    const lesson = storage.updateLessonStatus(request.params.id, "disabled");
    if (!lesson) {
      return reply.code(404).send({ error: "lesson_not_found" });
    }

    return lesson;
  });

  server.post("/api/feedback", async (request, reply) => {
    const now = new Date().toISOString();
    const body = asRecord(request.body);
    const feedback: Feedback = {
      id: stringValue(body.id) ?? randomUUID(),
      runId: requiredString(body.runId, "runId"),
      decisionId: stringValue(body.decisionId),
      createdAt: stringValue(body.createdAt) ?? now,
      feedbackType: stringValue(body.feedbackType) ?? "general",
      value: stringValue(body.value) ?? "unknown",
      note: stringValue(body.note)
    };

    storage.addFeedback(feedback);
    return reply.code(201).send(feedback);
  });

  server.post("/api/lessons", async (request, reply) => {
    const lesson = request.body as Lesson;
    storage.createLesson(lesson);
    return reply.code(201).send(lesson);
  });

  server.post("/api/policies", async (request, reply) => {
    const now = new Date().toISOString();
    const body = asRecord(request.body);
    const policy = {
      id: stringValue(body.id) ?? randomUUID(),
      repoRoot: stringValue(body.repoRoot),
      policy: body.policy as never,
      createdAt: stringValue(body.createdAt) ?? now,
      updatedAt: stringValue(body.updatedAt) ?? now
    };
    storage.savePolicy(policy);
    return reply.code(201).send(policy);
  });


  server.post("/api/refine", async (request, reply) => {
    const body = asRecord(request.body);
    const prompt = requiredString(body.prompt, "prompt");
    const now = new Date().toISOString();
    const run = ensureRun(storage, stringValue(body.runId) ?? randomUUID(), providerValue(body.provider) ?? "generic");
    const event: NormalizedAgentEvent = {
      id: stringValue(body.eventId) ?? randomUUID(),
      runId: run.id,
      agent: run.provider,
      providerEventType: "RefinePrompt",
      eventType: "prompt",
      timestamp: now,
      actor: "user",
      summary: truncate(prompt, 240),
      compactMetadata: { source: "cli.refine" }
    };
    storage.addEvent(event);
    storage.updateRunFromEvent(event);
    const runState = maybeUpdateRunState(storage, event) ?? createFallbackRunState(run, event);
    const optimization = await optimizePromptForRun(storage, run, event, prompt, now, runState, options, true);
    storage.savePromptOptimization(optimization, { originalPrompt: prompt });
    return reply.code(201).send({ run, event, optimization });
  });

  server.post("/api/prompt-optimizations", async (request, reply) => {
    const body = asRecord(request.body);
    const optimization = body.optimization as PromptOptimizationResult;
    storage.savePromptOptimization(optimization, {
      originalPrompt: stringValue(body.originalPrompt)
    });
    return reply.code(201).send(optimization);
  });

  return server;
}

async function ingestHook(
  storage: Storage,
  provider: HookProvider,
  payload: unknown,
  options: BuildServerOptions = {}
): Promise<HookIngestResult> {
  const now = new Date().toISOString();
  const body = asRecord(payload);
  const runId =
    stringValue(body.runId) ??
    stringValue(body.run_id) ??
    stringValue(body.runExternalId) ??
    stringValue(body.sessionExternalId) ??
    stringValue(body.session_id) ??
    randomUUID();

  let run = storage.getRun(runId);
  if (!run) {
    run = {
      id: runId,
      provider: provider === "codex" ? "codex" : provider === "claude" ? "claude-code" : "generic",
      externalId: stringValue(body.runExternalId) ?? stringValue(body.sessionExternalId),
      repoRoot: stringValue(body.repoRoot) ?? stringValue(body.cwd),
      branch: stringValue(body.branch),
      taskSummary: summarizePayload(body),
      status: "active",
      startedAt: now,
      updatedAt: now
    };
    storage.createRun(run);
  }

  const normalized = normalizeProviderHook(provider, {
    ...body,
    id: stringValue(body.id) ?? stringValue(body.eventId) ?? randomUUID(),
    runId: run.id,
    timestamp: stringValue(body.timestamp) ?? now
  });
  const event: NormalizedAgentEvent & { rawPayload: unknown } = {
    ...normalized,
    runId: run.id,
    rawEventId: stringValue(body.rawEventId) ?? normalized.rawEventId,
    compactMetadata: {
      ...normalized.compactMetadata,
      hookProvider: provider
    },
    rawPayload: payload
  };

  storage.addEvent(event);
  const updatedRun = storage.updateRunFromEvent(event) ?? run;
  const runStateManager = new RunStateManager({
    getLatestRunStateSnapshot: (runId) => {
      const snapshot = storage.getLatestRunStateSnapshot(runId);
      return snapshot ? { state: CoreRunStateSchema.parse(snapshot.state) } : undefined;
    },
    saveRunStateSnapshot: (snapshot) => storage.saveRunStateSnapshot({
      ...snapshot,
      state: snapshot.state as RunState
    })
  });
  const { rawPayload: _rawPayload, ...eventForState } = event;
  const runState = runStateManager.applyEvent(CoreNormalizedAgentEventSchema.parse(eventForState)) as RunState;
  const promptOptimization = await maybeOptimizePrompt(storage, run, event, body, now, runState, options);
  const steeringDecision = await maybeAutoSteer(storage, run.id, options);
  const decision = promptOptimization
    ? createPromptOptimizationDecision(run.id, event.id, promptOptimization)
    : steeringDecision
      ? createDecisionFromSteering(run.id, event.id, steeringDecision)
      : createAllowDecision(run.id, event.id);
  storage.addDecision(decision);

  return {
    action: decision.action,
    reason: promptOptimization ? "prompt_optimized" : decision.reasonCode,
    message: decision.message,
    run: updatedRun,
    event,
    decision,
    ...(promptOptimization ? { prompt_optimization: promptOptimization } : {}),
    ...(steeringDecision ? { steering: steeringDecision } : {})
  };
}

type DemoReplay = {
  run: StoredRun;
  checkpoints: Array<{ id: string; label: string; status: "complete" | "pending"; summary: string }>;
  events: NormalizedAgentEvent[];
  decisions: Decision[];
  promptOptimizations: PromptOptimizationRecord[];
  state?: RunState;
};

function createDemoReplay(
  run: StoredRun,
  events: NormalizedAgentEvent[],
  decisions: Decision[],
  promptOptimizations: PromptOptimizationRecord[],
  snapshot?: { state: RunState }
): DemoReplay {
  const hasPrompt = events.some((event) => event.eventType === "prompt");
  const hasToolOrValidation = events.some((event) =>
    ["tool_call", "tool_result", "file_edit", "validation"].includes(event.eventType)
  );
  return {
    run,
    checkpoints: [
      {
        id: "hook-setup",
        label: "Hook setup",
        status: events.length > 0 ? "complete" : "pending",
        summary: "Daemon accepted hook JSON and persisted the raw event before processing."
      },
      {
        id: "prompt-ingest",
        label: "Prompt enters Codex",
        status: hasPrompt ? "complete" : "pending",
        summary: "Prompt events are normalized into stable run timeline entries."
      },
      {
        id: "prompt-optimization",
        label: "Prompt optimization",
        status: promptOptimizations.length > 0 ? "complete" : "pending",
        summary: "Vague prompts can be expanded by local DeepSeek attempts or deterministic task-contract fallback."
      },
      {
        id: "run-state",
        label: "Run state",
        status: hasToolOrValidation ? "complete" : "pending",
        summary: "Tool calls, edits, validation, usage, and repeated command signals update run state."
      }
    ],
    events,
    decisions,
    promptOptimizations,
    state: snapshot?.state
  };
}

function normalizeProviderHook(provider: HookProvider, payload: UnknownRecord): NormalizedAgentEvent {
  if (provider === "codex") {
    return normalizeCodexHook(payload);
  }

  if (provider === "claude") {
    return normalizeClaudeHook(payload);
  }

  return normalizeGenericHook(payload);
}

function createAllowDecision(runId: string, eventId: string): Decision {
  return {
    id: randomUUID(),
    runId,
    eventId,
    createdAt: new Date().toISOString(),
    source: "system",
    action: "allow",
    severity: "info",
    reasonCode: "pipeline.default_allow",
    message: "Allowed by default pipeline placeholder.",
    compactMetadata: {}
  };
}

async function maybeOptimizePrompt(
  storage: Storage,
  run: StoredRun,
  event: NormalizedAgentEvent,
  body: UnknownRecord,
  now: string,
  runState: RunState,
  options: BuildServerOptions = {}
): Promise<PromptOptimizationResult | undefined> {
  if (event.eventType !== "prompt") {
    return undefined;
  }

  const originalPrompt = stringValue(body.prompt) ?? stringValue(body.userPrompt) ?? event.summary;
  if (!originalPrompt) {
    return undefined;
  }

  const optimization = await optimizePromptForRun(storage, run, event, originalPrompt, now, runState, options, true, asRecord(body.contextSnapshot));
  if (!optimization.shouldInject) {
    return undefined;
  }

  const injectedOptimization: PromptOptimizationResult = {
    ...optimization,
    injected: true
  };
  storage.saveRunStateSnapshot({
    id: randomUUID(),
    runId: run.id,
    eventId: event.id,
    createdAt: now,
    state: {
      ...runState,
      promptOptimizationCount: (runState.promptOptimizationCount ?? 0) + 1,
      interventions: {
        ...runState.interventions,
        inject_context: (runState.interventions?.inject_context ?? 0) + 1
      }
    }
  });
  storage.savePromptOptimization(injectedOptimization, { originalPrompt });
  return injectedOptimization;
}

async function optimizePromptForRun(
  storage: Storage,
  run: StoredRun,
  event: NormalizedAgentEvent,
  originalPrompt: string,
  now: string,
  runState: RunState,
  options: BuildServerOptions = {},
  preferLocalModel = true,
  contextSnapshot: UnknownRecord = {}
): Promise<PromptOptimizationResult> {
  const policy = storage.getPolicyForRepo(run.repoRoot)?.policy ?? createDefaultPolicy();
  const optimizer = new PromptOptimizer({
    now: () => now,
    localModel: preferLocalModel ? options.localPromptOptimizer : undefined
  });
  const optimizationInput: PromptOptimizationInput = {
    runId: run.id,
    eventId: event.id,
    mode: "initial_task",
    agent: event.agent,
    originalPrompt,
    repoPath: run.repoRoot,
    eventType: event.eventType,
    compactRunState: contextSnapshot,
    policySummary: [],
    approvedMatchingLessons: [],
    validationStatus: runState.lastValidationPassed ? "passed" : undefined,
    latestErrorSignature: runState.latestErrorSignature,
    changedFileCount: runState.changedFileCount ?? 0,
    recentCommandSignatures: runState.recentCommandSignatures ?? [],
    normalizedEvent: event,
    runState,
    policy,
    approvedLessons: storage.listLessons("approved"),
    maxPromptLength: 2_400
  };
  return (await optimizer.optimizeWithLocalModel(optimizationInput).catch(() => undefined)) ?? optimizer.optimize(optimizationInput);
}

function createFallbackRunState(run: StoredRun, event: NormalizedAgentEvent): RunState {
  return {
    runId: run.id,
    status: run.status,
    startedAt: run.startedAt,
    updatedAt: event.timestamp,
    agent: run.provider,
    repoRoot: run.repoRoot,
    branch: run.branch,
    taskSummary: event.summary,
    eventCounts: { prompt: 1 },
    recentCommands: [],
    commandFrequency: {},
    editedFiles: [],
    changedFileCount: 0,
    estimatedChangedLines: 0,
    validationSinceLastEdit: false,
    pendingApprovals: [],
    interventions: {},
    tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    costEstimate: { amountUsd: 0, source: "estimated" },
    filesChanged: [],
    filesRead: [],
    filesInspected: [],
    commandSignatures: [],
    recentCommandSignatures: [],
    repeatedCommandCounts: {},
    latestErrors: [],
    validationCommandCount: 0,
    toolCallCount: 0,
    riskEvents: [],
    injectedLessons: [],
    promptOptimizationCount: 0,
    continuationPromptCount: 0,
    compactionPromptCount: 0
  };
}

function createPromptOptimizationDecision(
  runId: string,
  eventId: string,
  optimization: PromptOptimizationResult
): Decision {
  return {
    id: randomUUID(),
    runId,
    eventId,
    createdAt: new Date().toISOString(),
    source: "system",
    action: "inject_context",
    severity: "info",
    reasonCode: "prompt_optimized",
    message: optimization.optimizedPrompt,
    continuationPrompt: optimization.optimizedPrompt,
    lessonIds: optimization.relevantLessons.map((lesson) => lesson.id),
    compactMetadata: {
      promptOptimizationId: optimization.id,
      rewriteReason: optimization.rewriteReason,
      estimatedTokenDelta: optimization.estimatedTokenDelta,
      deterministicOrModel: optimization.deterministicOrModel
    }
  };
}

function maybeUpdateRunState(storage: Storage, event: NormalizedAgentEvent): RunState | undefined {
  const runStateManager = new RunStateManager({
    getLatestRunStateSnapshot: (runId) => {
      const snapshot = storage.getLatestRunStateSnapshot(runId);
      return snapshot ? { state: CoreRunStateSchema.parse(snapshot.state) } : undefined;
    },
    saveRunStateSnapshot: (snapshot) => storage.saveRunStateSnapshot({
      ...snapshot,
      state: snapshot.state as RunState
    })
  });
  const { rawPayload: _rawPayload, ...eventForState } = event as NormalizedAgentEvent & { rawPayload?: unknown };
  return runStateManager.applyEvent(CoreNormalizedAgentEventSchema.parse(eventForState)) as RunState;
}

async function maybeAutoSteer(
  storage: Storage,
  runId: string,
  options: BuildServerOptions = {}
): Promise<SteeringDecision | undefined> {
  const snapshot = storage.getLatestRunStateSnapshot(runId);
  if (!snapshot) return undefined;
  const latestEvent = storage.listEventsForRun(runId).at(-1);
  if (!latestEvent || !["tool_call", "tool_result", "file_edit", "validation", "final_attempt"].includes(latestEvent.eventType)) {
    return undefined;
  }
  const decision = await evaluateSteering(storage, runId, options);
  return decision?.action === "continue" ? undefined : decision;
}

async function evaluateAndStoreSteering(
  storage: Storage,
  runId: string,
  options: BuildServerOptions = {}
): Promise<SteeringDecision | undefined> {
  const decision = await evaluateSteering(storage, runId, options);
  const latestEvent = storage.listEventsForRun(runId).at(-1);
  if (decision && latestEvent && decision.action !== "continue") {
    storage.addDecision(createDecisionFromSteering(runId, latestEvent.id, decision));
  }
  return decision;
}

async function evaluateSteering(
  storage: Storage,
  runId: string,
  options: BuildServerOptions = {}
): Promise<SteeringDecision | undefined> {
  const run = storage.getRun(runId);
  if (!run) return undefined;
  const events = storage.listEventsForRun(runId);
  const snapshot = storage.getLatestRunStateSnapshot(runId);
  return new SteeringEngine({ localModel: options.localSteering }).evaluateWithLocalModel(runId, { runState: snapshot?.state, events });
}

function createDecisionFromSteering(runId: string, eventId: string, steering: SteeringDecision): Decision {
  return {
    id: randomUUID(),
    runId,
    eventId,
    createdAt: steering.createdAt,
    source: "steering_ensemble",
    action: steering.action === "warn" ? "warn" : "allow",
    severity: steering.action === "warn" ? "warning" : "info",
    reasonCode: steering.reasonCode,
    message: steering.recommendedNextStep,
    steeringDecisionId: steering.id,
    compactMetadata: {
      confidence: steering.confidence,
      source: steering.source,
      findings: steering.findings.map((finding) => finding.detectorId ?? finding.reasonCode).filter(Boolean),
      estimatedAvoidedWaste: steering.estimatedAvoidedWaste
    }
  };
}

function createDefaultPolicy(): Policy {
  return {
    version: 1,
    failMode: "open",
    protectedPaths: [],
    dangerousCommands: [],
    broadChangeThreshold: {
      maxFilesChanged: 25,
      maxLinesChanged: 1_000
    },
    validation: {
      requireAfterEdit: true,
      acceptedCommands: ["pnpm test", "pnpm typecheck", "pnpm build"]
    },
    steering: {
      enabled: false,
      providers: [],
      maxCallsPerRun: 0,
      maxCostUsdPerRun: 0
    }
  };
}

function ensureRun(storage: Storage, runId: string, provider: StoredRun["provider"] = "generic"): StoredRun {
  const existing = storage.getRun(runId);
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const run: StoredRun = {
    id: runId,
    provider,
    status: "active",
    startedAt: now,
    updatedAt: now
  };
  storage.createRun(run);
  return run;
}

function summarizePayload(body: UnknownRecord): string {
  const prompt = stringValue(body.prompt) ?? stringValue(body.userPrompt);
  if (prompt) {
    return truncate(prompt, 240);
  }

  const command = stringValue(body.command);
  if (command) {
    return `Command: ${truncate(command, 220)}`;
  }

  const providerEventType = stringValue(body.providerEventType) ?? stringValue(body.eventType) ?? stringValue(body.hook_event_name);
  return providerEventType ? `Received ${providerEventType}` : "Received hook event";
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function providerValue(value: unknown): StoredRun["provider"] | undefined {
  return value === "codex" || value === "claude-code" || value === "generic" ? value : undefined;
}

function statusValue(value: unknown): StoredRun["status"] | undefined {
  return value === "active" || value === "blocked" || value === "completed" || value === "failed" ? value : undefined;
}

function successStatusValue(value: unknown): StoredRun["successStatus"] | undefined {
  return value === "success" || value === "failure" || value === "unknown" ? value : undefined;
}

function lessonStatusValue(value: unknown): Lesson["status"] | undefined {
  return value === "candidate" || value === "approved" || value === "disabled" || value === "expired" ? value : undefined;
}

function requiredString(value: unknown, field: string): string {
  const parsed = stringValue(value);
  if (!parsed) {
    throw new Error(`${field} is required`);
  }

  return parsed;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}
