#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createServer } from "node:net";

const DEFAULT_PORT = 4738;
const MAX_PORT = 65_535;
const mode = process.argv[2] ?? "dev";
const route = normalizeRoute(process.argv[3] ?? process.env.AGENT_SIDECAR_DASHBOARD_ROUTE ?? "/");
const host = process.env.AGENT_SIDECAR_DASHBOARD_HOST ?? "127.0.0.1";
const requestedPort = parsePort(process.env.AGENT_SIDECAR_DASHBOARD_PORT ?? process.env.PORT, DEFAULT_PORT);
const portScanLimit = parsePort(process.env.AGENT_SIDECAR_DASHBOARD_PORT_SCAN_LIMIT, 100);

if (!["dev", "start"].includes(mode)) {
  console.error(`unsupported Next.js mode: ${mode}`);
  process.exit(1);
}

const port = await findAvailablePort(requestedPort, host, portScanLimit);
if (port !== requestedPort) {
  console.warn(`Dashboard port ${requestedPort} is unavailable; using ${port}.`);
}

console.log(`${route === "/dashboard" ? "Dashboard" : "Website"} URL: ${formatLocalUrl(host, port)}${route === "/" ? "" : route}`);

const child = spawn("next", [mode, "--hostname", host, "--port", String(port)], {
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: String(port)
  }
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 1;
});

function parsePort(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= MAX_PORT ? parsed : fallback;
}

function normalizeRoute(value) {
  if (!value || value === "/") {
    return "/";
  }

  return value.startsWith("/") ? value : `/${value}`;
}

function formatLocalUrl(listenHost, portCandidate) {
  const browserHost = listenHost === "0.0.0.0" || listenHost === "::" ? "127.0.0.1" : listenHost;
  const formattedHost = browserHost.includes(":") && !browserHost.startsWith("[") ? `[${browserHost}]` : browserHost;
  return `http://${formattedHost}:${portCandidate}`;
}

async function findAvailablePort(startPort, listenHost, maxAttempts) {
  for (let portCandidate = startPort; portCandidate <= MAX_PORT && portCandidate < startPort + maxAttempts; portCandidate += 1) {
    if (await isPortAvailable(portCandidate, listenHost)) {
      return portCandidate;
    }
  }

  throw new Error(`no available dashboard port found from ${startPort} after ${maxAttempts} attempts`);
}

function isPortAvailable(portCandidate, listenHost) {
  return new Promise((resolve, reject) => {
    const tester = createServer();

    tester.once("error", (error) => {
      if (error.code === "EADDRINUSE" || error.code === "EACCES") {
        resolve(false);
        return;
      }

      reject(error);
    });

    tester.once("listening", () => {
      tester.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(true);
      });
    });

    tester.listen({ port: portCandidate, host: listenHost, exclusive: true });
  });
}
