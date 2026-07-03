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
        fetch: async (_url: string | URL | Request, init?: RequestInit) => {
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
    expect(JSON.stringify(requestBody)).toContain("Every user prompt needs operational cleanup");
    expect(JSON.stringify(requestBody)).toContain("For long, repetitive, or unfocused prompts, distill and organize");
    expect(JSON.stringify(requestBody)).toContain("target fewer tokens than the original prompt");
    expect(JSON.stringify(requestBody)).toContain("Do not simply restate the prompt");
  });

  it("accepts a shorter local model task contract distilled from an unfocused prompt", async () => {
    const unfocusedPrompt = [
      "Can you look at the login/session thing? People seem to get kicked out after the app sits idle, or maybe requests keep using an old token. I am not sure if this is middleware, session storage, token refresh, cookies, dashboard auth, tests, or some config.",
      "Please just poke around and fix it, but keep it small, do not touch styling or package churn, do not refactor everything, and maybe add a test if there is an obvious place. Also run whatever validation makes sense and do not just rerun failing tests without reading the first error.",
      "For the demo, show the plan first and wait before editing."
    ].join(" ");

    const result = await new PromptOptimizer({
      now: () => now,
      idFactory: () => "opt-local-unfocused",
      localModel: {
        enabled: true,
        model: "deepseek-r1:7b",
        fetch: async () =>
          new Response(JSON.stringify({
            message: {
              content: JSON.stringify({
                shouldInject: true,
                optimizedPrompt: "Task:\nFix idle auth refresh/session behavior with a narrow patch.\n\nLikely areas:\n- session storage\n- token refresh helpers\n- auth middleware/tests\n\nPlan:\n- Locate where stale tokens or idle sessions are handled.\n- Preserve existing dashboard/session behavior.\n- Show the plan before editing.\n\nConstraints:\n- No styling, package churn, or broad refactors.\n\nAcceptance:\n- Users are not logged out or left on stale tokens after refresh.\n\nValidation:\n- Run the narrowest auth test or typecheck command.",
                rewriteReason: "Distilled by local DeepSeek R1.",
                taskContract: {
                  task: "Fix idle auth refresh/session behavior with a narrow patch.",
                  scope: ["session handling", "token refresh helpers", "auth tests"],
                  constraints: ["No unrelated styling or package changes."],
                  acceptance_criteria: ["Auth refresh preserves expected session behavior."],
                  pr_boundaries: ["No speculative refactors."],
                  test_expectations: ["Run focused auth validation."],
                  validation_requirements: ["Run the narrowest auth-related test or typecheck command."],
                  relevant_lessons: [],
                  risk_notes: []
                }
              })
            }
          }))
      }
    }).optimizeWithLocalModel(input({
      originalPrompt: unfocusedPrompt,
      normalizedEvent: { ...input().normalizedEvent, summary: unfocusedPrompt }
    }));

    expect(result).toMatchObject({
      deterministicOrModel: "model_assisted",
      shouldInject: true,
      rewriteReason: "Distilled by local DeepSeek R1."
    });
    expect(result?.optimizedPrompt.length).toBeLessThan(unfocusedPrompt.length);
    expect(result?.optimizedPrompt).toContain("Validation:");
  });

});
