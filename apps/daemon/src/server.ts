import Fastify, { type FastifyInstance } from "fastify";

export type HealthResponse = {
  status: "ok";
  service: "agentguard-daemon";
};

export function buildServer(): FastifyInstance {
  const server = Fastify({
    logger: true
  });

  server.get("/health", async (): Promise<HealthResponse> => ({
    status: "ok",
    service: "agentguard-daemon"
  }));

  return server;
}
