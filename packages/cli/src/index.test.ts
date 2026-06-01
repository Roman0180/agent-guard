import { describe, expect, it } from "vitest";

import { getCliName } from "./index.js";

describe("@agent-sidecar/cli", () => {
  it("exposes the CLI name", () => {
    expect(getCliName()).toBe("agent-sidecar");
  });
});
