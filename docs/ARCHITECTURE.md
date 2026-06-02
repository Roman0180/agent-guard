# Agent Sidecar Architecture

Agent Sidecar is a terminal-run prompt control plane for AI coding agents. Users enter a task into the sidecar instead of typing directly into Codex. The sidecar retrieves local context, rewrites the request into a compact task contract, submits the optimized prompt to Codex, and records the prompt lineage and result quality for replay and measurement. Runtime hooks still capture later agent events so the same sidecar can warn, block, require validation, or inject continuation context while the run is active.

```text
User enters task
      |
      v
Terminal sidecar daemon
      |
      +--> retrieve context
      |      - repo type
      |      - AGENTS.md instructions
      |      - previous plans
      |      - file tree
      |      - active branch
      |      - relevant diffs
      |
      +--> rewrite prompt
      |      - remove fluff
      |      - add constraints
      |      - add acceptance criteria
      |      - add PR boundaries
      |      - add test expectations
      |
      +--> submit optimized prompt to Codex
      |
      +--> record lineage and outcome
             - original prompt
             - optimized prompt
             - token estimate
             - result quality

Codex hook events --> sidecar runtime monitors --> compact decisions
Dashboard --> daemon API --> traces, prompts, context, policies, lessons, and analytics
```

## Installation And Runtime Shape

The product should install and run from the user’s terminal:

```bash
python -m pip install agent-sidecar
agent-sidecar daemon start
agent-sidecar codex "Fix the auth refresh bug"
```

The `agent-sidecar` Python package should expose a stable CLI. The primary Codex path is task-first: the user gives the task to Agent Sidecar, Agent Sidecar gathers context and rewrites the prompt, then the sidecar launches or submits to Codex with the optimized prompt. Hook installation remains available for in-run supervision and for runtimes that can only call external tools after a session starts.

If the daemon is unavailable, the CLI follows the configured availability policy: fail open by default by passing the original prompt to Codex, or fail closed when explicitly configured.

## Task Submission Lifecycle

The sidecar owns the initial prompt boundary. It should not pass a vague or context-free task to Codex when local context is available.

1. **Task received**: store the user’s original task, provider target, repo root, requested model when known, pricing profile, and configuration snapshot.
2. **Context retrieval**: collect repo type, applicable `AGENTS.md` instructions, previous plans, compact file tree, active branch, and relevant diffs. Keep context local and compact by default.
3. **Prompt rewrite**: remove conversational fluff, preserve the user’s intent, add constraints, acceptance criteria, PR boundaries, and test expectations.
4. **Token estimate**: estimate original and optimized prompt tokens before submission so the dashboard can show prompt delta and cost expectations.
5. **Submit to Codex**: send the optimized prompt to Codex as the task contract. Codex should not need to infer missing scope, validation, or PR boundaries from the original user wording.
6. **Runtime supervision**: ingest Codex hook events during the run, normalize them, update run state, and apply monitors, tool-cost guardrails, lesson injection, and validation requirements.
7. **Record result**: persist original prompt, optimized prompt, context snapshot metadata, estimated token delta, decisions, validation evidence, and result quality.
8. **Replay and measure**: expose the full prompt lineage and outcome through daemon APIs for the dashboard.

## Runtime Supervision Lifecycle

After Codex starts, the sidecar still acts between agent steps. It should not rewrite the full agent message history or accumulate unbounded guidance. Each decision is derived from the current event, durable run state, approved memory, monitor signals, and configured steering budget.

1. **Step ingest**: capture each hook payload as raw JSON, assign a stable event id, and associate it with a run id.
2. **Normalization**: convert provider-specific payloads into normalized step records: command, file read, edit, validation, tool call, model usage, finalization attempt, or error.
3. **Run-state update**: update counters for edited paths, validation freshness, repeated tools, recent files, cost, tokens, monitor history, and difficulty state.
4. **Memory gate**: retrieve semantic file memory and approved lessons only when scope, confidence, and cooldown gates pass.
5. **Trajectory assessment**: deterministic monitors and tool-cost guardrails evaluate loops, repeated reads, stale evidence, skipped validation, drift, risky tools, and cost pressure.
6. **Decision evaluation**: monitor results, confidence gates, prompt lineage, and optional cheaper steering models are composed into one action: allow, warn, block, require continuation, inject context, or require validation.
7. **Persistence**: store raw event, normalized event, monitors fired, decision, cost rollup, prompt optimization output, and outcome labels.
8. **Response**: return a compact decision object to the agent runtime before the agent continues.

