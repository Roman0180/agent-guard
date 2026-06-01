import { describe, expect, it } from "vitest";

import {
  AGENT_SIDECAR_DAEMON_DEFAULT_PORT,
  Decision,
  Lesson,
  NormalizedAgentEvent,
  Policy,
  PromptOptimizationInput,
  PromptOptimizationResult,
  RunState,
  SteeringModelInput,
  TaskContract
} from "./index.js";

const now = "2026-05-31T12:00:00.000Z";

const policy = {
  version: 1,
  failMode: "open",
  protectedPaths: [".env", "secrets/**"],
  dangerousCommands: ["rm -rf /", "git reset --hard"],
  broadChangeThreshold: {
    maxFilesChanged: 10,
    maxLinesChanged: 500
  },
  validation: {
    requireAfterEdit: true,
    acceptedCommands: ["pnpm test", "pnpm typecheck"]
  },
  steering: {
    enabled: false,
    maxCallsPerRun: 0
  }
} as const;

const normalizedEvent = {
  id: "event-1",
  rawEventId: "raw-1",
  runId: "run-1",
  agent: "codex",
  providerEventType: "UserPromptSubmit",
  eventType: "prompt",
  timestamp: now,
  actor: "user",
  summary: "User asked to implement core schemas.",
  compactMetadata: {
    repo: "agent-guard",
    labels: ["schemas", "core"]
  }
} as const;

const runState = {
  runId: "run-1",
  status: "active",
  startedAt: now,
  updatedAt: now,
  agent: "codex",
  repoRoot: "/Users/roman/Desktop/agent-guard",
  branch: "main",
  taskSummary: "Implement shared core schemas.",
  eventCounts: {
    prompt: 1
  },
  recentCommands: [],
  commandFrequency: {},
  editedFiles: [],
  changedFileCount: 0,
  estimatedChangedLines: 0,
  validationSinceLastEdit: false,
  pendingApprovals: [],
  interventions: {},
  tokenUsage: {
    inputTokens: 100,
    outputTokens: 20,
    totalTokens: 120
  },
  costEstimate: {
    amountUsd: 0.01,
    source: "estimated"
  }
} as const;

const lesson = {
  id: "lesson-1",
  trigger: {
    languages: ["typescript"],
    frameworks: [],
    pathGlobs: ["packages/core/**"],
    commandTypes: ["test"],
    failureTypes: ["validation_missing"],
    tags: ["schemas"]
  },
  text: "Validate public boundary payloads with Zod schemas and keep model inputs compact.",
  confidence: 0.9,
  evidence: [
    {
      runId: "run-0",
      eventIds: ["event-0"],
      summary: "A prior schema change missed runtime validation."
    }
  ],
  scope: {
    kind: "repo",
    value: "agent-guard"
  },
  status: "approved",
  createdAt: now,
  updatedAt: now
} as const;

const taskContract = {
  task: "Implement shared core schemas.",
  scope: ["packages/core/src/index.ts", "packages/core/src/index.test.ts"],
  constraints: ["Use Zod for runtime validation.", "Keep steering model inputs compact."],
  validation_requirements: ["Run pnpm test."],
  relevant_lessons: [lesson.text],
  risk_notes: ["Do not include raw conversations in steering inputs."]
} as const;

describe("@agent-sidecar/core schemas", () => {
  it("exports shared constants", () => {
    expect(AGENT_SIDECAR_DAEMON_DEFAULT_PORT).toBe(4737);
  });

  it("validates a NormalizedAgentEvent", () => {
    const parsed = NormalizedAgentEvent.parse(normalizedEvent);

    expect(parsed.eventType).toBe("prompt");
    expect(parsed.compactMetadata.repo).toBe("agent-guard");
  });

  it("rejects an invalid NormalizedAgentEvent", () => {
    const result = NormalizedAgentEvent.safeParse({
      ...normalizedEvent,
      eventType: "raw_conversation",
      rawConversation: "full transcript should not be part of normalized events"
    });

    expect(result.success).toBe(false);
  });

  it("validates a Decision", () => {
    const parsed = Decision.parse({
      id: "decision-1",
      runId: "run-1",
      eventId: "event-1",
      createdAt: now,
      source: "hard_rule",
      action: "require_validation",
      severity: "warning",
      reasonCode: "validation_after_edit.require",
      message: "Run accepted validation before final response.",
      compactMetadata: {
        validationSinceLastEdit: false
      }
    });

    expect(parsed.action).toBe("require_validation");
  });

  it("validates a SteeringModelInput", () => {
    const parsed = SteeringModelInput.parse({
      runId: "run-1",
      eventId: "event-1",
      purpose: "premature_final",
      agent: "codex",
      eventType: "final_attempt",
      taskSummary: "Implement shared core schemas.",
      recentEventSummaries: ["Edited packages/core/src/index.ts."],
      state: {
        validationSinceLastEdit: false
      },
      features: {
        changedFileCount: 2,
        failureHints: ["validation_missing"]
      },
      allowedActions: ["allow", "warn", "require_validation"],
      candidateLessons: [lesson]
    });

    expect(parsed.allowedActions).toContain("require_validation");
    expect(parsed).not.toHaveProperty("rawConversation");
  });

  it("validates a PromptOptimizationInput", () => {
    const parsed = PromptOptimizationInput.parse({
      runId: "run-1",
      eventId: "event-1",
      mode: "initial_task",
      agent: "codex",
      originalPrompt: "Add the core schemas.",
      normalizedEvent,
      runState,
      policy,
      approvedLessons: [lesson],
      maxPromptLength: 4_000
    });

    expect(parsed.mode).toBe("initial_task");
    expect(parsed.approvedLessons).toHaveLength(1);
  });

  it("validates a PromptOptimizationResult", () => {
    const parsed = PromptOptimizationResult.parse({
      id: "optimization-1",
      runId: "run-1",
      eventId: "event-1",
      mode: "initial_task",
      optimizedPrompt: "Task: Implement shared core schemas.\nValidation: Run pnpm test.",
      taskContract,
      constraints: taskContract.constraints,
      validationRequirements: taskContract.validation_requirements,
      relevantLessons: [lesson],
      riskNotes: taskContract.risk_notes,
      estimatedTokenDelta: -20,
      rewriteReason: "Converted vague prompt into a compact task contract.",
      shouldInject: true,
      injected: true,
      deterministicOrModel: "deterministic",
      createdAt: now
    });

    expect(parsed.taskContract.task).toBe(taskContract.task);
  });

  it("validates a TaskContract", () => {
    const parsed = TaskContract.parse(taskContract);

    expect(parsed.validation_requirements).toEqual(["Run pnpm test."]);
  });

  it("validates a Lesson", () => {
    const parsed = Lesson.parse(lesson);

    expect(parsed.status).toBe("approved");
    expect(parsed.text).not.toMatch(/chain[- ]of[- ]thought/i);
  });
});
