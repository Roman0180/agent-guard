import { describe, expect, it } from "vitest";

import { AGENTGUARD_DAEMON_DEFAULT_PORT, type RuntimeDecision } from "./index.js";

describe("@agentguard/core", () => {
  it("exports shared runtime primitives", () => {
    const decision: RuntimeDecision = {
      action: "allow",
      reasonCode: "bootstrap.allow",
      message: "Allowed by skeleton runtime"
    };

    expect(AGENTGUARD_DAEMON_DEFAULT_PORT).toBe(4737);
    expect(decision.action).toBe("allow");
  });
});
