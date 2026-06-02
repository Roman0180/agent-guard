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
    expect(result.taskContract.task).toBe("fix it");
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
  it("injects dashboard troubleshooting prompts as task contracts", () => {
    const result = new PromptOptimizer({ now: () => now, idFactory: () => "opt-6" }).optimize(input({
      originalPrompt: "Login keeps breaking after token refresh. Can you figure it out and fix whatever is wrong?",
      normalizedEvent: { ...input().normalizedEvent, summary: "Login keeps breaking after token refresh. Can you figure it out and fix whatever is wrong?" }
    }));

    expect(result.shouldInject).toBe(true);
    expect(result.rewriteReason).toContain("vague troubleshooting prompt");
    expect(result.optimizedPrompt).toContain("Task:");
  });

  it("uses a local model response without sending a deterministic draft", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const result = await new PromptOptimizer({
      now: () => now,
      idFactory: () => "opt-local",
      localModel: {
        enabled: true,
        model: "deepseek-r1:1.5b",
        fetch: async (_url, init) => {
          requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return new Response(JSON.stringify({
            message: {
              content: JSON.stringify({
                shouldInject: true,
                optimizedPrompt: "Task:\nUse the local model only to expand the coding request into an actionable implementation brief.\n\nLikely areas to inspect:\n- packages/prompt-optimizer/src/index.ts\n- daemon hook ingestion path\n\nImplementation approach:\n- Preserve user intent while adding concrete steps and validation evidence.\n- Reject short restatements that do not add operational detail.\n\nConstraints:\n- Do not use deterministic rewrite output.\n\nValidation:\n- Run optimizer tests.",
                rewriteReason: "Optimized by local DeepSeek R1.",
                taskContract: {
                  task: "Use the local model only.",
                  scope: [],
                  constraints: ["Do not use deterministic rewrite output."],
                  validation_requirements: ["Run tests."],
                  relevant_lessons: [],
                  risk_notes: []
                }
              })
            }
          }));
        }
      }
    }).optimizeWithLocalModel(input());

    expect(result?.deterministicOrModel).toBe("model_assisted");
    expect(result?.optimizedPrompt).toContain("Use the local model only");
    expect(result?.rewriteReason).toBe("Optimized by local DeepSeek R1.");
    expect(JSON.stringify(requestBody)).not.toContain("deterministicDraft");
    expect(JSON.stringify(requestBody)).toContain("Every user prompt is missing operational detail");
    expect(JSON.stringify(requestBody)).toContain("must be substantially more detailed than the original prompt");
    expect(JSON.stringify(requestBody)).toContain("do not simply restate the prompt");
  });

});
