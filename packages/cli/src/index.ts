#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type CliResult = { exitCode: number; stdout: string; stderr: string };
export type CliIo = { stdin?: string; fetch?: typeof fetch; env?: Record<string, string | undefined>; spawn?: typeof spawn; cwd?: string };

const DEFAULT_DAEMON_HOST = "127.0.0.1";
const DEFAULT_DAEMON_PORT = 4319;
const DEFAULT_DAEMON_URL = `http://${DEFAULT_DAEMON_HOST}:${DEFAULT_DAEMON_PORT}`;
const DEFAULT_DASHBOARD_HOST = "127.0.0.1";
const DEFAULT_DASHBOARD_PORT = 4738;
const DEFAULT_STATE_DIR = join(homedir(), ".agent-sidecar");
const DEFAULT_REPO_CONTEXT_CACHE_TTL_MS = 30_000;
const MAX_REPO_CONTEXT_CACHE_ENTRIES = 50;
const REPO_CONTEXT_CACHE_VERSION = 1;
const MAX_PORT = 65_535;
type HookProvider = "generic" | "codex" | "claude-code";
type CodexPromptResult = {
  originalPrompt: string;
  optimizedPrompt?: string;
  response?: JsonRecord;
  result: CliResult;
};

type JsonRecord = Record<string, unknown>;
type RepoContextFingerprint = { cacheKey: string; fingerprint: string; repoType: string; activeBranch?: string; relevantDiffs: string };
type RepoContextCacheEntry = { cacheKey: string; fingerprint: string; updatedAt: number; snapshot: Record<string, unknown> };
type RepoContextCacheFile = { version: number; entries: RepoContextCacheEntry[] };

export function getCliName(): string { return "agent-sidecar"; }
export function resolveDaemonUrl(env: Record<string, string | undefined> = process.env): string {
  const configuredUrl = env.AGENT_SIDECAR_DAEMON_URL;
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");
  return readDaemonStateUrl(env) ?? DEFAULT_DAEMON_URL;
}

export async function runCli(argv: string[], io: CliIo = {}): Promise<CliResult> {
  const [command, subcommand, ...rest] = argv;
  const env = io.env ?? process.env;
  const daemonUrl = resolveDaemonUrl(env);
  const fetchImpl = io.fetch ?? fetch;
  const cwd = io.cwd ?? process.cwd();

  if (!command || command === "--help" || command === "help") return ok(renderHelp());
  if (command === "start") return runCli(["daemon", "start", ...[subcommand, ...rest].filter((value): value is string => Boolean(value))], io);

  if (command === "status") return getText(fetchImpl, `${daemonUrl}/health`, "daemon health check failed");

  if (command === "daemon" && subcommand === "start") {
    if (rest.includes("--dry-run")) return ok(`agent-sidecar daemon would start on ${await resolveDaemonStartUrl(env)}\n`);
    const started = startDaemonProcess(io.spawn ?? spawn, env);
    return ok(`agent-sidecar daemon start requested (${started})\n`);
  }

  if (command === "session") return handleSession(subcommand, rest, fetchImpl, daemonUrl, cwd);
  if (command === "event") return handleEvent(subcommand, rest, fetchImpl, daemonUrl);
  if (command === "trace" && subcommand === "show") return handleReplay(rest[0], fetchImpl, daemonUrl, "trace");
  if (command === "replay") return handleReplay(subcommand, fetchImpl, daemonUrl, "replay");
  if (command === "summary" && subcommand === "export") return handleSummaryExport(rest, fetchImpl, daemonUrl);
  if (command === "steer") return handleSteer([subcommand ?? "", ...rest], fetchImpl, daemonUrl);
  if (command === "refine") return handleRefine([subcommand ?? "", ...rest], fetchImpl, daemonUrl);
  if (command === "website") return handleWebApp("website", io.spawn ?? spawn, fetchImpl, env);
  if (command === "dashboard") return handleWebApp("dashboard", io.spawn ?? spawn, fetchImpl, env);
  if (command === "codex-shim") return handleCodexShim(subcommand, rest, env);

  if (command === "hook" && subcommand === "install") return ok(`${JSON.stringify(renderHookInstall(parseProvider(rest)), null, 2)}\n`);
  if (command === "hook") return postHook(fetchImpl, daemonUrl, parseProvider([subcommand ?? "", ...rest]), parseStdinPayload(io.stdin ?? readStdin()), env, cwd);

  if (command === "codex") {
    return handleCodexPrompt([subcommand ?? "", ...rest].filter(Boolean), fetchImpl, daemonUrl, io.spawn ?? spawn, env, cwd, io.stdin);
  }

  if (command === "task") {
    const prompt = parseTaskPrompt([subcommand ?? "", ...rest], io.stdin);
    if (!prompt) return fail(1, `missing task prompt\n${renderHelp()}`);
    const optimization = await optimizeCodexPrompt(fetchImpl, daemonUrl, prompt, cwd, env);
    if (optimization.result.exitCode !== 0) return optimization.result;
    return ok(`${JSON.stringify(optimization.response ?? { optimizedPromptForCodex: optimization.optimizedPrompt ?? prompt }, null, 2)}\n`);
  }

  return fail(1, `unknown command: ${argv.join(" ")}\n${renderHelp()}`);
}

function renderHelp(): string {
  return `agent-sidecar\n\nCommands:\n  agent-sidecar start\n  agent-sidecar status\n  agent-sidecar session start --agent codex --repo . --name demo\n  agent-sidecar session list\n  agent-sidecar session stop --session demo\n  agent-sidecar event command --session demo --command "pnpm test"\n  agent-sidecar event edit --session demo --path src/index.ts\n  agent-sidecar event validation --session demo --command "pnpm test" --status passed\n  agent-sidecar trace show <session-id>\n  agent-sidecar refine [--session <id>] "raw prompt"\n  agent-sidecar steer --session <id>\n  agent-sidecar replay <session-id>\n  agent-sidecar summary export <session-id> --format markdown|json\n  agent-sidecar website\n  agent-sidecar dashboard\n  agent-sidecar daemon start [--dry-run]\n  agent-sidecar codex [--dry-run|--print] "task prompt"\n  agent-sidecar codex-shim install\n  agent-sidecar hook --provider generic|codex|claude-code < event.json\n  agent-sidecar hook install --provider codex|claude-code\n`;
}

