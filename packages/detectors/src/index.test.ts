import { describe, expect, it } from "vitest";

import { noMatch } from "./index.js";

describe("@agent-sidecar/detectors", () => {
  it("exports a placeholder detector result", () => {
    expect(noMatch()).toEqual({ matched: false });
  });
});
