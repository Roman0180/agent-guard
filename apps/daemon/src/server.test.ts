import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildServer } from "./server.js";

let tempDirs: string[] = [];

async function createTempDatabasePath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "agent-sidecar-daemon-"));
  tempDirs.push(dir);
  return join(dir, "daemon.sqlite");
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("@agent-sidecar/daemon", () => {
  const localPromptOptimizer = {
    enabled: true,
    model: "deepseek-r1:1.5b",
    fetch: async () =>
      new Response(JSON.stringify({
        message: {
          content: JSON.stringify({
            shouldInject: true,
            optimizedPrompt: "Task:\nFix the logger issue without broad refactors.\n\nLikely areas to inspect:\n- daemon logger setup\n- failing tests around logger output\n\nImplementation approach:\n- inspect the failing stack trace before editing\n- make the smallest focused logger change\n\nConstraints:\n- keep scope narrow\n\nValidation:\nRun focused validation.",
            rewriteReason: "Optimized by local DeepSeek R1.",
            taskContract: {
              task: "Fix the logger issue",
              scope: [],
              constraints: ["Keep scope narrow."],
              validation_requirements: ["Run focused validation."],
              relevant_lessons: [],
              risk_notes: []
            }
          })
        }
      }))
  };

  it("responds to health checks", async () => {
    const server = buildServer({ logger: false });

    const response = await server.inject({
      method: "GET",
      url: "/health"
    });

    await server.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      service: "agent-sidecar-daemon"
    });
  });

  it("stores a Codex hook event and exposes the created run", async () => {
    const databasePath = await createTempDatabasePath();
    const server = buildServer({ databasePath, logger: false, localPromptOptimizer });

    const hookResponse = await server.inject({
      method: "POST",
      url: "/hooks/codex",
      payload: {
        id: "hook-event-1",
        runId: "run-1",
        providerEventType: "UserPromptSubmit",
        prompt: "Implement the daemon routes.",
        repoRoot: "/repo",
        branch: "main"
      }
    });

    const runsResponse = await server.inject({
      method: "GET",
      url: "/api/runs"
    });

    const eventsResponse = await server.inject({
      method: "GET",
      url: "/api/runs/run-1/events"
    });

    const decisionsResponse = await server.inject({
      method: "GET",
      url: "/api/runs/run-1/decisions"
    });

    await server.close();

    expect(hookResponse.statusCode).toBe(201);
    expect(hookResponse.json()).toMatchObject({
      action: "inject_context",
      run: {
        id: "run-1",
        provider: "codex"
      },
      event: {
        id: "hook-event-1",
        eventType: "prompt",
        summary: "Prompt submitted"
      },
      decision: {
        action: "inject_context",
        reasonCode: "prompt_optimized"
      }
    });

    expect(runsResponse.statusCode).toBe(200);
    expect(runsResponse.json()).toEqual([
      expect.objectContaining({
        id: "run-1",
        provider: "codex",
        repoRoot: "/repo",
        branch: "main"
      })
    ]);

    expect(eventsResponse.json()).toHaveLength(1);
    expect(eventsResponse.json()[0]).toMatchObject({
      id: "hook-event-1",
      rawPayload: {
        promptHash: expect.any(String)
      }
    });
    expect(eventsResponse.json()[0].rawPayload.prompt).toBeUndefined();

    expect(decisionsResponse.json()).toHaveLength(1);
    expect(decisionsResponse.json()[0]).toMatchObject({
      action: "inject_context",
      reasonCode: "prompt_optimized"
    });
  });

  it("returns an existing run when creating a duplicate run id", async () => {
    const databasePath = await createTempDatabasePath();
    const server = buildServer({ databasePath, logger: false, localPromptOptimizer });

    const payload = {
      id: "demo-session-001",
      provider: "codex",
      repoRoot: "/repo",
      status: "active"
    };
    const firstResponse = await server.inject({ method: "POST", url: "/api/runs", payload });
    const secondResponse = await server.inject({ method: "POST", url: "/api/runs", payload });

    await server.close();

    expect(firstResponse.statusCode).toBe(201);
    expect(secondResponse.statusCode).toBe(200);
    expect(secondResponse.json()).toMatchObject({
      id: "demo-session-001",
      provider: "codex",
      status: "active",
      repoRoot: "/repo"
    });
  });

  it("rolls hook token usage and cost into dashboard run details", async () => {
    const databasePath = await createTempDatabasePath();
    const server = buildServer({ databasePath, logger: false });

    await server.inject({
      method: "POST",
      url: "/hooks/codex",
      payload: {
        id: "usage-prompt",
        runId: "usage-run-1",
        providerEventType: "UserPromptSubmit",
        prompt: "Add billing telemetry",
        tokenUsage: { inputTokens: 1200, outputTokens: 140, totalTokens: 1340 },
        costEstimate: { amountUsd: 0.043, source: "provider" },
        codexBaseline: {
          inputTokens: 2000,
          outputTokens: 300,
          estimatedCostUsd: 0.09,
          modelRoute: "gpt-5-codex"
        }
      }
    });

    await server.inject({
      method: "POST",
      url: "/hooks/generic",
      payload: {
        id: "usage-tool",
        runId: "usage-run-1",
        providerEventType: "PreToolUse",
        toolName: "Bash",
        toolInput: { command: "pnpm test" },
        usage: { input_tokens: 80, output_tokens: 20 },
        cost: { amount_usd: 0.006, source: "estimated" }
      }
    });

    const runsResponse = await server.inject({
      method: "GET",
      url: "/api/runs"
    });
    const dashboardResponse = await server.inject({
      method: "GET",
      url: "/api/dashboard/runs/usage-run-1"
    });

    await server.close();

    expect(runsResponse.statusCode).toBe(200);
    expect(runsResponse.json()[0]).toMatchObject({
      id: "usage-run-1",
      provider: "codex",
      taskSummary: "Prompt submitted",
      totalInputTokens: 1280,
      totalOutputTokens: 160
    });
    expect(runsResponse.json()[0].totalEstimatedCostUsd).toBeCloseTo(0.049);
    expect(dashboardResponse.statusCode).toBe(200);
    expect(dashboardResponse.json()).toMatchObject({
      run: {
        id: "usage-run-1",
        totalInputTokens: 1280,
        totalOutputTokens: 160
      },
      events: [
        {
          id: "usage-prompt",
          tokenUsage: { inputTokens: 1200, outputTokens: 140, totalTokens: 1340 },
          costEstimate: { amountUsd: 0.043, source: "provider" }
        },
        {
          id: "usage-tool",
          tokenUsage: { inputTokens: 80, outputTokens: 20, totalTokens: 100 },
          costEstimate: { amountUsd: 0.006, source: "estimated" }
        }
      ],
      costEvidence: {
        runId: "usage-run-1",
        baselineInputTokens: 2000,
        baselineOutputTokens: 300,
        baselineEstimatedCostUsd: 0.09,
        actualInputTokens: 1280,
        actualOutputTokens: 160,
        actualCostUsd: 0.049,
        modelRoute: "gpt-5-codex",
        taskType: "prompt_refinement",
        savingsMode: "codex_baseline",
        confidence: 0.95
      }
    });
    expect(dashboardResponse.json().run.totalEstimatedCostUsd).toBeCloseTo(0.049);
  });

  it("returns injected prompt optimization context for the demo Codex prompt", async () => {
    const databasePath = await createTempDatabasePath();
    const server = buildServer({ databasePath, logger: false, localPromptOptimizer });

    const hookResponse = await server.inject({
      method: "POST",
      url: "/hooks/codex",
      payload: {
        session_id: "demo-run-2",
        hook_event_name: "UserPromptSubmit",
        cwd: ".",
        prompt: "Fix the logger issue"
      }
    });

    const optimizationsResponse = await server.inject({
      method: "GET",
      url: "/api/runs/demo-run-2/prompt-optimizations"
    });

    const demoResponse = await server.inject({
      method: "GET",
      url: "/api/runs/demo-run-2/demo"
    });

    await server.close();

    expect(hookResponse.statusCode).toBe(201);
    expect(hookResponse.json()).toMatchObject({
      action: "inject_context",
      reason: "prompt_optimized",
      message: "Prompt optimized; use the immediate hook response for generated prompt text.",
      run: {
        id: "demo-run-2",
        provider: "codex",
        repoRoot: "."
      },
      event: {
        eventType: "prompt",
        providerEventType: "UserPromptSubmit",
        summary: "Prompt submitted"
      },
      decision: {
        action: "inject_context",
        reasonCode: "prompt_optimized"
      },
      prompt_optimization: {
        mode: "initial_task",
        taskContract: {
          task: "Fix the logger issue"
        },
        rewriteReason: "Optimized by local DeepSeek R1.",
        optimizedPrompt: expect.stringContaining("Task:\nFix the logger issue"),
        shouldInject: true,
        injected: true,
        deterministicOrModel: "model_assisted"
      }
    });

    expect(optimizationsResponse.statusCode).toBe(200);
    expect(optimizationsResponse.json()).toEqual([
      expect.objectContaining({
        runId: "demo-run-2",
        mode: "initial_task",
        optimizedPrompt: "[prompt text redacted]"
      })
    ]);
    expect(optimizationsResponse.json()[0].originalPrompt).toBeUndefined();
    expect(demoResponse.statusCode).toBe(200);
    expect(demoResponse.json()).toMatchObject({
      run: { id: "demo-run-2" },
      checkpoints: [
        { id: "hook-setup", status: "complete" },
        { id: "prompt-ingest", status: "complete" },
        { id: "prompt-optimization", status: "complete" },
        { id: "run-state" }
      ],
      promptOptimizations: [
        {
          result: {
            mode: "initial_task",
            optimizedPrompt: "[prompt text redacted]"
          }
        }
      ]
    });
    expect(demoResponse.json().promptOptimizations[0].originalPrompt).toBeUndefined();
  });

  it("accepts long Codex prompt hooks while storing bounded event fields", async () => {
    const databasePath = await createTempDatabasePath();
    const server = buildServer({ databasePath, logger: false, localPromptOptimizer });
    const prompt = "Fix idle auth refresh without broad refactors. ".repeat(90);

    const hookResponse = await server.inject({
      method: "POST",
      url: "/hooks/codex",
      payload: {
        id: "long-prompt-hook",
        runId: "long-prompt-run",
        providerEventType: "UserPromptSubmit",
        prompt
      }
    });

    const eventsResponse = await server.inject({
      method: "GET",
      url: "/api/runs/long-prompt-run/events"
    });

    await server.close();

    expect(prompt.length).toBeGreaterThan(2_000);
    expect(hookResponse.statusCode).toBe(201);
    expect(hookResponse.json()).toMatchObject({
      action: "inject_context",
      prompt_optimization: {
        deterministicOrModel: "model_assisted"
      }
    });
    expect(eventsResponse.statusCode).toBe(200);
    expect(eventsResponse.json()[0].summary).toBe("Prompt submitted");
    expect(eventsResponse.json()[0].rawPayload.promptHash).toEqual(expect.any(String));
    expect(eventsResponse.json()[0].rawPayload.prompt).toBeUndefined();
  });

  it("ingests generic hooks and updates run state across prompt, tool, edit, and validation events", async () => {
    const databasePath = await createTempDatabasePath();
    const server = buildServer({ databasePath, logger: false });

    await server.inject({
      method: "POST",
      url: "/hooks/generic",
      payload: {
        id: "generic-prompt",
        runId: "generic-run-1",
        providerEventType: "UserPromptSubmit",
        cwd: "/repo",
        prompt: "Fix login refresh"
      }
    });

    await server.inject({
      method: "POST",
      url: "/hooks/generic",
      payload: {
        id: "generic-search",
        runId: "generic-run-1",
        providerEventType: "PreToolUse",
        cwd: "/repo",
        toolName: "Bash",
        toolInput: { command: "rg refreshSession src/auth" }
      }
    });

    await server.inject({
      method: "POST",
      url: "/hooks/generic",
      payload: {
        id: "generic-edit",
        runId: "generic-run-1",
        providerEventType: "FileEdit",
        cwd: "/repo",
        toolName: "Edit",
        touchedPaths: ["src/auth/session.ts"]
      }
    });

    await server.inject({
      method: "POST",
      url: "/hooks/generic",
      payload: {
        id: "generic-test",
        runId: "generic-run-1",
        providerEventType: "PostToolUse",
        cwd: "/repo",
        toolName: "Bash",
        toolInput: { command: "pnpm test" },
        result: { exitCode: 0, stdout: "ok" }
      }
    });

    const eventsResponse = await server.inject({
      method: "GET",
      url: "/api/runs/generic-run-1/events"
    });
    const stateResponse = await server.inject({
      method: "GET",
      url: "/api/runs/generic-run-1/state"
    });

    await server.close();

    expect(eventsResponse.statusCode).toBe(200);
    expect(eventsResponse.json().map((event: { eventType: string }) => event.eventType)).toEqual([
      "prompt",
      "tool_call",
      "file_edit",
      "validation"
    ]);
    expect(stateResponse.statusCode).toBe(200);
    expect(stateResponse.json().state).toMatchObject({
      runId: "generic-run-1",
      eventCounts: {
        prompt: 1,
        tool_call: 1,
        file_edit: 1,
        validation: 1
      },
      filesChanged: ["src/auth/session.ts"],
      validationSinceLastEdit: true,
      validationCommandCount: 1
    });
  });

  it("supports deterministic prompt refinement through the API", async () => {
    const databasePath = await createTempDatabasePath();
    const server = buildServer({ databasePath, logger: false });

    const refineResponse = await server.inject({
      method: "POST",
      url: "/api/refine",
      payload: { runId: "refine-run-1", prompt: "make the app better" }
    });
    const optimizationsResponse = await server.inject({ method: "GET", url: "/api/runs/refine-run-1/prompt-optimizations" });

    await server.close();

    expect(refineResponse.statusCode).toBe(201);
    expect(refineResponse.json()).toMatchObject({
      run: { id: "refine-run-1" },
      optimization: { deterministicOrModel: "deterministic", originalPrompt: "make the app better" }
    });
    expect(refineResponse.json().optimization.optimizedPrompt).toContain("Task:");
    expect(optimizationsResponse.json()[0]).toMatchObject({
      runId: "refine-run-1",
      deterministicOrModel: "deterministic",
      optimizedPrompt: "[prompt text redacted]"
    });
  });

  it("tries the local DeepSeek optimizer for API prompt refinement when configured", async () => {
    const databasePath = await createTempDatabasePath();
    const server = buildServer({ databasePath, logger: false, localPromptOptimizer });

    const refineResponse = await server.inject({
      method: "POST",
      url: "/api/refine",
      payload: { runId: "refine-run-local", prompt: "make the app better" }
    });
    const optimizationsResponse = await server.inject({ method: "GET", url: "/api/runs/refine-run-local/prompt-optimizations" });

    await server.close();

    expect(refineResponse.statusCode).toBe(201);
    expect(refineResponse.json()).toMatchObject({
      run: { id: "refine-run-local" },
      optimization: {
        deterministicOrModel: "model_assisted",
        rewriteReason: "Optimized by local DeepSeek R1."
      }
    });
    expect(optimizationsResponse.json()[0]).toMatchObject({ runId: "refine-run-local", deterministicOrModel: "model_assisted" });
  });

  it("returns and records steering recommendations for repeated commands", async () => {
    const databasePath = await createTempDatabasePath();
    const server = buildServer({ databasePath, logger: false });

    await server.inject({ method: "POST", url: "/api/runs", payload: { id: "steer-run-1", provider: "generic", status: "active" } });
    for (const id of ["cmd-1", "cmd-2", "cmd-3"]) {
      await server.inject({
        method: "POST",
        url: "/api/events",
        payload: {
          id,
          runId: "steer-run-1",
          agent: "generic",
          eventType: "tool_call",
          timestamp: "2026-06-12T00:00:00.000Z",
          actor: "user",
          summary: "pnpm test",
          command: { type: "test", executable: "pnpm", args: ["test"], normalized: "pnpm test", riskLevel: "low", toolKind: "test_runner" },
          compactMetadata: {}
        }
      });
    }

    const steeringResponse = await server.inject({ method: "POST", url: "/api/runs/steer-run-1/steering", payload: {} });
    const decisionsResponse = await server.inject({ method: "GET", url: "/api/runs/steer-run-1/decisions" });

    await server.close();

    expect(steeringResponse.statusCode).toBe(201);
    expect(steeringResponse.json()).toMatchObject({ action: "warn", reasonCode: "loop.repeated_command" });
    expect(decisionsResponse.json()).toEqual(expect.arrayContaining([expect.objectContaining({ source: "steering_ensemble", reasonCode: "loop.repeated_command" })]));
  });


});
