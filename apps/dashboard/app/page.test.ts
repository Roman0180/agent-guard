import { describe, expect, it } from "vitest";

describe("@agent-sidecar/dashboard", () => {
  it("has a dashboard smoke test", () => {
    expect("Agent Sidecar Dashboard").toContain("Agent Sidecar");
  });
});
