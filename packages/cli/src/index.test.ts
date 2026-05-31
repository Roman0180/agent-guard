import { describe, expect, it } from "vitest";

import { getCliName } from "./index.js";

describe("@agentguard/cli", () => {
  it("exposes the CLI name", () => {
    expect(getCliName()).toBe("agentguard");
  });
});
