# Agent Sidecar

Agent Sidecar is a local runtime layer that runs beside coding agents such as Codex and Claude Code. Its goal is to lower the cost per successful engineering task while keeping velocity high through prompt refinement, local session tracing, loop detection, validation reminders, cost-aware steering, and replayable run summaries.

This repository currently contains an early TypeScript monorepo skeleton plus the implementation design document for building the product across demoable PRs.

## Design Document

- `docs/AGENT_SIDECAR_DESIGN.md`: source-of-truth product, architecture, data model, local steering ensemble, roadmap, PR-by-PR implementation plan, acceptance demos, risks, and final coding-agent checklist.

## Workspace

- `apps/daemon`: Fastify daemon with a health endpoint.
- `apps/dashboard`: Next.js dashboard shell for the future local replay/dashboard experience.
- `packages/core`: Shared types and protocol primitives.
- `packages/storage`: SQLite-ready storage package placeholder.
- `packages/cli`: Future `agent-sidecar` CLI package.
- `packages/detectors`: Future loop, command, validation, and edit detectors.
- `packages/policies`: Future runtime configuration and supervision settings.
- `packages/steering`: Future low-cost local steering ensemble interface.
- `packages/lessons`: Future approved lesson memory.
- `docs`: Agent Sidecar design and implementation planning documentation.

## Intended MVP Workflow

The first useful demo should prove that Agent Sidecar can run locally beside Codex or Claude Code and track a real or simulated coding-agent session:

```bash
agent-sidecar start
```

Then, in another terminal:

```bash
pnpm install
pnpm build
python -m venv .venv
source .venv/bin/activate
pip install .
agent-sidecar start
agent-sidecar --help
agent-sidecar codex-shim install
export PATH="/Users/roman/.agent-sidecar/bin:$PATH"
codex "fix auth refresh; preserve unrelated session behavior"
# Finish the Codex task, then exit Codex with /quit or Ctrl-D.
agent-sidecar session list
# Show task cost delta, baseline cost, actual cost, and prompt optimization evidence.
agent-sidecar dashboard
```

For manual event demos, create a named local sidecar session:

```bash
agent-sidecar session start --agent codex --repo . --name demo-session-001
agent-sidecar status
```

The current CLI also supports the rest of the local MVP loop:

```bash
agent-sidecar event command --session demo-session-001 --command "pnpm test"
agent-sidecar event edit --session demo-session-001 --path src/index.ts
agent-sidecar event validation --session demo-session-001 --command "pnpm test" --status passed
agent-sidecar refine --session demo-session-001 "make the app better and fix tests"
agent-sidecar steer --session demo-session-001
agent-sidecar replay demo-session-001
agent-sidecar summary export demo-session-001 --format markdown
agent-sidecar website
agent-sidecar dashboard
agent-sidecar session stop --session demo-session-001
```

Prompt refinement starts with local DeepSeek attempts by default through an Ollama-compatible endpoint, then falls back to deterministic task-contract refinement if the model is unavailable or returns an unusable response. Steering follows the same local-model-first shape: deterministic detectors produce compact evidence, local DeepSeek can make the steering call, and the detector ranking remains the fallback.

## How It Works Today

Agent Sidecar is currently a local companion process, not a deep terminal interceptor. The `agent-sidecar` command talks to a local Fastify daemon. The daemon persists runs, normalized events, decisions, run-state snapshots, prompt optimizations, policies, lessons, and feedback in SQLite.

The daemon starts on `127.0.0.1:4319` by default, then scans to the next free port if needed. It writes the selected URL to `~/.agent-sidecar/daemon.json`, and the CLI reads that file unless `AGENT_SIDECAR_DAEMON_URL` is set. If the recorded daemon process is gone, the CLI ignores the stale state and falls back to the default daemon URL.

### Codex and Claude Integration

Current Codex integration is terminal-shim first:

