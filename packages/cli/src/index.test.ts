import { describe, expect, it, vi } from "vitest";

import { getCliName, runCli } from "./index.js";

describe("@agent-sidecar/cli", () => {
  it("exposes the CLI name", () => {
    expect(getCliName()).toBe("agent-sidecar");
  });

  it("checks daemon status", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 }));

    const result = await runCli(["status"], { fetch: fetchMock as never });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"status":"ok"');
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4319/health");
  });

  it("posts stdin JSON to the selected hook provider", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ action: "allow" }), { status: 201 }));

    const result = await runCli(["hook", "--provider", "codex"], {
      stdin: JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "Fix auth" }),
      fetch: fetchMock as never
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
      cwd: "/tmp/not-a-real-repo"
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
      fetch: fetchMock as never
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
      env: { AGENT_SIDECAR_FAIL_MODE: "closed" }
    });

    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      action: "block",
      reason: "daemon_unavailable_fail_closed"
    });
  });

  it("renders hook install instructions", async () => {
    const result = await runCli(["hook", "install", "--provider", "claude-code"]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      provider: "claude-code",
      command: "agent-sidecar hook --provider claude-code"
    });
  });
});
