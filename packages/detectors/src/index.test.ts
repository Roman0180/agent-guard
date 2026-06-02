import { describe, expect, it } from "vitest";

import {
  detectOversizedToolOutput,
  detectRepeatedFailedToolCalls,
  evaluateTrajectorySlice,
  noMatch
} from "./index.js";
import type { TrajectorySlice } from "@agent-sidecar/core";

const baseSlice: TrajectorySlice = {
  schemaVersion: 1,
  sessionId: "demo-session",
  stepId: "step-1",
  timestamp: "2026-06-02T12:00:00.000Z",
  agentName: "demo-coding-agent",
  provider: "openai",
  model: "gpt-5.5",
  stepType: "tool_call",
  agentStateSummary: "Investigating a migration failure.",
  toolName: "run_command",
  toolArguments: { command: "pnpm test -- migration" },
  toolOutput: "Error: migration registry missing",
  filesTouched: [],
  errorMessage: "Error: migration registry missing",
  tokenCounts: { inputTokens: 1000, outputTokens: 100, totalTokens: 1100 },
  timingMs: 100,
  tags: [],
  metadata: {}
};

describe("@agent-sidecar/detectors", () => {
  it("keeps the placeholder no-match helper for compatibility", () => {
    expect(noMatch()).toEqual({ matched: false });
  });

  it("detects repeated failed tool calls", () => {
    const recent = [baseSlice, { ...baseSlice, stepId: "step-2" }, { ...baseSlice, stepId: "step-3" }];
    const match = detectRepeatedFailedToolCalls(recent[2]!, recent);

    expect(match?.category).toBe("loop");
    expect(match?.message).toContain("Repeated failed tool call");
  });

  it("detects oversized tool outputs", () => {
    const match = detectOversizedToolOutput({ ...baseSlice, toolOutput: "x".repeat(8_001), errorMessage: undefined });

    expect(match?.category).toBe("cost");
  });

  it("returns a critical intervention for risky auth edits", () => {
    const intervention = evaluateTrajectorySlice({
      ...baseSlice,
      stepId: "edit-1",
      stepType: "file_edit",
      toolName: "apply_patch",
      toolArguments: { path: "src/auth/session.ts" },
      errorMessage: undefined,
      toolOutput: "patched",
      filesTouched: ["src/auth/session.ts"]
    });

    expect(intervention.category).toBe("security");
    expect(intervention.should_block).toBe(true);
  });
});