- `agent-sidecar codex-shim install` writes a `codex` shim to `~/.agent-sidecar/bin/codex`. Put that directory before the real Codex binary on `PATH`.
- `codex "prompt"` then enters Agent Sidecar first. The shim sends the prompt and lightweight repo context to the local daemon, receives an optimized prompt, and launches the real Codex binary with that optimized prompt.
- `agent-sidecar codex "prompt"` runs the same interception path without installing the shim. Use `--dry-run` to inspect the optimized prompt and final Codex argv without launching Codex. Use `--print` to print only the optimized prompt.
- `agent-sidecar hook --provider codex|claude-code|generic < event.json` accepts hook JSON on stdin and posts it to `/hooks/codex`, `/hooks/claude`, or `/hooks/generic`. For Codex `UserPromptSubmit` events, the hook enriches the payload with repo context, runs prompt optimization immediately, and returns `optimizedPromptForCodex`, `promptReplacement`, and `promptAppend` on stdout for the Codex hook adapter to consume.
- `agent-sidecar hook install --provider codex|claude-code` prints the recommended integration command. For Codex, this now points at the terminal shim.
- Manual demo commands such as `event command`, `event edit`, and `event validation` simulate agent activity without requiring Codex or Claude Code.

Realtime prompt interception for terminal-launched Codex prompts is available through the shim. Bare interactive `codex` still launches the real Codex TUI unchanged; interception applies when a prompt is supplied as argv or stdin, such as `codex "fix auth refresh"`.

### Prompt Refinement

Prompt refinement has two paths:

- Local DeepSeek first: if enabled and reachable, the daemon calls an Ollama-compatible local chat endpoint at `AGENT_SIDECAR_LOCAL_MODEL_URL` with model `AGENT_SIDECAR_LOCAL_MODEL` and asks for JSON containing an optimized prompt and task contract.
- Deterministic fallback: if the local model is unavailable, returns invalid JSON, or only restates the original prompt, vague prompts such as `fix`, `make`, `improve`, or troubleshooting prompts such as `not working` are rewritten into a task contract with task, context, scope, constraints, acceptance criteria, PR boundaries, test expectations, validation requirements, relevant lessons, and risk notes.

By default, the daemon tries `http://127.0.0.1:11434` with model `deepseek-r1:7b`. Set `AGENT_SIDECAR_LOCAL_PROMPT_OPTIMIZER=off` to skip local-model attempts and use deterministic refinement only.

Relevant approved lessons are selected by keyword matching against the prompt, latest error, recent command signatures, and changed or inspected files. Prompt optimizations are stored with the run and can be replayed or exported.

### How Cost Savings Are Achieved

Agent Sidecar lowers the cost per successful task by reducing waste before and during the coding-agent run, then counting savings only when the run still reaches the expected quality gate.

The main savings methods are:

- Prompt interception before Codex starts: terminal prompts such as `codex "fix auth refresh"` pass through Agent Sidecar first. The sidecar expands vague requests into compact task contracts with scope, constraints, acceptance criteria, and validation expectations. This reduces expensive back-and-forth caused by underspecified prompts.
- Local-model-first refinement: the daemon tries a local DeepSeek-compatible optimizer before falling back to deterministic refinement. Local refinement can improve task framing without spending frontier-model budget on the prompt-improvement step itself.
- Context selection instead of context stuffing: the optimizer attaches lightweight repo context, recent plan snippets, approved lessons, file-tree hints, and relevant diffs instead of blindly pushing broad source context into the coding agent.
- Avoided dead ends: detectors watch for repeated commands, repeated failed validations, repeated edits, missing validation, and task drift. Steering decisions can warn or suggest the next step before the agent spends more calls exploring the same path.
- Cheaper steering loops: deterministic detectors produce compact evidence, and the optional local model judges that evidence. The expensive coding model does not need to reason from the full raw trace just to decide whether the run is looping or drifting.
- Validation-gated accounting: savings are not treated as real just because a prompt got shorter or a route got cheaper. Agent Sidecar records the baseline, actual cost, prompt hashes, model route, task type, confidence, and validation evidence so the dashboard can focus on cost per successful task.
- Future model-route enforcement: current steering records route evidence and recommendations. The next routing step is to use those decisions to send narrow edits, summarization, and simple investigation work to cheaper or local models while reserving frontier calls for tasks that need them.

