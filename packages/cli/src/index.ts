#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type CliResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type CliIo = {
  stdin?: string;
  fetch?: typeof fetch;
  env?: Record<string, string | undefined>;
  spawn?: typeof spawn;
  cwd?: string;
};

const DEFAULT_DAEMON_URL = "http://127.0.0.1:4319";

type HookProvider = "generic" | "codex" | "claude-code";

export function getCliName(): string {
  return "agent-sidecar";
}

export async function runCli(argv: string[], io: CliIo = {}): Promise<CliResult> {
  const [command, subcommand, ...rest] = argv;
  const env = io.env ?? process.env;
  const daemonUrl = (env.AGENT_SIDECAR_DAEMON_URL ?? DEFAULT_DAEMON_URL).replace(/\/$/, "");
  const fetchImpl = io.fetch ?? fetch;

  if (!command || command === "--help" || command === "help") {
    return ok(renderHelp());
  }

  if (command === "status") {
    try {
      const response = await fetchImpl(`${daemonUrl}/health`);
      const body = await response.text();
      return response.ok ? ok(`${body}\n`) : fail(1, `daemon health check failed: ${response.status}\n${body}\n`);
    } catch (error) {
      return fail(1, `daemon unavailable at ${daemonUrl}: ${errorMessage(error)}\n`);
    }
  }

  if (command === "daemon" && subcommand === "start") {
    if (rest.includes("--dry-run")) {
      return ok(`agent-sidecar daemon would start on ${daemonUrl}\n`);
    }

    const started = startDaemonProcess(io.spawn ?? spawn, env);
    return ok(`agent-sidecar daemon start requested (${started})\n`);
  }

  if (command === "hook" && subcommand === "install") {
    const provider = parseProvider(rest);
    return ok(`${JSON.stringify(renderHookInstall(provider), null, 2)}\n`);
  }

  if (command === "hook") {
    const provider = parseProvider([subcommand ?? "", ...rest]);
    const payload = parseStdinPayload(io.stdin ?? readStdin());
    return postHook(fetchImpl, daemonUrl, provider, payload, env);
  }

  if (command === "codex" || command === "task") {
    const prompt = parseTaskPrompt([subcommand ?? "", ...rest], io.stdin);
    if (!prompt) {
      return fail(1, `missing task prompt\n${renderHelp()}`);
    }

    return postTaskPrompt(fetchImpl, daemonUrl, prompt, io.cwd ?? process.cwd());
  }

  return fail(1, `unknown command: ${argv.join(" ")}\n${renderHelp()}`);
}

function renderHelp(): string {
  return `agent-sidecar\n\nCommands:\n  agent-sidecar status\n  agent-sidecar daemon start [--dry-run]\n  agent-sidecar codex "task prompt"\n  agent-sidecar hook --provider generic|codex|claude-code < event.json\n  agent-sidecar hook install --provider codex|claude-code\n`;
}

function parseTaskPrompt(args: string[], stdin?: string): string {
  const inline = args.filter(Boolean).join(" ").trim();
  return inline || (stdin ?? "").trim();
}

function parseProvider(args: string[]): HookProvider {
  const providerIndex = args.findIndex((arg) => arg === "--provider" || arg === "-p");
  const raw = providerIndex >= 0 ? args[providerIndex + 1] : args.find((arg) => ["generic", "codex", "claude", "claude-code"].includes(arg));
  if (raw === "codex") return "codex";
  if (raw === "claude" || raw === "claude-code") return "claude-code";
  return "generic";
}

function parseStdinPayload(stdin: string): unknown {
  if (!stdin.trim()) {
    return {};
  }

  return JSON.parse(stdin);
}

