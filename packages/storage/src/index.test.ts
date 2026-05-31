import { describe, expect, it } from "vitest";

import { createStorageConfig, DEFAULT_DATABASE_FILENAME } from "./index.js";

describe("@agentguard/storage", () => {
  it("creates a SQLite-ready storage config", () => {
    expect(DEFAULT_DATABASE_FILENAME).toBe("agentguard.sqlite");
    expect(createStorageConfig("/tmp/agentguard.sqlite")).toEqual({
      databasePath: "/tmp/agentguard.sqlite"
    });
  });
});
