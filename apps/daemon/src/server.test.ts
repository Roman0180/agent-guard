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
            optimizedPrompt: "Task:\nFix the logger issue\n\nValidation:\nRun focused validation.",
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
      action: "allow",
      run: {
        id: "run-1",
        provider: "codex"
      },
      event: {
        id: "hook-event-1",
        eventType: "prompt",
        summary: "Implement the daemon routes."
      },
      decision: {
        action: "allow",
        reasonCode: "pipeline.default_allow"
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
        prompt: "Implement the daemon routes."
      }
    });

    expect(decisionsResponse.json()).toHaveLength(1);
    expect(decisionsResponse.json()[0]).toMatchObject({
      action: "allow",
      reasonCode: "pipeline.default_allow"
    });
  });

  it("rolls hook token usage and cost into dashboard run details", async () => {
    const databasePath = await createTempDatabasePath();
    const server = buildServer({ databasePath, logger: false });

    await server.inject({
      method: "POST",
      url: "/hooks/generic",
      payload: {
        id: "usage-prompt",
        runId: "usage-run-1",
        providerEventType: "UserPromptSubmit",
        prompt: "Add billing telemetry",
        tokenUsage: { inputTokens: 1200, outputTokens: 140, totalTokens: 1340 },
        costEstimate: { amountUsd: 0.043, source: "provider" }
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
      provider: "generic",
      taskSummary: "Add billing telemetry",
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
      ]
    });
    expect(dashboardResponse.json().run.totalEstimatedCostUsd).toBeCloseTo(0.049);
  });

  it("records provider hook events while trajectory endpoint handles interventions", async () => {
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
      action: "allow",
      reason: "pipeline.default_allow",
      run: {
        id: "demo-run-2",
        provider: "codex",
        repoRoot: "."
      },
      event: {
        eventType: "prompt",
        providerEventType: "UserPromptSubmit",
        summary: "Fix the logger issue"
      },
      decision: {
        action: "allow",
        reasonCode: "pipeline.default_allow"
      }
    });

    expect(optimizationsResponse.statusCode).toBe(200);
    expect(optimizationsResponse.json()).toEqual([]);
    expect(demoResponse.statusCode).toBe(200);
    expect(demoResponse.json()).toMatchObject({
      run: { id: "demo-run-2" },
      checkpoints: [
        { id: "hook-setup", status: "complete" },
        { id: "prompt-ingest", status: "complete" },
        { id: "prompt-optimization", status: "pending" },
        { id: "run-state" }
      ],
      promptOptimizations: []
    });
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

  it("accepts sanitized trajectory slices and returns loop interventions", async () => {
    const server = buildServer({ logger: false });
    const payload = {
      schemaVersion: 1,
      sessionId: "migration-demo",
      stepId: "step-1",
      timestamp: "2026-06-02T12:00:00.000Z",
      agentName: "demo-coding-agent",
      provider: "openai",
      model: "gpt-5.5",
      stepType: "tool_call",
      toolName: "run_command",
      toolArguments: { command: "pnpm test -- migration" },
      toolOutput: "Error: migration registry missing",
      errorMessage: "Error: migration registry missing",
      tokenCounts: { inputTokens: 900, outputTokens: 100, totalTokens: 1000 },
      filesTouched: [],
      tags: ["migration"],
      metadata: {}
    };

    await server.inject({ method: "POST", url: "/api/trajectory-slices", payload });
    await server.inject({ method: "POST", url: "/api/trajectory-slices", payload: { ...payload, stepId: "step-2" } });
    const response = await server.inject({
      method: "POST",
      url: "/api/trajectory-slices",
      payload: { ...payload, stepId: "step-3" }
    });

    await server.close();

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      accepted: true,
      sanitized: true,
      intervention: {
        severity: "warning",
        category: "loop",
        message: "Repeated failed tool call detected.",
        should_block: false
      }
    });
  });

  it("rejects trajectory slices that try to include unsupported raw fields", async () => {
    const server = buildServer({ logger: false });

    const response = await server.inject({
      method: "POST",
      url: "/api/trajectory-slices",
      payload: {
        sessionId: "bad-session",
        stepId: "bad-step",
        timestamp: "2026-06-02T12:00:00.000Z",
        stepType: "tool_call",
        rawSystemPrompt: "not allowed"
      }
    });

    await server.close();

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_trajectory_slice");
  });

});