async function handleSession(subcommand: string | undefined, args: string[], fetchImpl: typeof fetch, daemonUrl: string, cwd: string): Promise<CliResult> {
  if (subcommand === "start") {
    const now = new Date().toISOString();
    const id = flag(args, "--name") ?? flag(args, "--session") ?? randomUUID();
    const payload = { id, provider: normalizeProvider(flag(args, "--agent")), repoRoot: resolve(cwd, flag(args, "--repo") ?? "."), branch: readGitBranch(cwd), taskSummary: flag(args, "--task"), status: "active", startedAt: now, updatedAt: now };
    const result = await postJsonWithStatus(fetchImpl, `${daemonUrl}/api/runs`, payload, "session start failed");
    if (result.exitCode !== 0) return result;
    const message = result.statusCode === 200 ? `Session ${id} already exists` : `Started session ${id}`;
    return ok(`${message}\n${result.stdout}`);
  }
  if (subcommand === "list") {
    const response = await fetchJson(fetchImpl, `${daemonUrl}/api/runs`, "session list failed");
    if (response.exitCode !== 0) return response;
    const runs = JSON.parse(response.stdout) as JsonRecord[];
    return ok(runs.map((run) => `${run.id}\t${run.provider}\t${run.status}\t${run.repoRoot ?? ""}`).join("\n") + (runs.length ? "\n" : ""));
  }
  if (subcommand === "stop") {
    const session = requireFlag(args, "--session");
    return postEvent(fetchImpl, daemonUrl, buildEventPayload("run_finished", session, args));
  }
  return fail(1, `unknown session command\n${renderHelp()}`);
}

async function handleEvent(subcommand: string | undefined, args: string[], fetchImpl: typeof fetch, daemonUrl: string): Promise<CliResult> {
  const session = requireFlag(args, "--session");
  if (subcommand === "command") return postEvent(fetchImpl, daemonUrl, buildEventPayload("tool_call", session, args, flag(args, "--command")));
  if (subcommand === "edit") return postEvent(fetchImpl, daemonUrl, buildEventPayload("file_edit", session, args));
  if (subcommand === "validation" || subcommand === "test") return postEvent(fetchImpl, daemonUrl, buildEventPayload("validation", session, args, flag(args, "--command")));
  if (subcommand === "failure") return postEvent(fetchImpl, daemonUrl, buildEventPayload("error", session, args));
  return fail(1, `unknown event command\n${renderHelp()}`);
}

async function handleRefine(args: string[], fetchImpl: typeof fetch, daemonUrl: string): Promise<CliResult> {
  const session = flag(args, "--session");
  const prompt = positional(args).join(" ").trim();
  if (!prompt) return fail(1, "missing prompt for refine\n");
  const response = await postJson(fetchImpl, `${daemonUrl}/api/refine`, { prompt, runId: session }, "prompt refine failed");
  if (response.exitCode !== 0) return response;
  const body = JSON.parse(response.stdout) as { optimization: JsonRecord };
  const opt = body.optimization;
  return ok([`Prompt quality: ${opt.shouldInject ? "Low/Needs refinement" : "Acceptable"}`, "Task-cost evidence:", `- Original prompt tokens (estimated): ${estimateTokens(prompt)}`, `- Refined prompt tokens (estimated): ${opt.estimatedOptimizedTokens}`, `- Cost proxy token delta: ${opt.estimatedTokenDelta}`, "- Count improvement only after validation or review passes.", "", "Refined prompt:", opt.optimizedPrompt].join("\n") + "\n");
}

async function handleSteer(args: string[], fetchImpl: typeof fetch, daemonUrl: string): Promise<CliResult> {
  const session = requireFlag(args, "--session");
  const response = await postJson(fetchImpl, `${daemonUrl}/api/runs/${encodeURIComponent(session)}/steering`, {}, "steering failed");
  if (response.exitCode !== 0) return response;
  const decision = JSON.parse(response.stdout) as JsonRecord;
  return ok(renderSteering(decision));
}

async function handleReplay(session: string | undefined, fetchImpl: typeof fetch, daemonUrl: string, label: string): Promise<CliResult> {
  if (!session) return fail(1, `missing session id for ${label}\n`);
  const response = await fetchJson(fetchImpl, `${daemonUrl}/api/runs/${encodeURIComponent(session)}/demo`, `${label} failed`);
  if (response.exitCode !== 0) return response;
  return ok(renderReplay(JSON.parse(response.stdout) as JsonRecord));
}

async function handleSummaryExport(args: string[], fetchImpl: typeof fetch, daemonUrl: string): Promise<CliResult> {
  const session = args.find((arg) => !arg.startsWith("--") && arg !== "export");
  if (!session) return fail(1, "missing session id for summary export\n");
  const format = flag(args, "--format") ?? "markdown";
  const response = await fetchJson(fetchImpl, `${daemonUrl}/api/runs/${encodeURIComponent(session)}/demo`, "summary export failed");
  if (response.exitCode !== 0) return response;
  const replay = JSON.parse(response.stdout) as JsonRecord;
  return ok(format === "json" ? `${JSON.stringify(replay, null, 2)}\n` : renderMarkdownSummary(replay));
}

type WebAppTarget = "website" | "dashboard";

