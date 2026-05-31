import { describe, expect, it } from "vitest";

import { DEFAULT_POLICY_CONFIG } from "./index.js";

describe("@agentguard/policies", () => {
  it("defaults to fail-open policy behavior", () => {
    expect(DEFAULT_POLICY_CONFIG.failMode).toBe("open");
  });
});