async function postHook(
  fetchImpl: typeof fetch,
  daemonUrl: string,
  provider: HookProvider,
  payload: unknown,
  env: Record<string, string | undefined>
): Promise<CliResult> {
  const endpointProvider = provider === "claude-code" ? "claude" : provider;
  try {
    const response = await fetchImpl(`${daemonUrl}/hooks/${endpointProvider}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.text();
    return response.ok ? ok(`${body}\n`) : fail(1, `hook request failed: ${response.status}\n${body}\n`);
  } catch (error) {
    const failMode = env.AGENT_SIDECAR_FAIL_MODE === "closed" ? "closed" : "open";
    const fallback = {
      action: failMode === "closed" ? "block" : "allow",
      reason: `daemon_unavailable_fail_${failMode}`,
      message: `Agent Sidecar daemon unavailable at ${daemonUrl}: ${errorMessage(error)}`
    };
    return {
      exitCode: failMode === "closed" ? 2 : 0,
      stdout: `${JSON.stringify(fallback)}\n`,
      stderr: failMode === "closed" ? `${fallback.message}\n` : ""
    };
  }
}

async function postTaskPrompt(
  fetchImpl: typeof fetch,
  daemonUrl: string,
  prompt: string,
  cwd: string
): Promise<CliResult> {
  const payload = {
    id: randomUUID(),
    runId: randomUUID(),
    providerEventType: "UserPromptSubmit",
    prompt,
    cwd,
    repoRoot: cwd,
    branch: readGitBranch(cwd),
    sidecarSubmission: true,
    contextSnapshot: collectRepoContext(cwd)
  };

  const result = await postHook(fetchImpl, daemonUrl, "codex", payload, {});
  if (result.exitCode !== 0) {
    return result;
  }

  try {
    const response = JSON.parse(result.stdout) as { message?: string; prompt_optimization?: { optimizedPrompt?: string } };
    return ok(`${JSON.stringify({
      ...response,
      optimizedPromptForCodex: response.prompt_optimization?.optimizedPrompt ?? response.message
    }, null, 2)}\n`);
  } catch {
    return result;
  }
}

function collectRepoContext(cwd: string): Record<string, unknown> {
  return {
    repoType: detectRepoType(cwd),
    agentsInstructions: readOptionalFile(join(cwd, "AGENTS.md"), 2_000),
    previousPlans: readPreviousPlans(cwd),
    fileTree: readFileTree(cwd),
    activeBranch: readGitBranch(cwd),
    relevantDiffs: readGitDiff(cwd)
  };
}

function detectRepoType(cwd: string): string {
  if (existsSync(join(cwd, "package.json"))) return "node";
  if (existsSync(join(cwd, "pyproject.toml"))) return "python";
  if (existsSync(join(cwd, "Cargo.toml"))) return "rust";
  if (existsSync(join(cwd, "go.mod"))) return "go";
  return "unknown";
}

function readPreviousPlans(cwd: string): string[] {
  return ["docs/IMPLEMENTATION_PLAN.md", "docs/MVP_PROMPTS.md"]
    .map((path) => {
      const content = readOptionalFile(join(cwd, path), 800);
      return content ? `${path}\n${content}` : undefined;
    })
    .filter((value): value is string => Boolean(value));
}

function readFileTree(cwd: string): string[] {
  try {
    return execFileSync("git", ["ls-files"], { cwd, encoding: "utf8", timeout: 2_000 })
      .split("\n")
      .filter(Boolean)
      .slice(0, 100);
  } catch {
    return [];
  }
}

function readGitBranch(cwd: string): string | undefined {
  try {
    return execFileSync("git", ["branch", "--show-current"], { cwd, encoding: "utf8", timeout: 2_000 }).trim() || undefined;
  } catch {
    return undefined;
  }
}

function readGitDiff(cwd: string): string {
  try {
    return execFileSync("git", ["diff", "--stat"], { cwd, encoding: "utf8", timeout: 2_000 }).slice(0, 1_500);
  } catch {
    return "";
  }
}

function readOptionalFile(path: string, maxLength: number): string {
  try {
    if (!existsSync(path)) return "";
    return readFileSync(path, "utf8").slice(0, maxLength);
  } catch {
    return "";
  }
}

function renderHookInstall(provider: HookProvider): Record<string, unknown> {
  const command = provider === "claude-code" ? "agent-sidecar hook --provider claude-code" : `agent-sidecar hook --provider ${provider}`;
  return {
    provider,
    command,
    mode: "stdin-json",
    note: "Configure the agent runtime to pipe hook event JSON to this command."
  };
}

function startDaemonProcess(spawnImpl: typeof spawn, env: Record<string, string | undefined>): string {
  const entry = resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/daemon/dist/index.js");
  const child = spawnImpl(process.execPath, [entry], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, ...env }
  });
  child.unref();
  return `pid ${child.pid ?? "unknown"}`;
}

function readStdin(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function ok(stdout: string): CliResult {
  return { exitCode: 0, stdout, stderr: "" };
}

function fail(exitCode: number, stderr: string): CliResult {
  return { exitCode, stdout: "", stderr };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (process.argv[1]?.endsWith("agent-sidecar") || process.argv[1]?.endsWith("index.js")) {
  const result = await runCli(process.argv.slice(2));
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}
