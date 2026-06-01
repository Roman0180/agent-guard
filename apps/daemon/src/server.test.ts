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
    const server = buildServer({ databasePath, logger: false });

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
        summary: "Implement the daemon routes."
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
        prompt: "Implement the daemon routes."
      }
    });

    expect(decisionsResponse.json()).toHaveLength(1);
    expect(decisionsResponse.json()[0]).toMatchObject({
      action: "inject_context",
      reasonCode: "prompt_optimized"
    });
  });

  it("returns injected prompt optimization context for the demo Codex prompt", async () => {
    const databasePath = await createTempDatabasePath();
    const server = buildServer({ databasePath, logger: false });

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

    await server.close();

    expect(hookResponse.statusCode).toBe(201);
    expect(hookResponse.json()).toMatchObject({
      action: "inject_context",
      reason: "prompt_optimized",
      message: expect.stringContaining("Task:\nFix the logger issue"),
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
        action: "inject_context",
        reasonCode: "prompt_optimized"
      },
      prompt_optimization: {
        mode: "initial_task",
        taskContract: {
          task: "Fix the logger issue"
        },
        rewriteReason: "Converted a vague prompt into a compact deterministic task contract.",
        shouldInject: true,
        injected: true,
        deterministicOrModel: "deterministic"
      }
    });

    expect(optimizationsResponse.statusCode).toBe(200);
    expect(optimizationsResponse.json()).toEqual([
      expect.objectContaining({
        runId: "demo-run-2",
        mode: "initial_task",
        optimizedPrompt: expect.stringContaining("Task:\nFix the logger issue")
      })
    ]);
  });
});