async function handleWebApp(
  target: WebAppTarget,
  spawnImpl: typeof spawn,
  fetchImpl: typeof fetch,
  env: Record<string, string | undefined>
): Promise<CliResult> {
  const host = env.AGENT_SIDECAR_DASHBOARD_HOST ?? DEFAULT_DASHBOARD_HOST;
  const requestedPort = parsePort(env.AGENT_SIDECAR_DASHBOARD_PORT ?? env.PORT, DEFAULT_DASHBOARD_PORT);
  const scanLimit = parsePort(env.AGENT_SIDECAR_DASHBOARD_PORT_SCAN_LIMIT, 100);
  const port = await findAvailablePort(requestedPort, host, scanLimit);
  const baseUrl = formatLocalUrl(host, port);
  const route = target === "dashboard" ? "/dashboard" : "/";
  const url = `${baseUrl}${route === "/" ? "" : route}`;
  const child = spawnImpl("pnpm", [target === "dashboard" ? "dev:dashboard" : "dev:website"], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      ...env,
      AGENT_SIDECAR_DASHBOARD_HOST: host,
      AGENT_SIDECAR_DASHBOARD_PORT: String(port),
      AGENT_SIDECAR_DASHBOARD_ROUTE: route,
      PORT: String(port)
    }
  });
  child.unref();
  const ready = await waitForHttp(fetchImpl, url, parsePort(env.AGENT_SIDECAR_DASHBOARD_OPEN_TIMEOUT_MS, 10_000));
  openInDefaultBrowser(url, spawnImpl);
  return ok([
    `agent-sidecar ${target} start requested (pid ${child.pid ?? "unknown"})`,
    `${target} URL: ${url}`,
    ready ? `opened ${target} in default browser` : `opened ${target} in default browser; server may still be starting`
  ].join("\n") + "\n");
}

async function handleCodexPrompt(
  args: string[],
  fetchImpl: typeof fetch,
  daemonUrl: string,
  spawnImpl: typeof spawn,
  env: Record<string, string | undefined>,
  cwd: string,
  stdin?: string
): Promise<CliResult> {
  const invocation = parseCodexInvocation(args, stdin);
  const realCodex = invocation.realCodex ?? resolveRealCodex(env);

  if (invocation.noOptimize || !invocation.prompt) {
    return runExternalCommand(spawnImpl, realCodex, invocation.codexArgs, env);
  }

  const optimization = await optimizeCodexPrompt(fetchImpl, daemonUrl, invocation.prompt, cwd, env);
  if (optimization.result.exitCode !== 0) return optimization.result;

  const finalPrompt = optimization.optimizedPrompt ?? invocation.prompt;
  const codexArgs = replacePromptArg(invocation.codexArgs, invocation.promptStartIndex, invocation.promptEndIndex, finalPrompt);

  if (invocation.printOnly) {
    return ok(`${finalPrompt}\n`);
  }

  if (invocation.dryRun) {
    return ok(`${JSON.stringify({
      realCodex,
      originalPrompt: invocation.prompt,
      optimizedPrompt: finalPrompt,
      optimized: finalPrompt !== invocation.prompt,
      codexArgs
    }, null, 2)}\n`);
  }

  return runExternalCommand(spawnImpl, realCodex, codexArgs, env);
}

function handleCodexShim(
  subcommand: string | undefined,
  args: string[],
  env: Record<string, string | undefined>
): CliResult {
  if (subcommand === "path") {
    return ok(`${codexShimPath(env)}\n`);
  }

  if (subcommand !== "install") {
    return fail(1, `unknown codex-shim command\n${renderHelp()}`);
  }

  const shimPath = codexShimPath(env);
  const shimDir = dirname(shimPath);
  const realCodex = flag(args, "--real-codex") ?? resolveRealCodex(env, shimDir);
  const cliEntry = fileURLToPath(import.meta.url);

  mkdirSync(shimDir, { recursive: true });
  writeFileSync(shimPath, [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `export AGENT_SIDECAR_REAL_CODEX=${shellQuote(realCodex)}`,
    `exec ${shellQuote(process.execPath)} ${shellQuote(cliEntry)} codex "$@"`,
    ""
  ].join("\n"));
  chmodSync(shimPath, 0o755);

  return ok([
    `Installed Codex interception shim at ${shimPath}`,
    `Real Codex binary: ${realCodex}`,
    "",
    "Add this directory before the real Codex binary on PATH:",
    `export PATH=${shellQuote(shimDir)}":$PATH"`,
    "",
    "Then run:",
    "codex \"Prompt: fix auth refresh; preserve unrelated session behavior\""
  ].join("\n") + "\n");
}

function buildEventPayload(eventType: string, session: string, args: string[], command?: string): JsonRecord {
  const now = new Date().toISOString();
  const status = flag(args, "--status");
  const path = flag(args, "--path");
  return {
    id: flag(args, "--id") ?? randomUUID(), runId: session, agent: "generic", eventType, timestamp: now, actor: "user",
    summary: flag(args, "--summary") ?? command ?? (path ? `Edited ${path}` : eventType), compactMetadata: {},
    ...(command ? { command: { type: eventType === "validation" ? "test" : "shell", executable: command.split(/\s+/)[0] ?? "command", args: command.split(/\s+/).slice(1), normalized: command, riskLevel: "low", toolKind: eventType === "validation" ? "test_runner" : "shell" } } : {}),
    ...(path ? { fileEdit: { paths: [path], operation: "modify", filesChanged: 1 } } : {}),
    ...(eventType === "validation" ? { validation: { command: command ?? "validation", commandType: "test", status: status === "failed" ? "failed" : status === "unknown" ? "unknown" : "passed", summary: flag(args, "--summary") ?? status ?? "validation", completedAt: now } } : {})
  };
}

async function postEvent(fetchImpl: typeof fetch, daemonUrl: string, payload: JsonRecord): Promise<CliResult> {
  const result = await postJson(fetchImpl, `${daemonUrl}/api/events`, payload, "event failed");
  return result.exitCode === 0 ? ok(`Recorded event ${payload.id} for session ${payload.runId}\n${result.stdout}`) : result;
}

