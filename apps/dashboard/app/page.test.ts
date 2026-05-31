import { describe, expect, it } from "vitest";

describe("@agentguard/dashboard", () => {
  it("has a dashboard smoke test", () => {
    expect("AgentGuard Dashboard").toContain("AgentGuard");
  });
});
