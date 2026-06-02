import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { buildServer } from "./server.js";

const DEFAULT_PORT = 4319;
const DEFAULT_DATABASE_PATH = join(homedir(), ".agent-sidecar", "agent-sidecar.sqlite");

const port = Number.parseInt(process.env.AGENT_SIDECAR_PORT ?? `${DEFAULT_PORT}`, 10);
const host = process.env.AGENT_SIDECAR_HOST ?? "127.0.0.1";
const databasePath = process.env.AGENT_SIDECAR_DB_PATH ?? DEFAULT_DATABASE_PATH;
const localPromptOptimizerEnabled = process.env.AGENT_SIDECAR_LOCAL_PROMPT_OPTIMIZER !== "off";
const localPromptOptimizerBaseUrl = process.env.AGENT_SIDECAR_LOCAL_MODEL_URL ?? "http://127.0.0.1:11434";
const localPromptOptimizerModel = process.env.AGENT_SIDECAR_LOCAL_MODEL ?? "deepseek-r1:7b";
const localPromptOptimizerTimeoutMs = Number.parseInt(process.env.AGENT_SIDECAR_LOCAL_MODEL_TIMEOUT_MS ?? "60000", 10);

mkdirSync(dirname(databasePath), { recursive: true });

const server = buildServer({
  databasePath,
  localPromptOptimizer: {
    enabled: localPromptOptimizerEnabled,
    baseUrl: localPromptOptimizerBaseUrl,
    model: localPromptOptimizerModel,
    timeoutMs: Number.isFinite(localPromptOptimizerTimeoutMs) ? localPromptOptimizerTimeoutMs : 60_000
  }
});

try {
  await server.listen({ port, host });
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