function renderSteering(decision: JsonRecord): string {
  const findings = Array.isArray(decision.findings) ? decision.findings as JsonRecord[] : [];
  return [`Steering decision: ${String(decision.action ?? "continue").toUpperCase()}`, `Confidence: ${Number(decision.confidence ?? 0).toFixed(2)}`, "", "Evaluators fired:", ...(findings.length ? findings.map((f) => `- ${f.detectorId ?? f.reasonCode}`) : ["- none"]), "", "Recommended next step:", String(decision.recommendedNextStep ?? decision.message ?? "Continue."), ""].join("\n");
}

function renderReplay(replay: JsonRecord): string {
  const run = replay.run as JsonRecord; const events = (replay.events as JsonRecord[]) ?? []; const decisions = (replay.decisions as JsonRecord[]) ?? []; const opts = (replay.promptOptimizations as JsonRecord[]) ?? [];
  return [`Run ${run.id}`, `Status: ${run.status}`, `Task-cost evidence: $${Number(run.totalEstimatedCostUsd ?? 0).toFixed(4)} provider cost, ${Number(run.totalInputTokens ?? 0) + Number(run.totalOutputTokens ?? 0)} tokens`, "", "Timeline:", ...events.map((e) => `- ${e.timestamp} ${e.eventType}: ${e.summary}`), "", "Prompt refinements:", ...(opts.length ? opts.map((o) => `- ${(o.result as JsonRecord).rewriteReason}: cost proxy Δ${(o.result as JsonRecord).estimatedTokenDelta} tokens`) : ["- none"]), "", "Steering/decisions:", ...(decisions.length ? decisions.map((d) => `- ${d.action}: ${d.reasonCode} — ${d.message}`) : ["- none"]), ""].join("\n");
}

function renderMarkdownSummary(replay: JsonRecord): string {
  return `# Agent Sidecar Run Summary\n\n${renderReplay(replay).replace(/^Run /, "Run: ")}\n`;
}

type CodexInvocation = {
  codexArgs: string[];
  dryRun: boolean;
  noOptimize: boolean;
  printOnly: boolean;
  prompt?: string;
  promptEndIndex?: number;
  promptStartIndex?: number;
  realCodex?: string;
};

const CODEX_OPTIONS_WITH_VALUE = new Set([
  "-a",
  "--add-dir",
  "--ask-for-approval",
  "-c",
  "--cd",
  "--config",
  "-C",
  "-i",
  "--image",
  "--local-provider",
  "-m",
  "--model",
  "-p",
  "--profile",
  "--remote",
  "--remote-auth-token-env",
  "-s",
  "--sandbox"
]);
const CODEX_SUBCOMMANDS = new Set([
  "exec",
  "e",
  "review",
  "login",
  "logout",
  "mcp",
  "plugin",
  "mcp-server",
  "app-server",
  "remote-control",
  "app",
  "completion",
  "update",
  "doctor",
  "sandbox",
  "debug",
  "apply",
  "a",
  "resume",
  "fork",
  "cloud",
  "exec-server",
  "features",
  "help"
]);

function parseCodexInvocation(args: string[], stdin?: string): CodexInvocation {
  const codexArgs: string[] = [];
  let dryRun = false;
  let noOptimize = false;
  let printOnly = false;
  let realCodex: string | undefined;
  let passThrough = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;

    if (!passThrough && arg === "--") {
      passThrough = true;
      continue;
    }

    if (!passThrough && arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (!passThrough && arg === "--print") {
      printOnly = true;
      continue;
    }

    if (!passThrough && arg === "--no-optimize") {
      noOptimize = true;
      continue;
    }

    if (!passThrough && arg === "--real-codex") {
      realCodex = args[index + 1];
      index += 1;
      continue;
    }

    codexArgs.push(arg);
  }

  const promptRange = findCodexPromptRange(codexArgs);
  const stdinPrompt = stdin?.trim();
  const prompt = promptRange ? stripPromptLabel(codexArgs.slice(promptRange.start, promptRange.end + 1).join(" ")) : stdinPrompt ? stripPromptLabel(stdinPrompt) : undefined;
  return { codexArgs, dryRun, noOptimize, printOnly, prompt, promptStartIndex: promptRange?.start, promptEndIndex: promptRange?.end, realCodex };
}

function findCodexPromptRange(args: string[]): { start: number; end: number } | undefined {
  let promptStartIndex: number | undefined;
  let promptEndIndex: number | undefined;
  let skipNext = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;

    if (skipNext) {
      skipNext = false;
      continue;
    }

    if (index === 0 && CODEX_SUBCOMMANDS.has(arg)) {
      continue;
    }

    if (arg.startsWith("-")) {
      const optionName = arg.includes("=") ? arg.split("=", 1)[0] ?? arg : arg;
      skipNext = CODEX_OPTIONS_WITH_VALUE.has(optionName);
      continue;
    }

    promptStartIndex ??= index;
    promptEndIndex = index;
  }

  return promptStartIndex === undefined || promptEndIndex === undefined ? undefined : { start: promptStartIndex, end: promptEndIndex };
}

function replacePromptArg(args: string[], promptStartIndex: number | undefined, promptEndIndex: number | undefined, prompt: string): string[] {
  if (promptStartIndex === undefined || promptEndIndex === undefined) {
    return [...args, prompt];
  }

  return [
    ...args.slice(0, promptStartIndex),
    prompt,
    ...args.slice(promptEndIndex + 1)
  ];
}

function stripPromptLabel(prompt: string): string {
  return prompt.replace(/^\s*prompt\s*:\s*/i, "").trim();
}

