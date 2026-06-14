import { describe, expect, it } from "vitest";

import {
  detectFailedTestRepetition,
  detectMissingValidation,
  detectPromptDrift,
  detectRepeatedCommand,
  detectRepeatedEdit,
  noMatch
} from "./index.js";

describe("@agent-sidecar/detectors", () => {
  it("exports a placeholder detector result", () => {
    expect(noMatch()).toEqual({ matched: false });
  });

  it("detects repeated commands", () => {
    const result = detectRepeatedCommand({ runState: { repeatedCommandCounts: { "pnpm test": 3 } } });
    expect(result).toMatchObject({ matched: true, reasonCode: "loop.repeated_command" });
  });

  it("detects repeated failed validation", () => {
    const result = detectFailedTestRepetition({
      events: [
        { eventType: "validation", summary: "expected true failed", validation: { status: "failed" } },
        { eventType: "validation", summary: "expected true failed", validation: { status: "failed" } }
      ]
    });
    expect(result).toMatchObject({ matched: true, reasonCode: "loop.failed_test_repetition" });
  });

  it("detects repeated edits to the same file", () => {
    const result = detectRepeatedEdit({
      events: [
        { eventType: "file_edit", fileEdit: { paths: ["src/auth.ts"] } },
        { eventType: "file_edit", fileEdit: { paths: ["src/auth.ts"] } },
        { eventType: "file_edit", fileEdit: { paths: ["src/auth.ts"] } }
      ]
    });
    expect(result).toMatchObject({ matched: true, reasonCode: "loop.repeated_edit" });
  });

  it("detects missing validation after edits", () => {
    const result = detectMissingValidation({ runState: { filesChanged: ["src/index.ts"], validationSinceLastEdit: false } });
    expect(result).toMatchObject({ matched: true, reasonCode: "guardrail.validation_missing" });
  });

  it("detects likely prompt drift on broad low-overlap changes", () => {
    const result = detectPromptDrift({
      runState: { taskSummary: "fix login refresh token", changedFileCount: 9 },
      events: [{ eventType: "file_edit", summary: "rewrote dashboard chart colors and marketing layout" }]
    });
    expect(result).toMatchObject({ matched: true, reasonCode: "guardrail.prompt_drift" });
  });
});
