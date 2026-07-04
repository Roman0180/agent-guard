import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { findAvailablePort, formatDaemonUrl, parsePort } from "./ports.js";
import { buildServer } from "./server.js";

const DEFAULT_PORT = 4319;
const DEFAULT_DATABASE_PATH = join(homedir(), ".agent-sidecar", "agent-sidecar.sqlite");
const DEFAULT_STATE_DIR = join(homedir(), ".agent-sidecar");

const requestedPort = parsePort(process.env.AGENT_SIDECAR_PORT, DEFAULT_PORT);
const host = process.env.AGENT_SIDECAR_HOST ?? "127.0.0.1";
const databasePath = process.env.AGENT_SIDECAR_DB_PATH ?? DEFAULT_DATABASE_PATH;
const stateDir = process.env.AGENT_SIDECAR_STATE_DIR ?? DEFAULT_STATE_DIR;
const portScanLimit = parsePort(process.env.AGENT_SIDECAR_PORT_SCAN_LIMIT, 100);
const localPromptOptimizerEnabled = isTruthy(process.env.AGENT_SIDECAR_LOCAL_PROMPT_OPTIMIZER);
const localSteeringEnabled = process.env.AGENT_SIDECAR_LOCAL_STEERING !== "off";
const localPromptOptimizerBaseUrl = process.env.AGENT_SIDECAR_LOCAL_MODEL_URL ?? "http://127.0.0.1:11434";
const localPromptOptimizerModel = process.env.AGENT_SIDECAR_LOCAL_MODEL ?? "deepseek-r1:7b";
const localPromptOptimizerTimeoutMs = Number.parseInt(process.env.AGENT_SIDECAR_LOCAL_MODEL_TIMEOUT_MS ?? "60000", 10);

mkdirSync(dirname(databasePath), { recursive: true });
mkdirSync(stateDir, { recursive: true });

const server = buildServer({
  databasePath,
  localPromptOptimizer: {
    enabled: localPromptOptimizerEnabled,
    baseUrl: localPromptOptimizerBaseUrl,
    model: localPromptOptimizerModel,
    timeoutMs: Number.isFinite(localPromptOptimizerTimeoutMs) ? localPromptOptimizerTimeoutMs : 60_000
  },
  localSteering: {
    enabled: localSteeringEnabled,
    baseUrl: localPromptOptimizerBaseUrl,
    model: localPromptOptimizerModel,
    timeoutMs: Number.isFinite(localPromptOptimizerTimeoutMs) ? localPromptOptimizerTimeoutMs : 60_000
  }
});

try {
  const port = await findAvailablePort(requestedPort, host, portScanLimit);
  await server.listen({ port, host });
  writeDaemonState(stateDir, host, port);

  if (port !== requestedPort) {
    server.log.warn({ requestedPort, port, host }, "requested port unavailable; selected next available port");
  }
} catch (error) {
  server.log.error(error);
  process.exit(1);
}

function writeDaemonState(stateDir: string, host: string, port: number): void {
  const url = formatDaemonUrl(host, port);
  writeFileSync(
    join(stateDir, "daemon.json"),
    `${JSON.stringify({ host, port, url, pid: process.pid, updatedAt: new Date().toISOString() }, null, 2)}\n`
  );
}

function isTruthy(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").toLowerCase());
}
