import { describe, expect, it } from "vitest";

import { PromptOptimizer } from "./index.js";
import type { Lesson, PromptOptimizationInput } from "./index.js";

const now = "2026-05-31T12:00:00.000Z";

const approvedLesson: Lesson = {
  id: "lesson-1",
  trigger: { languages: ["typescript"], frameworks: [], pathGlobs: ["src/"], commandTypes: [], failureTypes: [], tags: ["validation"] },
  text: "Run focused validation after editing TypeScript files.",
  confidence: 0.9,
  evidence: [],
  scope: { kind: "repo", value: "agent-guard" },
  status: "approved",
  createdAt: now,
  updatedAt: now
};

const disabledLesson: Lesson = { ...approvedLesson, id: "lesson-2", status: "disabled", text: "Disabled lesson must not appear." };

function input(overrides: Partial<PromptOptimizationInput> = {}): PromptOptimizationInput {
  return {
    runId: "run-1",
    eventId: "event-1",
    mode: "initial_task",
    agent: "codex",
    originalPrompt: "fix it",
    repoPath: "/repo",
    eventType: "prompt",
    compactRunState: { validation: "missing" },
    policySummary: ["require validation"],
    approvedMatchingLessons: [approvedLesson, disabledLesson],
    validationStatus: "missing",
    latestErrorSignature: undefined,
    changedFileCount: 1,
    recentCommandSignatures: ["search:validation:src"],
    contextSnapshot: {
      repoType: "nextjs-typescript",
      agentsMd: ["Run pnpm test before final response."],
      previousPlans: ["Keep auth changes narrow."],
      fileTree: ["src/index.ts", "tests/index.test.ts"],
      activeBranch: "feature/sidecar",
      relevantDiffs: ["src/index.ts has local edits"]
    },
    normalizedEvent: {
      id: "event-1",
      runId: "run-1",
      agent: "codex",
      providerEventType: "UserPromptSubmit",
      eventType: "prompt",
      timestamp: now,
      actor: "user",
      summary: "fix it",
      compactMetadata: {}
    },
    runState: {
      runId: "run-1",
      status: "active",
      startedAt: now,
      updatedAt: now,
      agent: "codex",
      eventCounts: {},
      recentCommands: [],
      commandFrequency: {},
      editedFiles: [],
      changedFileCount: 1,
      estimatedChangedLines: 0,
      validationSinceLastEdit: false,
      pendingApprovals: [],
      interventions: {},
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      costEstimate: { amountUsd: 0, source: "estimated" },
      filesChanged: ["src/index.ts"],
      filesRead: [],
      filesInspected: ["src/index.ts"],
      commandSignatures: [],
      recentCommandSignatures: ["search:validation:src"],
      repeatedCommandCounts: {},
      latestErrors: [],
      validationCommandCount: 0,
      toolCallCount: 0,
      riskEvents: [],
      injectedLessons: [],
      promptOptimizationCount: 0,
      continuationPromptCount: 0,
      compactionPromptCount: 0
    },
    policy: {
      version: 1,
      failMode: "open",
      protectedPaths: ["**/.env*"],
      dangerousCommands: [],
      broadChangeThreshold: { maxFilesChanged: 10, maxLinesChanged: 500 },
      validation: { requireAfterEdit: true, acceptedCommands: ["pnpm test"] },
      steering: { enabled: false, maxCallsPerRun: 0 }
    },
    approvedLessons: [approvedLesson, disabledLesson],
    maxPromptLength: 2_000,
    ...overrides
  };
}

describe("PromptOptimizer", () => {
  it("turns a vague prompt into a structured task contract", () => {
    const result = new PromptOptimizer({ now: () => now, idFactory: () => "opt-1" }).optimize(input());

    expect(result.optimizedPrompt).toContain("Task:");
    expect(result.optimizedPrompt).toContain("Scope:");
    expect(result.optimizedPrompt).toContain("Acceptance criteria:");
    expect(result.optimizedPrompt).toContain("PR boundaries:");
    expect(result.optimizedPrompt).toContain("Test expectations:");
    expect(result.optimizedPrompt).toContain("AGENTS.md");
    expect(result.taskContract.task).toBe("fix it");
    expect(result.resultQuality).toBe("unknown");
    expect(result.estimatedOptimizedTokens).toBeGreaterThan(0);
    expect(result.shouldInject).toBe(true);
  });

  it("creates a short continuation prompt for validation-missing Stop events", () => {
    const result = new PromptOptimizer({ now: () => now, idFactory: () => "opt-2" }).optimize(input({ mode: "continuation", eventType: "final_attempt" }));

    expect(result.optimizedPrompt).toContain("Do not finalize yet");
    expect(result.optimizedPrompt.length).toBeLessThan(600);
  });

  it("injects only relevant approved lessons", () => {
    const result = new PromptOptimizer({ now: () => now, idFactory: () => "opt-3" }).optimize(input({ mode: "lesson_injection" }));

    expect(result.relevantLessons.map((lesson) => lesson.id)).toEqual(["lesson-1"]);
    expect(result.optimizedPrompt).not.toContain("Disabled lesson");
  });

  it("stays under configurable max length", () => {
    const result = new PromptOptimizer({ now: () => now, idFactory: () => "opt-4", maxPromptLength: 160 }).optimize(input({ maxPromptLength: 160 }));

    expect(result.optimizedPrompt.length).toBeLessThanOrEqual(160);
  });

  it("does not include raw traces", () => {
    const result = new PromptOptimizer({ now: () => now, idFactory: () => "opt-5" }).optimize(input({
      normalizedEvent: { ...input().normalizedEvent, compactMetadata: { rawOutput: "RAW TRACE SHOULD STAY OUT" } }
    }));

    expect(result.optimizedPrompt).not.toContain("RAW TRACE SHOULD STAY OUT");
    expect(result.deterministicOrModel).toBe("deterministic");
  });
});
