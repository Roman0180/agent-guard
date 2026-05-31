import { describe, expect, it } from "vitest";

import { DEFAULT_STEERING_CONFIG } from "./index.js";

describe("@agentguard/steering", () => {
  it("keeps steering disabled by default", () => {
    expect(DEFAULT_STEERING_CONFIG).toEqual({
      enabled: false,
      provider: "none"
    });
  });
});
