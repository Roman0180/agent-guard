import { createServer } from "node:net";

const MIN_PORT = 1;
const MAX_PORT = 65_535;

export function parsePort(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed >= MIN_PORT && parsed <= MAX_PORT ? parsed : fallback;
}

export async function findAvailablePort(startPort: number, host: string, maxAttempts = 100): Promise<number> {
  for (let port = startPort; port <= MAX_PORT && port < startPort + maxAttempts; port += 1) {
    if (await isPortAvailable(port, host)) {
      return port;
    }
  }

  throw new Error(`no available port found from ${startPort} after ${maxAttempts} attempts`);
}

export function formatDaemonUrl(host: string, port: number): string {
  const browserHost = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
  const formattedHost = browserHost.includes(":") && !browserHost.startsWith("[") ? `[${browserHost}]` : browserHost;
  return `http://${formattedHost}:${port}`;
}

function isPortAvailable(port: number, host: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const tester = createServer();

    tester.once("error", (error: NodeJS.ErrnoException) => {
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

    tester.listen({ port, host, exclusive: true });
  });
}