### Cost per Successful Task Accounting

Agent Sidecar still tracks tokens because token usage is one input to cost. The product metric is broader: cost per successful task, where success means the run passed its validation or review gate.

There are two token measurement paths:

- Prompt refinement estimates prompt size with a simple heuristic: `ceil(character_count / 4)`. The CLI uses the same estimate with a minimum of 1 token for display. `Estimated token delta` is `estimated refined prompt tokens - estimated original prompt tokens`.
- Run totals use provider-supplied hook data only. If a hook payload includes `tokenUsage`, `token_usage`, or `usage`, the normalizer extracts input, output, and total token counts and storage rolls them into the run totals. If no provider usage is present, run token totals remain zero.

Raw cost totals are provider-supplied today. If hook payloads include `costEstimate`, `cost_estimate`, or `cost`, storage adds that amount to the run total.

Task-cost estimates are separate from raw provider cost. Cost improvement can come from fewer agent steps, fewer repeated reads or tool calls, better model routing, shorter reasoning chains, and avoiding dead ends. The preferred measurement is paired runs that compare successful outcomes. When provider cost is unavailable, the MVP can approximate one cost input from observed token movement and current model pricing:

```text
estimated_task_cost_delta = validated_trace_count × avg_cost_delta_per_validated_trace
```

For the MVP, prompt optimization records provide a token-based fallback through `estimatedTokenDelta`. The dashboard can use those records as cost evidence, but the user-facing claim should be framed as lower cost per successful task rather than tokens saved in isolation.

### Measuring Prompt Optimization Quality

Cost reductions only count when the optimized prompt still produces the same quality of engineering result as the original prompt. Measure this with paired baseline runs instead of comparing prompt text directly.

Recommended evaluation loop:

1. Pick a fixed task with an objective verifier: unit tests, integration tests, lint/typecheck, expected files changed, and acceptance criteria.
2. Run the original prompt against a clean checkout and record the final diff, tests run, pass/fail status, token usage, cost, number of agent steps, and any human review notes.
3. Reset to the same clean checkout.
4. Run the optimized prompt against the same model, tool access, repo state, and time budget.
5. Compare outcomes with an equivalence gate:
   - required tests pass in both runs
   - acceptance criteria are satisfied in both runs
   - no new unrelated files or broad refactors appear in the optimized diff
   - the optimized run does not remove required behavior from the baseline run
   - a reviewer or evaluator marks the optimized output as same-quality or better
6. Count cost improvement only if the equivalence gate passes. If quality regresses, record the optimization as unsafe and do not include its cost or token delta in successful-task metrics.

For stronger measurement, run each prompt pair multiple times because coding agents are stochastic. Treat the optimized prompt as successful when it is non-inferior on quality and better on cost across a meaningful sample, for example:

```text
quality_pass_rate_optimized >= quality_pass_rate_original - allowed_margin
median_cost_optimized < median_cost_original
median_steps_optimized <= median_steps_original
```

The ideal benchmark stores every pair as a replayable evaluation record: original prompt, optimized prompt, repo commit, model, tool permissions, final diff, tests, token usage, cost, reviewer score, and the reason the optimization passed or failed. This gives the dashboard enough evidence to separate real cost-per-success improvement from cheaper but worse outputs.

### Steering Ensemble

The current steering ensemble is local-first. It runs deterministic detectors for evidence, then tries the configured local DeepSeek model for the final `continue`, `suggest`, or `warn` decision. If the local model is disabled, unavailable, or returns invalid JSON, the deterministic detector ranking makes the decision.

Current detectors:

- repeated command detector
- repeated failed validation detector
- repeated edit detector
- missing validation detector
- prompt or task drift detector

The steering engine runs all detectors, keeps matched findings, sends that compact evidence to the local model when configured, and returns:

- `continue` when no detector fires
- `suggest` when a lower-scoring detector fires
- `warn` when the top finding score is at least `0.8`