function parseTaskPrompt(args: string[], stdin?: string): string { return args.filter(Boolean).join(" ").trim() || (stdin ?? "").trim(); }
function parseProvider(args: string[]): HookProvider { return normalizeProvider(flag(args, "--provider") ?? flag(args, "-p") ?? args.find((arg) => ["generic", "codex", "claude", "claude-code"].includes(arg))); }
function normalizeProvider(raw?: string): HookProvider { if (raw === "codex") return "codex"; if (raw === "claude" || raw === "claude-code") return "claude-code"; return "generic"; }
function parseStdinPayload(stdin: string): unknown { return stdin.trim() ? JSON.parse(stdin) : {}; }
function parseJsonRecord(value: string): JsonRecord { try { return asRecord(JSON.parse(value)); } catch { return {}; } }
function asRecord(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function stringField(value: unknown): string | undefined { return typeof value === "string" && value.length > 0 ? value : undefined; }
function isRealtimePromptHook(provider: HookProvider, payload: unknown): boolean {
  if (provider !== "codex") return false;
  const body = asRecord(payload);
  const eventName = [
    body.hook_event_name,
    body.providerEventType,
    body.eventType,
    body.event_type,
    body.type
  ].map((value) => stringField(value)?.toLowerCase()).filter((value): value is string => Boolean(value)).join(" ");
  return Boolean(
    stringField(body.prompt) || stringField(body.userPrompt) || stringField(body.user_prompt) ||
    eventName.includes("userpromptsubmit") || eventName === "prompt" || eventName.includes("prompt_submit")
  );
}
function flag(args: string[], name: string): string | undefined { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; }
function requireFlag(args: string[], name: string): string { const value = flag(args, name); if (!value) throw new Error(`missing ${name}`); return value; }
function positional(args: string[]): string[] { const values: string[] = []; for (let i=0;i<args.length;i++) { const arg = args[i]; if (!arg) continue; if (arg.startsWith("--")) { i++; } else values.push(arg); } return values; }

async function postHook(
  fetchImpl: typeof fetch,
  daemonUrl: string,
  provider: HookProvider,
  payload: unknown,
  env: Record<string, string | undefined>,
  cwd: string
): Promise<CliResult> {
  const endpointProvider = provider === "claude-code" ? "claude" : provider;
  const hookPayload = enrichRealtimePromptPayload(provider, payload, cwd, env);
  try {
    const result = await postJson(fetchImpl, `${daemonUrl}/hooks/${endpointProvider}`, hookPayload, "hook request failed");
    if (result.exitCode !== 0 && result.stderr.includes("daemon unavailable at ")) {
      throw new Error(result.stderr.trim());
    }
    return renderHookResult(provider, hookPayload, result);
  }
  catch (error) { const failMode = env.AGENT_SIDECAR_FAIL_MODE === "closed" ? "closed" : "open"; const fallback = { action: failMode === "closed" ? "block" : "allow", reason: `daemon_unavailable_fail_${failMode}`, message: `Agent Sidecar daemon unavailable at ${daemonUrl}: ${errorMessage(error)}` }; return { exitCode: failMode === "closed" ? 2 : 0, stdout: `${JSON.stringify(fallback)}\n`, stderr: failMode === "closed" ? `${fallback.message}\n` : "" }; }
}

function enrichRealtimePromptPayload(provider: HookProvider, payload: unknown, cwd: string, env: Record<string, string | undefined>): unknown {
  if (!isRealtimePromptHook(provider, payload)) {
    return payload;
  }

  const body = asRecord(payload);
  return {
    ...body,
    cwd: stringField(body.cwd) ?? cwd,
    repoRoot: stringField(body.repoRoot) ?? stringField(body.repo_root) ?? cwd,
    branch: stringField(body.branch) ?? readGitBranch(cwd),
    realtimePromptInterception: true,
    contextSnapshot: Object.keys(asRecord(body.contextSnapshot)).length > 0 ? body.contextSnapshot : collectRepoContext(cwd, env)
  };
}

function renderHookResult(provider: HookProvider, payload: unknown, result: CliResult): CliResult {
  if (result.exitCode !== 0 || provider !== "codex" || !isRealtimePromptHook(provider, payload)) {
    return result;
  }

  const body = parseJsonRecord(result.stdout);
  const optimization = asRecord(body.prompt_optimization);
  const optimizedPrompt = stringField(optimization.optimizedPrompt);
  if (!optimizedPrompt) {
    return result;
  }

  const response = stripUndefined({
    action: stringField(body.action) ?? "inject_context",
    reason: stringField(body.reason) ?? "prompt_optimized",
    message: "Agent Sidecar optimized this prompt before Codex execution.",
    optimizedPrompt,
    optimizedPromptForCodex: optimizedPrompt,
    promptReplacement: optimizedPrompt,
    promptAppend: `\n\nAgent Sidecar optimized task:\n${optimizedPrompt}`,
    codex: {
      hookEventName: stringField(asRecord(payload).hook_event_name) ?? stringField(asRecord(payload).providerEventType) ?? "UserPromptSubmit",
      realtimePromptOptimized: true,
      promptReplacement: optimizedPrompt,
      additionalContext: optimizedPrompt
    },
    run: body.run,
    event: body.event,
    decision: body.decision,
    costEvidence: body.cost_evidence,
    promptOptimization: {
      id: optimization.id,
      runId: optimization.runId,
      eventId: optimization.eventId,
      mode: optimization.mode,
      optimizedPrompt,
      estimatedOptimizedTokens: optimization.estimatedOptimizedTokens,
      estimatedTokenDelta: optimization.estimatedTokenDelta,
      rewriteReason: optimization.rewriteReason,
      deterministicOrModel: optimization.deterministicOrModel
    }
  });

  return ok(`${JSON.stringify(response)}\n`);
}

async function postJson(fetchImpl: typeof fetch, url: string, payload: unknown, label: string): Promise<CliResult> {
  return postJsonWithStatus(fetchImpl, url, payload, label);
}
async function postJsonWithStatus(fetchImpl: typeof fetch, url: string, payload: unknown, label: string): Promise<CliResult & { statusCode?: number }> {
  try {
    const response = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.text();
    return response.ok ? { ...ok(`${body}\n`), statusCode: response.status } : fail(1, `${label}: ${response.status}\n${body}\n`);
  } catch (error) {
    return fail(1, `${label}: ${daemonUnavailableMessage(url, error)}`);
  }
}
async function fetchJson(fetchImpl: typeof fetch, url: string, label: string): Promise<CliResult> { try { const response = await fetchImpl(url); const body = await response.text(); return response.ok ? ok(`${body}\n`) : fail(1, `${label}: ${response.status}\n${body}\n`); } catch (error) { return fail(1, `${label}: ${daemonUnavailableMessage(url, error)}`); } }
async function getText(fetchImpl: typeof fetch, url: string, label: string): Promise<CliResult> { try { const response = await fetchImpl(url); const body = await response.text(); return response.ok ? ok(`${body}\n`) : fail(1, `${label}: ${response.status}\n${body}\n`); } catch (error) { return fail(1, daemonUnavailableMessage(url, error)); } }

async function optimizeCodexPrompt(fetchImpl: typeof fetch, daemonUrl: string, prompt: string, cwd: string, env: Record<string, string | undefined>): Promise<CodexPromptResult> {
  const payload = { id: randomUUID(), runId: randomUUID(), providerEventType: "UserPromptSubmit", prompt, cwd, repoRoot: cwd, branch: readGitBranch(cwd), sidecarSubmission: true, contextSnapshot: collectRepoContext(cwd, env) };
  const result = await postHook(fetchImpl, daemonUrl, "codex", payload, env, cwd);
  if (result.exitCode !== 0) return { originalPrompt: prompt, result };

  try {
    const response = JSON.parse(result.stdout) as JsonRecord;
    const optimizedPromptForCodex =
      stringField(response.optimizedPromptForCodex) ??
      stringField(asRecord(response.promptOptimization).optimizedPrompt) ??
      stringField(asRecord(response.prompt_optimization).optimizedPrompt);
    return {
      originalPrompt: prompt,
      optimizedPrompt: optimizedPromptForCodex,
      response: stripUndefined({ ...response, optimizedPromptForCodex }),
      result
    };
  } catch {
    return { originalPrompt: prompt, result };
  }
}

export function collectRepoContext(cwd: string, env: Record<string, string | undefined> = process.env): Record<string, unknown> {
  const cacheTtlMs = repoContextCacheTtlMs(env);
  if (repoContextCacheDisabled(env) || cacheTtlMs <= 0) return readRepoContext(cwd);

  const fingerprint = buildRepoContextFingerprint(cwd);
  const now = Date.now();
  const cache = readRepoContextCache(env);
  const cached = cache.entries.find((entry) =>
    entry.cacheKey === fingerprint.cacheKey &&
    entry.fingerprint === fingerprint.fingerprint &&
    now - entry.updatedAt <= cacheTtlMs
  );
  if (cached) return cached.snapshot;

  const snapshot = readRepoContext(cwd, fingerprint);
  writeRepoContextCache(env, {
    version: REPO_CONTEXT_CACHE_VERSION,
    entries: [
      { cacheKey: fingerprint.cacheKey, fingerprint: fingerprint.fingerprint, updatedAt: now, snapshot },
      ...cache.entries.filter((entry) => entry.cacheKey !== fingerprint.cacheKey)
    ].slice(0, MAX_REPO_CONTEXT_CACHE_ENTRIES)
  });
  return snapshot;
}

function readRepoContext(cwd: string, fingerprint?: RepoContextFingerprint): Record<string, unknown> {
  return {
    repoType: fingerprint?.repoType ?? detectRepoType(cwd),
    agentsInstructions: readOptionalFile(join(cwd, "AGENTS.md"), 2_000),
    previousPlans: readPreviousPlans(cwd),
    fileTree: readFileTree(cwd),
    activeBranch: fingerprint?.activeBranch ?? readGitBranch(cwd),
    relevantDiffs: fingerprint?.relevantDiffs ?? readGitDiff(cwd)
  };
}

function buildRepoContextFingerprint(cwd: string): RepoContextFingerprint {
  const normalizedCwd = resolve(cwd);
  const repoType = detectRepoType(cwd);
  const activeBranch = readGitBranch(cwd);
  const relevantDiffs = readGitDiff(cwd);
  const gitDir = readGitDir(cwd);
  const payload = {
    cwd: normalizedCwd,
    repoType,
    activeBranch,
    head: readGitHead(cwd),
    relevantDiffs,
    gitIndex: gitDir ? fileSignature(join(gitDir, "index")) : undefined,
    watchedFiles: [
      "AGENTS.md",
      "docs/IMPLEMENTATION_PLAN.md",
      "docs/MVP_PROMPTS.md",
      "package.json",
      "pyproject.toml",
      "Cargo.toml",
      "go.mod"
    ].map((path) => fileSignature(join(cwd, path)))
  };
  return { cacheKey: stableHash(normalizedCwd), fingerprint: stableHash(payload), repoType, activeBranch, relevantDiffs };
}

function readRepoContextCache(env: Record<string, string | undefined>): RepoContextCacheFile {
  try {
    const parsed = asRecord(JSON.parse(readFileSync(repoContextCachePath(env), "utf8")));
    if (parsed.version !== REPO_CONTEXT_CACHE_VERSION || !Array.isArray(parsed.entries)) {
      return emptyRepoContextCache();
    }
    return {
      version: REPO_CONTEXT_CACHE_VERSION,
      entries: parsed.entries.map(parseRepoContextCacheEntry).filter((entry): entry is RepoContextCacheEntry => Boolean(entry))
    };
  } catch {
    return emptyRepoContextCache();
  }
}

function writeRepoContextCache(env: Record<string, string | undefined>, cache: RepoContextCacheFile): void {
  const cachePath = repoContextCachePath(env);
  const tempPath = `${cachePath}.${process.pid}.tmp`;
  try {
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(tempPath, JSON.stringify(cache));
    renameSync(tempPath, cachePath);
  } catch {
    try { if (existsSync(tempPath)) unlinkSync(tempPath); } catch { }
  }
}

function parseRepoContextCacheEntry(value: unknown): RepoContextCacheEntry | undefined {
  const entry = asRecord(value);
  if (typeof entry.cacheKey !== "string" || typeof entry.fingerprint !== "string" || typeof entry.updatedAt !== "number") {
    return undefined;
  }
  const snapshot = asRecord(entry.snapshot);
  if (Object.keys(snapshot).length === 0) return undefined;
  return { cacheKey: entry.cacheKey, fingerprint: entry.fingerprint, updatedAt: entry.updatedAt, snapshot };
}

function emptyRepoContextCache(): RepoContextCacheFile { return { version: REPO_CONTEXT_CACHE_VERSION, entries: [] }; }
function repoContextCachePath(env: Record<string, string | undefined>): string { return join(env.AGENT_SIDECAR_STATE_DIR ?? DEFAULT_STATE_DIR, "repo-context-cache.json"); }
function repoContextCacheDisabled(env: Record<string, string | undefined>): boolean {
  const value = env.AGENT_SIDECAR_REPO_CONTEXT_CACHE?.toLowerCase();
  return value === "off" || value === "false" || value === "0" || value === "no";
}
function repoContextCacheTtlMs(env: Record<string, string | undefined>): number {
  const parsed = Number.parseInt(env.AGENT_SIDECAR_REPO_CONTEXT_CACHE_TTL_MS ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_REPO_CONTEXT_CACHE_TTL_MS;
}
function stableHash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function fileSignature(path: string): Record<string, unknown> {
  try {
    const stats = statSync(path);
    return { path, exists: true, size: stats.size, mtimeMs: Math.trunc(stats.mtimeMs) };
  } catch {
    return { path, exists: false };
  }
}
function detectRepoType(cwd: string): string { if (existsSync(join(cwd, "package.json"))) return "node"; if (existsSync(join(cwd, "pyproject.toml"))) return "python"; if (existsSync(join(cwd, "Cargo.toml"))) return "rust"; if (existsSync(join(cwd, "go.mod"))) return "go"; return "unknown"; }
function readPreviousPlans(cwd: string): string[] { return ["docs/IMPLEMENTATION_PLAN.md", "docs/MVP_PROMPTS.md"].map((path) => { const content = readOptionalFile(join(cwd, path), 800); return content ? `${path}\n${content}` : undefined; }).filter((value): value is string => Boolean(value)); }
function readFileTree(cwd: string): string[] { try { return readGitStdout(cwd, ["ls-files"]).split("\n").filter(Boolean).slice(0, 100); } catch { return []; } }
function readGitBranch(cwd: string): string | undefined { try { return readGitStdout(cwd, ["branch", "--show-current"]).trim() || undefined; } catch { return undefined; } }
function readGitHead(cwd: string): string | undefined { try { return readGitStdout(cwd, ["rev-parse", "HEAD"]).trim() || undefined; } catch { return undefined; } }
function readGitDir(cwd: string): string | undefined { try { const gitDir = readGitStdout(cwd, ["rev-parse", "--git-dir"]).trim(); return gitDir ? resolve(cwd, gitDir) : undefined; } catch { return undefined; } }
function readGitDiff(cwd: string): string { try { return readGitStdout(cwd, ["diff", "--stat"]).slice(0, 1_500); } catch { return ""; } }
function readGitStdout(cwd: string, args: string[]): string { return execFileSync("git", args, { cwd, encoding: "utf8", timeout: 2_000, stdio: ["ignore", "pipe", "ignore"] }); }
function readOptionalFile(path: string, maxLength: number): string { try { return existsSync(path) ? readFileSync(path, "utf8").slice(0, maxLength) : ""; } catch { return ""; } }
function renderHookInstall(provider: HookProvider): Record<string, unknown> {
  const command = provider === "codex" ? "agent-sidecar codex-shim install" : provider === "claude-code" ? "agent-sidecar hook --provider claude-code" : `agent-sidecar hook --provider ${provider}`;
  return {
    provider,
    command,
    mode: provider === "codex" ? "terminal-shim" : "stdin-json",
    realtimePromptOptimization: provider === "codex",
    events: provider === "codex" ? ["terminal prompt argv", "stdin prompt"] : ["prompt", "tool", "validation"],
    stdoutContract: provider === "codex"
      ? {
          behavior: "codex shim optimizes the prompt, then launches the real Codex binary with the optimized prompt",
          installPath: "~/.agent-sidecar/bin/codex",
          codex: {
            launchedWithOptimizedPrompt: true
          }
        }
      : undefined,
    note: provider === "codex"
      ? "Install the shim and put ~/.agent-sidecar/bin before the real Codex binary on PATH. Then codex \"prompt\" is optimized before the real Codex process starts."
      : "Configure the agent runtime to pipe hook event JSON to this command."
  };
}

function codexShimPath(env: Record<string, string | undefined>): string {
  return join(env.AGENT_SIDECAR_SHIM_DIR ?? join(homedir(), ".agent-sidecar", "bin"), "codex");
}

function resolveRealCodex(env: Record<string, string | undefined>, shimDir?: string): string {
  if (env.AGENT_SIDECAR_REAL_CODEX) {
    return env.AGENT_SIDECAR_REAL_CODEX;
  }

  const candidates = (env.PATH ?? process.env.PATH ?? "").split(delimiter)
    .filter(Boolean)
    .filter((pathEntry) => !shimDir || resolve(pathEntry) !== resolve(shimDir))
    .map((pathEntry) => join(pathEntry, process.platform === "win32" ? "codex.cmd" : "codex"));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  for (const fallback of ["/opt/homebrew/bin/codex", "/usr/local/bin/codex"]) {
    if (existsSync(fallback)) {
      return fallback;
    }
  }

  throw new Error("Could not find the real Codex binary. Set AGENT_SIDECAR_REAL_CODEX=/path/to/codex.");
}

function runExternalCommand(
  spawnImpl: typeof spawn,
  command: string,
  args: string[],
  env: Record<string, string | undefined>
): Promise<CliResult> {
  return new Promise((resolveResult) => {
    const child = spawnImpl(command, args, {
      stdio: "inherit",
      env: {
        ...process.env,
        ...env,
        AGENT_SIDECAR_INTERCEPTED: "1"
      }
    });

    child.on("error", (error) => {
      resolveResult(fail(1, `failed to launch Codex: ${errorMessage(error)}\n`));
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        resolveResult(fail(128, `Codex exited from signal ${signal}\n`));
        return;
      }

      resolveResult({ exitCode: code ?? 1, stdout: "", stderr: "" });
    });
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function startDaemonProcess(spawnImpl: typeof spawn, env: Record<string, string | undefined>): string { const entry = resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/daemon/dist/index.js"); const child = spawnImpl(process.execPath, [entry], { detached: true, stdio: "ignore", env: { ...process.env, ...env } }); child.unref(); return `pid ${child.pid ?? "unknown"}`; }
function estimateTokens(text: string): number { return Math.max(1, Math.ceil(text.trim().length / 4)); }
function readStdin(): string { try { return readFileSync(0, "utf8"); } catch { return ""; } }
function readDaemonStateUrl(env: Record<string, string | undefined>): string | undefined {
  const statePath = join(env.AGENT_SIDECAR_STATE_DIR ?? DEFAULT_STATE_DIR, "daemon.json");
  try {
    const state = JSON.parse(readFileSync(statePath, "utf8")) as JsonRecord;
    if (typeof state.url !== "string") return undefined;
    if (typeof state.pid === "number" && !isLiveProcess(state.pid)) return undefined;
    return state.url.replace(/\/$/, "");
  } catch {
    return undefined;
  }
}
function isLiveProcess(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function ok(stdout: string): CliResult { return { exitCode: 0, stdout, stderr: "" }; }
function fail(exitCode: number, stderr: string): CliResult { return { exitCode, stdout: "", stderr }; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function daemonUnavailableMessage(url: string, error: unknown): string {
  return `daemon unavailable at ${requestOrigin(url)}: ${errorMessage(error)}\nRun \`agent-sidecar start\` to launch the daemon on the first available port.\n`;
}
function requestOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url.replace(/\/health$/, "");
  }
}
function stripUndefined<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function parsePort(value: string | undefined, fallback: number): number { const parsed = Number.parseInt(value ?? "", 10); return Number.isInteger(parsed) && parsed > 0 && parsed <= MAX_PORT ? parsed : fallback; }
function formatLocalUrl(host: string, port: number): string { const browserHost = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host; const formattedHost = browserHost.includes(":") && !browserHost.startsWith("[") ? `[${browserHost}]` : browserHost; return `http://${formattedHost}:${port}`; }
async function resolveDaemonStartUrl(env: Record<string, string | undefined>): Promise<string> {
  const host = env.AGENT_SIDECAR_HOST ?? DEFAULT_DAEMON_HOST;
  const requestedPort = parsePort(env.AGENT_SIDECAR_PORT, DEFAULT_DAEMON_PORT);
  const scanLimit = parsePort(env.AGENT_SIDECAR_PORT_SCAN_LIMIT, 100);
  const port = await findAvailablePort(requestedPort, host, scanLimit, "daemon");
  return formatLocalUrl(host, port);
}
async function findAvailablePort(startPort: number, host: string, maxAttempts: number, label = "dashboard"): Promise<number> { for (let port = startPort; port <= MAX_PORT && port < startPort + maxAttempts; port += 1) { if (await isPortAvailable(port, host)) return port; } throw new Error(`no available ${label} port found from ${startPort} after ${maxAttempts} attempts`); }
function isPortAvailable(port: number, host: string): Promise<boolean> { return new Promise((resolve, reject) => { const tester = createServer(); tester.once("error", (error: NodeJS.ErrnoException) => { if (error.code === "EADDRINUSE" || error.code === "EACCES") { resolve(false); return; } reject(error); }); tester.once("listening", () => { tester.close((error) => { if (error) { reject(error); return; } resolve(true); }); }); tester.listen({ port, host, exclusive: true }); }); }
async function waitForHttp(fetchImpl: typeof fetch, url: string, timeoutMs: number): Promise<boolean> { const deadline = Date.now() + timeoutMs; while (Date.now() < deadline) { try { const response = await fetchImpl(url); if (response.ok) return true; } catch { } await new Promise((resolve) => setTimeout(resolve, 250)); } return false; }
function openInDefaultBrowser(url: string, spawnImpl: typeof spawn): void { const [command, args] = browserCommand(url); const child = spawnImpl(command, args, { detached: true, stdio: "ignore" }); child.on?.("error", () => undefined); child.unref(); }
function browserCommand(url: string): [string, string[]] { if (process.platform === "darwin") return ["open", [url]]; if (process.platform === "win32") return ["cmd", ["/c", "start", "", url]]; return ["xdg-open", [url]]; }

if (process.argv[1]?.endsWith("agent-sidecar") || process.argv[1]?.endsWith("index.js")) {
  try {
    const result = await runCli(process.argv.slice(2));
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`${errorMessage(error)}\n`);
    process.exitCode = 1;
  }
}
