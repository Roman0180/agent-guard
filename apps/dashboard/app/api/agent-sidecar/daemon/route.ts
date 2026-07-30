import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, parse, resolve } from "node:path";

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type DaemonDiscoveryPayload = {
  daemonUrls: string[];
  statePaths: string[];
};

export function GET() {
  const repoRoot = process.env.AGENT_SIDECAR_REPO_ROOT
    ? resolve(process.env.AGENT_SIDECAR_REPO_ROOT)
    : process.cwd();
  const repoStatePath = findUp(".agent-sidecar/daemon.json", repoRoot);
  const repoConfigPath = findUp(".agent-sidecar/config.json", repoRoot);
  const homeStatePath = resolve(homedir(), ".agent-sidecar/daemon.json");

  const daemonUrls = normalizeDaemonUrls([
    process.env.NEXT_PUBLIC_AGENT_SIDECAR_DAEMON_URL,
    process.env.AGENT_SIDECAR_API_URL,
    readDaemonUrl(repoStatePath),
    readDaemonUrl(homeStatePath),
    readConfiguredDaemonUrl(repoConfigPath)
  ]);
  const statePaths = [repoStatePath, homeStatePath].filter((path, index, paths) => existsSync(path) && paths.indexOf(path) === index);

  const payload: DaemonDiscoveryPayload = { daemonUrls, statePaths };
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

function readDaemonUrl(path: string): string | undefined {
  if (!existsSync(path)) {
    return undefined;
  }

  try {
    const state = JSON.parse(readFileSync(path, "utf8")) as { api_url?: unknown; url?: unknown; pid?: unknown };
    if (!stateProcessIsRunning(state)) {
      return undefined;
    }
    const url = typeof state.api_url === "string" ? state.api_url : state.url;
    return typeof url === "string" ? url : undefined;
  } catch {
    return undefined;
  }
}

function stateProcessIsRunning(state: { pid?: unknown }): boolean {
  if (typeof state.pid !== "number" || state.pid <= 0) {
    return true;
  }

  try {
    process.kill(state.pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readConfiguredDaemonUrl(path: string): string | undefined {
  if (!existsSync(path)) {
    return undefined;
  }

  try {
    const config = JSON.parse(readFileSync(path, "utf8")) as { daemon?: { api_port?: unknown } };
    const port = Number(config.daemon?.api_port);
    return Number.isInteger(port) && port > 0 ? `http://127.0.0.1:${port}` : undefined;
  } catch {
    return undefined;
  }
}

function findUp(relativePath: string, startDir: string): string {
  let dir = resolve(startDir);
  const root = parse(dir).root;
  while (true) {
    const candidate = resolve(dir, relativePath);
    if (existsSync(candidate)) {
      return candidate;
    }
    if (dir === root) {
      return resolve(startDir, relativePath);
    }
    dir = dirname(dir);
  }
}

function normalizeDaemonUrls(urls: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const url of urls) {
    const value = url?.trim().replace(/\/$/, "");
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}