The decision includes confidence, reason code, source (`model_assisted` or `deterministic`), fired evaluators, recommended next step, and estimated avoided waste categories. Set `AGENT_SIDECAR_LOCAL_STEERING=off` to skip local-model steering attempts.

### Pattern Library and Format D

Agent failures are often repeated exploration failures rather than raw model capability failures. The model may be capable of solving the task, but each new call can re-enter the same unproductive branches unless the runtime supplies compact steering knowledge.

Format D patterns encode three pieces of reusable guidance:

- the situation where the pattern applies
- the dead ends the agent should avoid
- the unlock that usually leads to the solution

When Agent Sidecar injects a matching pattern, it steers the agent past failure modes it would otherwise spend budget exploring. That can lower cost per successful task and reduce incorrect outputs.

The pattern library is collective. Patterns that improve one team's coding-agent runs can improve future runs for other teams on the platform. As more agents use the system, the library grows, match quality improves, and the confidence gate can fire on a higher percentage of tasks.

### Replay, Summary, and Dashboard

`agent-sidecar replay <session>` reads the run, events, decisions, prompt optimizations, and latest run state from the daemon. `summary export` renders that replay as Markdown or JSON. `agent-sidecar website` starts the local Next.js app and opens the website root. `agent-sidecar dashboard` starts the same app and opens `/dashboard`.

## Architecture Gap and Next Steps

The implementation is enough for an MVP demo, but it is not the full architecture in `docs/AGENT_SIDECAR_DESIGN.md` yet. The next steps are:

1. Add first-class Codex and Claude Code hook installation docs/config, with real examples for each runtime.
2. Replace manual/demo event capture with reliable runtime hook ingestion for prompt, tool, edit, validation, compaction, and final-attempt events.
3. Add a real pricing table for providers and models when provider usage or model-cost data is missing.
4. Expand the steering ensemble from the first local DeepSeek evaluator and deterministic fallback into configurable local evaluators and optional low-cost model judges with budgets.
5. Add policy enforcement modes for `warn`, `block`, `require_validation`, and `require_approval`.
6. Promote lessons from stored records into an approval workflow and scoped retrieval strategy.
7. Make the pip package or another installer self-contained instead of requiring a source checkout plus Node and pnpm.
8. Improve dashboard replay so it shows detector evidence, prompt diffs, pattern matches, task cost movement, quality gates, and suggested next actions.

## Development Commands

```bash
pnpm install
pnpm build
pnpm test
pnpm dev:daemon
pnpm dev:website
pnpm dev:dashboard
```

## Local pip Wrapper

For the MVP, pip installs a Python wrapper that exposes the built Node CLI as `agent-sidecar`:

```bash
pnpm install
pnpm build
python -m venv .venv
source .venv/bin/activate
pip install .
agent-sidecar --help
```

The wrapper requires Node.js >=20 and `pnpm` on `PATH`. Run it from the repository root, or set `AGENT_SIDECAR_REPO_ROOT=/path/to/agent-guard`. If `packages/cli/dist/index.js` is missing, it runs `pnpm build` from the source checkout before executing the CLI.

During development, build before running the compiled CLI directly:

```bash
pnpm build
node packages/cli/dist/index.js status
```

The daemon first tries `http://127.0.0.1:4319`, then advances to the next free port if that port is already in use. It writes the selected URL to `~/.agent-sidecar/daemon.json`, and the CLI reads that file unless `AGENT_SIDECAR_DAEMON_URL` is set explicitly. If that file points at a process that no longer exists, the CLI ignores it and falls back to `http://127.0.0.1:4319`.

The website and dashboard first try `http://127.0.0.1:4738`, then advance to the next free port for `pnpm dev:website`, `pnpm dev:dashboard`, `pnpm --filter @agent-sidecar/dashboard start:website`, and `pnpm --filter @agent-sidecar/dashboard start:dashboard`.

Use `pnpm dev:website` or `agent-sidecar website` for the marketing website at `/`. Use `pnpm dev:dashboard` or `agent-sidecar dashboard` for the local runtime dashboard at `/dashboard`.
