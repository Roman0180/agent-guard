#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const USAGE = `SWE-bench runner for Agent Sidecar

Commands:
  node scripts/swebench-runner.mjs run --instances <jsonl> --repos-dir <dir> --out-dir <dir> --agent baseline|sidecar [--limit N]
  node scripts/swebench-runner.mjs summarize --baseline-predictions <jsonl> --sidecar-predictions <jsonl> --baseline-results <json|jsonl> --sidecar-results <json|jsonl> --out <json>

Run command options:
  --codex-bin <path>        Codex command for baseline runs. Default: AGENT_SIDECAR_REAL_CODEX or codex
  --sidecar-bin <path>      Agent Sidecar command. Default: agent-sidecar
  --timeout-ms <number>     Per-task timeout. Default: 1800000
  --dry-run                Write prompts and metadata without launching agents

Expected instance fields: instance_id, repo, base_commit, problem_statement.
Repository lookup: <repos-dir>/<instance_id>, then <repos-dir>/<repo basename>, then <repos-dir>/<repo with / replaced by __>.
`;

const rawArgv = process.argv.slice(2);
if (rawArgv[0] === "--") rawArgv.shift();
const [command, ...argv] = rawArgv;
const args = parseArgs(argv);

try {
  if (command === "run") await runCommand(args);
  else if (command === "summarize") summarizeCommand(args);
  else die(USAGE);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function runCommand(args) {
  const instancesPath = required(args, "instances");
  const reposDir = resolve(required(args, "repos-dir"));
  const outDir = resolve(required(args, "out-dir"));
  const agent = required(args, "agent");
  if (!["baseline", "sidecar"].includes(agent)) die("--agent must be baseline or sidecar");
  const limit = args.limit ? Number(args.limit) : undefined;
  const timeoutMs = Number(args["timeout-ms"] ?? 1_800_000);
  const dryRun = Boolean(args["dry-run"]);
  const codexBin = args["codex-bin"] ?? process.env.AGENT_SIDECAR_REAL_CODEX ?? "codex";
  const sidecarBin = args["sidecar-bin"] ?? "agent-sidecar";

  mkdirSync(outDir, { recursive: true });
  const predictionsPath = join(outDir, `predictions-${agent}.jsonl`);
  const costsPath = join(outDir, `costs-${agent}.jsonl`);
  const logsDir = join(outDir, "logs", agent);
  mkdirSync(logsDir, { recursive: true });

  const instances = readJsonl(instancesPath).slice(0, limit);
  const predictions = [];
  const costs = [];

  for (const instance of instances) {
    const instanceId = stringField(instance, "instance_id");
    const repoDir = findRepoDir(reposDir, instance);
    const runId = `swebench-${agent}-${slug(instanceId)}-${shortHash(`${Date.now()}-${instanceId}`)}`;
    const prompt = buildPrompt(instance);
    const logPath = join(logsDir, `${slug(instanceId)}.log`);

    await git(repoDir, ["reset", "--hard", stringField(instance, "base_commit")]);
    await git(repoDir, ["clean", "-fdx"]);

    let status = "dry_run";
    let exitCode = 0;
    if (!dryRun) {
      const result = agent === "sidecar"
        ? await runProcess(sidecarBin, ["codex", prompt], repoDir, timeoutMs, { AGENT_SIDECAR_SWEBENCH_RUN_ID: runId })
        : await runProcess(codexBin, [prompt], repoDir, timeoutMs, {});
      status = result.timedOut ? "timeout" : result.exitCode === 0 ? "completed" : "failed";
      exitCode = result.exitCode;
      writeFileSync(logPath, result.stdout + result.stderr);
    } else {
      writeFileSync(logPath, `${prompt}\n`);
    }

    const patch = dryRun ? "" : await captureGitDiff(repoDir);
    predictions.push({ instance_id: instanceId, model_name_or_path: agent === "sidecar" ? "codex-sidecar" : "codex-baseline", model_patch: patch });
    costs.push({ instance_id: instanceId, run_id: runId, agent, status, exit_code: exitCode, prompt_hash: hash(prompt), prompt_tokens_estimated: estimateTokens(prompt), sidecar_replay: agent === "sidecar" ? `agent-sidecar replay ${runId}` : undefined });

    writeJsonl(predictionsPath, predictions);
    writeJsonl(costsPath, costs);
  }

  console.log(JSON.stringify({ agent, instances: instances.length, predictionsPath, costsPath, logsDir }, null, 2));
}

function summarizeCommand(args) {
  const baselinePredictions = readJsonl(required(args, "baseline-predictions"));
  const sidecarPredictions = readJsonl(required(args, "sidecar-predictions"));
  const baselineResults = readResults(required(args, "baseline-results"));
  const sidecarResults = readResults(required(args, "sidecar-results"));
  const baselineCosts = args["baseline-costs"] ? readJsonl(args["baseline-costs"]) : [];
  const sidecarCosts = args["sidecar-costs"] ? readJsonl(args["sidecar-costs"]) : [];

  const baseline = aggregate(baselinePredictions, baselineResults, baselineCosts);
  const sidecar = aggregate(sidecarPredictions, sidecarResults, sidecarCosts);
  const summary = {
    total_instances: Math.max(baseline.total, sidecar.total),
    baseline,
    sidecar,
    deltas: {
      resolved: sidecar.resolved - baseline.resolved,
      accuracy_points: round((sidecar.accuracy - baseline.accuracy) * 100, 2),
      cost_per_success_usd: nullableDelta(sidecar.cost_per_success_usd, baseline.cost_per_success_usd),
      total_cost_usd: nullableDelta(sidecar.total_cost_usd, baseline.total_cost_usd)
    },
    rule: "Only treat cost reduction as savings when sidecar accuracy is non-inferior or when analyzing successful matched instances."
  };

  const out = args.out;
  if (out) writeFileSync(resolve(out), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

function aggregate(predictions, results, costs) {
  const ids = predictions.map((row) => stringField(row, "instance_id"));
  const resolved = ids.filter((id) => results.get(id) === true).length;
  const totalCost = costs.reduce((sum, row) => sum + numberField(row, "actual_cost", "actualCost", "cost", "baseline_estimated_cost", "actual_cost_usd"), 0);
  return {
    total: ids.length,
    resolved,
    accuracy: ids.length ? round(resolved / ids.length, 4) : 0,
    total_cost_usd: costs.length ? round(totalCost, 6) : null,
    cost_per_success_usd: costs.length && resolved > 0 ? round(totalCost / resolved, 6) : null
  };
}

function readResults(path) {
  const raw = readFileSync(path, "utf8").trim();
  const rows = raw.startsWith("[") || raw.startsWith("{") ? flattenResults(JSON.parse(raw)) : readJsonl(path);
  const map = new Map();
  for (const row of rows) {
    const id = row.instance_id ?? row.instanceId;
    if (!id) continue;
    const resolved = row.resolved ?? row.passed ?? row.success ?? row["test_result"] === "passed";
    map.set(String(id), Boolean(resolved));
  }
  return map;
}

function flattenResults(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && (value.instance_id || value.instanceId)) return [value];
  if (Array.isArray(value.results)) return value.results;
  if (Array.isArray(value.instances)) return value.instances;
  return Object.entries(value).map(([instance_id, result]) => typeof result === "object" && result ? { instance_id, ...result } : { instance_id, resolved: result });
}

function buildPrompt(instance) {
  return [
    `Solve SWE-bench instance ${stringField(instance, "instance_id")}.`,
    `Repository: ${stringField(instance, "repo")}`,
    `Base commit: ${stringField(instance, "base_commit")}`,
    "Fix the issue described below. Keep the patch minimal, preserve unrelated behavior, and run the relevant tests when possible.",
    "",
    stringField(instance, "problem_statement")
  ].join("\n");
}

function findRepoDir(reposDir, instance) {
  const repo = stringField(instance, "repo");
  const candidates = [
    join(reposDir, stringField(instance, "instance_id")),
    join(reposDir, basename(repo)),
    join(reposDir, repo.replaceAll("/", "__"))
  ];
  const found = candidates.find((candidate) => existsSync(join(candidate, ".git")));
  if (!found) die(`Could not find git checkout for ${stringField(instance, "instance_id")} in ${reposDir}`);
  return found;
}

async function captureGitDiff(cwd) {
  const result = await runProcess("git", ["diff", "--binary"], cwd, 60_000, {});
  return result.stdout;
}

async function git(cwd, args) {
  const result = await runProcess("git", args, cwd, 120_000, {});
  if (result.exitCode !== 0) die(`git ${args.join(" ")} failed in ${cwd}\n${result.stderr}`);
}

function runProcess(cmd, args, cwd, timeoutMs, extraEnv) {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...extraEnv }, shell: false });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolvePromise({ exitCode: 127, stdout, stderr: `${stderr}${error.message}\n`, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ exitCode: code ?? 1, stdout, stderr, timedOut });
    });
  });
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) parsed[key] = true;
    else { parsed[key] = next; index += 1; }
  }
  return parsed;
}

function readJsonl(path) {
  return readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function writeJsonl(path, rows) {
  writeFileSync(path, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
}

function stringField(object, key) {
  const value = object[key];
  if (typeof value !== "string" || value.length === 0) die(`missing ${key}`);
  return value;
}

function numberField(object, ...keys) {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

function required(args, key) {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) die(`missing --${key}\n${USAGE}`);
  return value;
}

function estimateTokens(text) { return Math.max(1, Math.ceil(text.length / 4)); }
function hash(text) { return createHash("sha256").update(text).digest("hex"); }
function shortHash(text) { return hash(text).slice(0, 8); }
function slug(text) { return text.replace(/[^a-zA-Z0-9_.-]+/g, "-").slice(0, 120); }
function round(value, digits) { return Number(value.toFixed(digits)); }
function nullableDelta(left, right) { return left == null || right == null ? null : round(left - right, 6); }
function die(message) { throw new Error(message); }
