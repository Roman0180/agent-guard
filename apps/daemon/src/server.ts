import { randomUUID } from "node:crypto";

import Fastify, { type FastifyInstance } from "fastify";
import {
  Storage,
  type Decision,
  type Feedback,
  type Lesson,
  type NormalizedAgentEvent,
  type PromptOptimizationResult,
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
};

type HookProvider = "codex" | "claude";

type UnknownRecord = Record<string, unknown>;

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const storage = options.storage ?? new Storage({ databasePath: options.databasePath ?? ":memory:" });
  const server = Fastify({
    logger: options.logger ?? true
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

  server.post("/api/events", async (request, reply) => {
    const event = request.body as NormalizedAgentEvent & { rawPayload?: unknown };
    ensureRun(storage, event.runId, event.agent);
    storage.addEvent(event);
    return reply.code(201).send(event);
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

  server.post("/hooks/codex", async (request, reply) => {
    const result = ingestHook(storage, "codex", request.body);
    return reply.code(201).send(result);
  });

  server.post("/hooks/claude", async (request, reply) => {
    const result = ingestHook(storage, "claude", request.body);
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

function ingestHook(storage: Storage, provider: HookProvider, payload: unknown): { action: "allow"; run: StoredRun; event: NormalizedAgentEvent; decision: Decision } {
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
      provider: provider === "codex" ? "codex" : "claude-code",
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

  const event: NormalizedAgentEvent & { rawPayload: unknown } = {
    id: stringValue(body.id) ?? stringValue(body.eventId) ?? randomUUID(),
    rawEventId: stringValue(body.rawEventId),
    runId: run.id,
    agent: provider === "codex" ? "codex" : "claude-code",
    providerEventType: stringValue(body.providerEventType) ?? stringValue(body.eventType) ?? stringValue(body.hook_event_name),
    eventType: normalizeHookEventType(body),
    timestamp: stringValue(body.timestamp) ?? now,
    actor: inferActor(body),
    summary: summarizePayload(body),
    compactMetadata: {
      hookProvider: provider
    },
    rawPayload: payload
  };

  storage.addEvent(event);
  const decision = createAllowDecision(run.id, event.id);
  storage.addDecision(decision);

  return {
    action: "allow",
    run,
    event,
    decision
  };
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

function normalizeHookEventType(body: UnknownRecord): NormalizedAgentEvent["eventType"] {
  const providerEventType = stringValue(body.providerEventType) ?? stringValue(body.eventType) ?? stringValue(body.hook_event_name);

  switch (providerEventType) {
    case "UserPromptSubmit":
      return "prompt";
    case "PreToolUse":
      return "tool_call";
    case "PostToolUse":
      return "tool_result";
    case "Stop":
      return "final_attempt";
    case "PreCompact":
    case "PostCompact":
      return "compaction";
    default:
      return stringValue(body.prompt) || stringValue(body.userPrompt) ? "prompt" : "tool_call";
  }
}

function inferActor(body: UnknownRecord): NormalizedAgentEvent["actor"] {
  const actor = stringValue(body.actor);
  if (actor === "agent" || actor === "user" || actor === "tool" || actor === "system") {
    return actor;
  }

  return stringValue(body.prompt) || stringValue(body.userPrompt) ? "user" : "agent";
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
