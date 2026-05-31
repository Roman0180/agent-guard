import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { buildServer } from "./server.js";

const DEFAULT_PORT = 4319;
const DEFAULT_DATABASE_PATH = join(homedir(), ".agentguard", "agentguard.sqlite");

const port = Number.parseInt(process.env.AGENTGUARD_PORT ?? `${DEFAULT_PORT}`, 10);
const host = process.env.AGENTGUARD_HOST ?? "127.0.0.1";
const databasePath = process.env.AGENTGUARD_DB_PATH ?? DEFAULT_DATABASE_PATH;

mkdirSync(dirname(databasePath), { recursive: true });

const server = buildServer({
  databasePath
});

try {
  await server.listen({ port, host });
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