## Decision Contract

Decision responses should be explicit and small:

```json
{
  "action": "require_validation",
  "reasonCode": "validation_after_edit.require",
  "message": "Code changed after the last accepted validation.",
  "continuationPrompt": "Run the targeted validation before finalizing.",
  "context": [],
  "severity": "medium"
}
```

Codex should see only the relevant decision text or injected context for that step. The dashboard stores the larger explanation: context snapshot, prompt rewrite reason, fired monitors, supervision reason, confidence gates, cost impact, and related trace evidence.

## State And Storage

SQLite is the MVP storage layer. The daemon owns all reads and writes. The dashboard accesses data through daemon APIs so state transitions stay centralized.

Minimum durable entities:

- `runs`: provider, model, repo, task, status, outcome, cost, tokens, start/end timestamps.
- `context_snapshots`: repo type, applicable `AGENTS.md` summaries, previous plan references, compact file tree, active branch, relevant diff summaries, created timestamp.
- `prompt_optimizations`: original prompt, optimized prompt, task contract, token estimate, rewrite reason, injection/submission status, result quality.
- `raw_events`: original hook payloads, source provider, received timestamp.
- `normalized_events`: stable event type, paths, command, validation signal, usage metadata.
- `decisions`: action, reason code, monitor/model source, severity, message, injected context.
- `monitor_results`: monitor id, score, fired flag, supporting evidence, cooldown state.
- `lessons`: situation, dead ends to avoid, unlock, scope, confidence, approval state.
- `file_memory`: path, summary, ownership hints, validation notes, content hash when available.
- `cost_rollups`: per-step and per-run token/cost totals with pricing version.
- `baseline_links`: matched baseline run ids or controlled evaluation arm ids.

## Cost Accounting

Cost calculations must be auditable. A step cost is computed from usage metadata and a pricing profile:

```text
step_cost =
  input_tokens * input_price_per_token
  + output_tokens * output_price_per_token
  + cache_write_tokens * cache_write_price_per_token
  + cache_read_tokens * cache_read_price_per_token
```

Run cost is the sum of step costs. Total cost saved is calculated against a comparable baseline:

```text
savings_for_run = baseline_run_cost - guarded_run_cost
total_cost_saved = sum(savings_for_run for matched runs)
```

If the baseline comes from a randomized control arm, the dashboard may label the result as controlled. If the baseline comes from historical or heuristic matching, the dashboard must label it as estimated or correlated. Negative deltas should remain visible so regressions are not hidden.

## Reliability Capabilities

Agent Sidecar should cover these minimum reliability capabilities:

- Task-first submission: users enter tasks into the sidecar, not directly into Codex, so context retrieval and prompt rewriting happen before agent spend begins.
- Context retrieval: collect repo type, `AGENTS.md`, previous plans, file tree, active branch, and relevant diffs as compact prompt inputs.
- Prompt rewriting: remove fluff, add constraints, acceptance criteria, PR boundaries, and test expectations.
- Prompt lineage: record original prompt, optimized prompt, token estimate, and result quality.
- Runbook memory: retrieve reviewed local fix notes only when repo scope, task shape, failure signal, and confidence gates match.
- Dead-end avoidance: store operational guidance as a situation, avoided paths, and the unlock that worked.
- Repo map cache: reuse compact file summaries, ownership hints, and validation notes when file hashes show the context is still current.
- Trajectory watchdogs: detect repeated commands, repeated file reads, semantic retries, stale evidence, drift, and low-progress high-cost runs.
- Tool-cost guardrails: identify redundant fetches, repeated searches, broad edits, protected paths, and risky commands before they compound cost or damage.
- Ensemble steering: use cheaper configured models to steer Codex through ambiguous next steps while keeping the steering budget lower than avoided agent spend.
- Confidence-gated injection: inject patterns only when structured triggers and similarity scores clear configurable thresholds.
- Cost-per-success evaluation: compare guarded and unguarded runs and label results as controlled, estimated, or correlated depending on the evaluation design.
