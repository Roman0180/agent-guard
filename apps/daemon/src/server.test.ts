import { describe, expect, it } from "vitest";

import { buildServer } from "./server.js";

describe("@agentguard/daemon", () => {
  it("responds to health checks", async () => {
    const server = buildServer();

    const response = await server.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      service: "agentguard-daemon"
    });
  });
});
