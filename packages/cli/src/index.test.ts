import { writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { getCliName, resolveDaemonUrl, runCli } from "./index.js";

const ISOLATED_ENV = { AGENT_SIDECAR_STATE_DIR: join(tmpdir(), "agent-sidecar-cli-test-no-state") };

describe("@agent-sidecar/cli", () => {
  it("exposes the CLI name", () => {
    expect(getCliName()).toBe("agent-sidecar");
  });

  it("checks daemon status", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 }));

    const result = await runCli(["status"], { fetch: fetchMock as never, env: ISOLATED_ENV });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"status":"ok"');
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4319/health");
  });

  it("reads the daemon URL selected at startup", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "agent-sidecar-cli-"));
    try {
      writeFileSync(join(stateDir, "daemon.json"), JSON.stringify({ url: "http://127.0.0.1:4320/" }));

      expect(resolveDaemonUrl({ AGENT_SIDECAR_STATE_DIR: stateDir })).toBe("http://127.0.0.1:4320");
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  it("ignores daemon startup state when the recorded process is gone", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "agent-sidecar-cli-"));
    try {
      writeFileSync(join(stateDir, "daemon.json"), JSON.stringify({ url: "http://127.0.0.1:4320", pid: 0 }));

      expect(resolveDaemonUrl({ AGENT_SIDECAR_STATE_DIR: stateDir })).toBe("http://127.0.0.1:4319");
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  it("prefers explicit daemon URL configuration over startup state", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "agent-sidecar-cli-"));
    try {
      writeFileSync(join(stateDir, "daemon.json"), JSON.stringify({ url: "http://127.0.0.1:4320" }));

      expect(resolveDaemonUrl({
        AGENT_SIDECAR_DAEMON_URL: "http://127.0.0.1:4400/",
        AGENT_SIDECAR_STATE_DIR: stateDir
      })).toBe("http://127.0.0.1:4400");
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  it("dry-runs daemon start against the first available daemon port", async () => {
    const port = await findFreePort();
    const stateDir = await mkdtemp(join(tmpdir(), "agent-sidecar-cli-"));
    try {
      writeFileSync(join(stateDir, "daemon.json"), JSON.stringify({ url: "http://127.0.0.1:4320", pid: 0 }));

      const result = await runCli(["daemon", "start", "--dry-run"], {
        env: {
          AGENT_SIDECAR_PORT: String(port),
          AGENT_SIDECAR_STATE_DIR: stateDir
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`agent-sidecar daemon would start on http://127.0.0.1:${port}`);
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  it("posts stdin JSON to the selected hook provider", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ action: "allow" }), { status: 201 }));

    const result = await runCli(["hook", "--provider", "codex"], {
      stdin: JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "Fix auth" }),
      fetch: fetchMock as never,
      env: ISOLATED_ENV
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"action":"allow"');
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4319/hooks/codex",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("submits a plain user task with repo context and no user-supplied token fields", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      action: "inject_context",
      prompt_optimization: {
        optimizedPrompt: "Task:\nFix auth with validation."
      }
    }), { status: 201 }));

    const result = await runCli(["codex", "Fix", "auth"], {
      fetch: fetchMock as never,
      cwd: "/tmp/not-a-real-repo",
      env: ISOLATED_ENV
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      optimizedPromptForCodex: "Task:\nFix auth with validation."
    });
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(firstCall[1].body)) as Record<string, unknown>;
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4319/hooks/codex",
      expect.objectContaining({ method: "POST" })
    );
    expect(body).toMatchObject({
      providerEventType: "UserPromptSubmit",
      prompt: "Fix auth",
      sidecarSubmission: true,
      contextSnapshot: {
        repoType: "unknown"
      }
    });
    expect(body).not.toHaveProperty("tokenUsage");
    expect(body).not.toHaveProperty("costEstimate");
  });

  it("fails open when hook delivery cannot reach the daemon", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("connection refused");
    });

    const result = await runCli(["hook", "--provider", "generic"], {
      stdin: JSON.stringify({ providerEventType: "PreToolUse" }),
      fetch: fetchMock as never,
      env: ISOLATED_ENV
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      action: "allow",
      reason: "daemon_unavailable_fail_open"
    });
  });

  it("fails closed when configured", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("connection refused");
    });

    const result = await runCli(["hook", "--provider", "generic"], {
      stdin: JSON.stringify({ providerEventType: "PreToolUse" }),
      fetch: fetchMock as never,
      env: { ...ISOLATED_ENV, AGENT_SIDECAR_FAIL_MODE: "closed" }
    });

    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      action: "block",
      reason: "daemon_unavailable_fail_closed"
    });
  });

  it("renders hook install instructions", async () => {
    const result = await runCli(["hook", "install", "--provider", "claude-code"], { env: ISOLATED_ENV });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      provider: "claude-code",
      command: "agent-sidecar hook --provider claude-code"
    });
  });

  it("starts, lists, and stops sessions through the daemon API", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/api/runs") && init?.method === "POST") {
        return new Response(String(init.body), { status: 201 });
      }
      if (url.endsWith("/api/runs")) {
        return new Response(JSON.stringify([{ id: "demo", provider: "codex", status: "active", repoRoot: "/repo" }]), { status: 200 });
      }
      if (url.endsWith("/api/events")) {
        return new Response(String(init?.body), { status: 201 });
      }
      return new Response("{}", { status: 200 });
    });

    const start = await runCli(["session", "start", "--agent", "codex", "--repo", ".", "--name", "demo"], { fetch: fetchMock as never, cwd: "/repo", env: ISOLATED_ENV });
    const list = await runCli(["session", "list"], { fetch: fetchMock as never, env: ISOLATED_ENV });
    const stop = await runCli(["session", "stop", "--session", "demo"], { fetch: fetchMock as never, env: ISOLATED_ENV });

    expect(start.stdout).toContain("Started session demo");
    expect(list.stdout).toContain("demo\tcodex\tactive");
    expect(stop.stdout).toContain("Recorded event");
  });

  it("reports an existing session instead of saying it started a duplicate", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/api/runs") && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "demo", provider: "codex", status: "active", repoRoot: "/repo" }), { status: 200 });
      }

      return new Response("{}", { status: 200 });
    });

    const result = await runCli(["session", "start", "--agent", "codex", "--repo", ".", "--name", "demo"], {
      fetch: fetchMock as never,
      cwd: "/repo",
      env: ISOLATED_ENV
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Session demo already exists");
    expect(result.stdout).not.toContain("Started session demo");
  });

  it("explains how to start the daemon when session creation cannot connect", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("fetch failed");
    });

    const result = await runCli(["session", "start", "--agent", "codex", "--repo", ".", "--name", "demo"], {
      fetch: fetchMock as never,
      cwd: "/repo",
      env: ISOLATED_ENV
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("session start failed: daemon unavailable at http://127.0.0.1:4319: fetch failed");
    expect(result.stderr).toContain("agent-sidecar start");
  });

  it("posts prompt refinement requests", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      optimization: {
        shouldInject: true,
        optimizedPrompt: "Task:\nFix tests with validation.",
        estimatedOptimizedTokens: 12,
        estimatedTokenDelta: 4
      }
    }), { status: 201 }));

    const result = await runCli(["refine", "--session", "demo", "fix", "tests"], { fetch: fetchMock as never, env: ISOLATED_ENV });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Refined prompt");
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4319/api/refine", expect.objectContaining({ method: "POST" }));
  });

  it("renders steering decisions", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      action: "warn",
      confidence: 0.86,
      findings: [{ detectorId: "missing_validation_detector" }],
      recommendedNextStep: "Run pnpm test."
    }), { status: 201 }));

    const result = await runCli(["steer", "--session", "demo"], { fetch: fetchMock as never, env: ISOLATED_ENV });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Steering decision: WARN");
    expect(result.stdout).toContain("missing_validation_detector");
  });

  it("starts the website and opens the root route in the default browser", async () => {
    const port = await findFreePort();
    const spawnMock = vi.fn(() => ({
      pid: 1234,
      unref: vi.fn(),
      on: vi.fn()
    }));
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));

    const result = await runCli(["website"], {
      fetch: fetchMock as never,
      spawn: spawnMock as never,
      env: {
        AGENT_SIDECAR_DASHBOARD_PORT: String(port),
        AGENT_SIDECAR_DASHBOARD_OPEN_TIMEOUT_MS: "50"
      }
    });

    const url = `http://127.0.0.1:${port}`;
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`website URL: ${url}`);
    expect(result.stdout).toContain("opened website in default browser");
    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(spawnMock.mock.calls[0]).toMatchObject([
      "pnpm",
      ["dev:website"],
      {
        env: expect.objectContaining({
          AGENT_SIDECAR_DASHBOARD_PORT: String(port),
          AGENT_SIDECAR_DASHBOARD_ROUTE: "/",
          PORT: String(port)
        })
      }
    ]);
    expect(JSON.stringify(spawnMock.mock.calls[1])).toContain(url);
  });

  it("starts the dashboard and opens the dashboard route in the default browser", async () => {
    const port = await findFreePort();
    const spawnMock = vi.fn(() => ({
      pid: 1234,
      unref: vi.fn(),
      on: vi.fn()
    }));
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));

    const result = await runCli(["dashboard"], {
      fetch: fetchMock as never,
      spawn: spawnMock as never,
      env: {
        AGENT_SIDECAR_DASHBOARD_PORT: String(port),
        AGENT_SIDECAR_DASHBOARD_OPEN_TIMEOUT_MS: "50"
      }
    });

    const url = `http://127.0.0.1:${port}/dashboard`;
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`dashboard URL: ${url}`);
    expect(result.stdout).toContain("opened dashboard in default browser");
    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(spawnMock.mock.calls[0]).toMatchObject([
      "pnpm",
      ["dev:dashboard"],
      {
        env: expect.objectContaining({
          AGENT_SIDECAR_DASHBOARD_PORT: String(port),
          AGENT_SIDECAR_DASHBOARD_ROUTE: "/dashboard",
          PORT: String(port)
        })
      }
    ]);
    expect(JSON.stringify(spawnMock.mock.calls[1])).toContain(url);
  });

});

function findFreePort(host = "127.0.0.1"): Promise<number> {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ port: 0, host }, () => {
      const address = server.address();
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        if (address && typeof address === "object") {
          resolve(address.port);
          return;
        }

        reject(new Error("server did not expose a numeric port"));
      });
    });
  });
}
