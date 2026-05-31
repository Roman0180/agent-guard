import { buildServer } from "./server.js";

const DEFAULT_PORT = 4737;
const port = Number.parseInt(process.env.AGENTGUARD_DAEMON_PORT ?? `${DEFAULT_PORT}`, 10);
const host = process.env.AGENTGUARD_DAEMON_HOST ?? "127.0.0.1";

const server = buildServer();

try {
  await server.listen({ port, host });
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
