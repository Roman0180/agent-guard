import { createServer, type Server } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { findAvailablePort, formatDaemonUrl, parsePort } from "./ports.js";

const openServers: Server[] = [];

afterEach(async () => {
  await Promise.all(openServers.splice(0).map((server) => closeServer(server)));
});

describe("daemon port helpers", () => {
  it("selects the next available port when the requested port is occupied", async () => {
    const occupiedPort = await occupyPort();

    const selectedPort = await findAvailablePort(occupiedPort, "127.0.0.1", 5);

    expect(selectedPort).toBeGreaterThan(occupiedPort);
    expect(selectedPort).toBeLessThanOrEqual(occupiedPort + 4);
  });

  it("parses invalid configured ports back to the fallback", () => {
    expect(parsePort("4320", 4319)).toBe(4320);
    expect(parsePort("invalid", 4319)).toBe(4319);
    expect(parsePort("70000", 4319)).toBe(4319);
  });

  it("formats wildcard hosts as a local browser URL", () => {
    expect(formatDaemonUrl("0.0.0.0", 4319)).toBe("http://127.0.0.1:4319");
    expect(formatDaemonUrl("::1", 4319)).toBe("http://[::1]:4319");
  });
});

function occupyPort(host = "127.0.0.1"): Promise<number> {
  const server = createServer();
  openServers.push(server);

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ port: 0, host }, () => {
      const address = server.address();
      if (address && typeof address === "object") {
        resolve(address.port);
        return;
      }

      reject(new Error("server did not expose a numeric port"));
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
