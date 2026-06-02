import { describe, expect, it } from "vitest";

import { createAgentSidecar, sanitizeTrajectorySlice } from "./index.js";
import type { TrajectorySlice } from "@agent-sidecar/core";

const slice: TrajectorySlice = {
  schemaVersion: 1,
  sessionId: "session-1",
  stepId: "step-1",
  timestamp: "2026-06-02T12:00:00.000Z",
  agentName: "demo-coding-agent",
  provider: "openai",
  model: "gpt-5.5",
  stepType: "tool_call",
  agentStateSummary: "Calling a tool with a token sk-test1234567890abcdef and roman@example.com",
  toolName: "read_file",
  toolArguments: { path: "src/index.ts", apiKey: "super-secret" },
  toolOutput: "password=letmein\n" + "x".repeat(100),
  filesTouched: ["src/index.ts"],
  tokenCounts: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  timingMs: 15,
  tags: ["debugging"],
  metadata: {}
};

describe("@agent-sidecar/sdk", () => {
  it("redacts secrets and PII locally before transport", () => {
    const sanitized = sanitizeTrajectorySlice(slice, { maxFieldLength: 80 });

    expect(sanitized.agentStateSummary).toContain("[REDACTED]");
    expect(sanitized.agentStateSummary).toContain("[REDACTED_EMAIL]");
    expect(sanitized.toolArguments.apiKey).toBe("[REDACTED]");
    expect(sanitized.toolOutput).not.toContain("letmein");
    expect(sanitized.toolOutput?.length).toBeLessThanOrEqual(100);
  });

  it("runs locally without calling the Sidecar API when localOnly is true", async () => {
    const sidecar = createAgentSidecar({ localOnly: true });
    const intervention = await sidecar.observeStep({
      sessionId: "session-1",
      stepId: "step-2",
      stepType: "tool_call",
      toolName: "read_file",
      toolOutput: "ok"
    });

    expect(intervention.severity).toBe("info");
  });

  it("posts sanitized slices to the API", async () => {
    let sentBody = "";
    const sidecar = createAgentSidecar({
      apiUrl: "http://sidecar.test",
      apiKey: "sidecar-key",
      fetch: async (_url, init) => {
        sentBody = String(init?.body);
        return new Response(JSON.stringify({
          accepted: true,
          sanitized: true,
          intervention: {
            intervention_id: "intervention-1",
            severity: "info",
            category: "tool_use",
            message: "ok",
            rationale: "No rule matched.",
            recommended_action: "Continue.",
            should_block: false,
            confidence: 0.5,
            metadata: {}
          }
        }));
      }
    });

    await sidecar.observeStep({
      sessionId: "session-1",
      stepId: "step-3",
      stepType: "tool_call",
      toolName: "read_file",
      toolArguments: { authorization: "Bearer secret-token" }
    });

    expect(sentBody).toContain("[REDACTED]");
    expect(sentBody).not.toContain("secret-token");
  });
});
