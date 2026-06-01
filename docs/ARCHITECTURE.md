# Agent Sidecar Architecture

Agent Sidecar is a terminal-run reliability sidecar for AI coding agents. Users install the package with `pip`, start the sidecar daemon from their shell, and configure Codex, Claude Code, or another agent runtime to send hook events into the sidecar. The daemon owns ingestion, state, prompt optimization, monitor evaluation, model-ensemble steering, persistence, API access, and runtime decisions. The dashboard is a replay and control surface; it does not make runtime decisions or read storage directly.

```text
agent-sidecar hook adapter
      |
      v
Terminal sidecar daemon
      |
      +--> event normalization
      +--> run-state update
      +--> trajectory monitors
      +--> semantic file memory
      +--> approved lesson retrieval
      +--> prompt optimization
      +--> runtime monitors
      +--> cheaper steering model ensemble
      +--> cost and token accounting
      +--> SQLite trace storage
      |
      v
Decision response

Dashboard --> daemon API --> trace, lesson, repo map, policy, and analytics data
```

## Installation And Runtime Shape

The product should install and run from the user’s terminal:

```bash
python -m pip install agent-sidecar
agent-sidecar daemon start
agent-sidecar hook install --provider codex
agent-sidecar hook install --provider claude-code
```

The `agent-sidecar` Python package should expose a stable CLI. Internally it can start packaged services, open the dashboard, manage configuration, and install hook snippets. The important boundary is that the agent runtime calls the sidecar hook command and receives a structured decision response. If the daemon is unavailable, the hook command follows the configured availability policy: fail open by default, fail closed when explicitly configured.

## Runtime Lifecycle

The sidecar acts between agent steps. It should not rewrite the agent’s full message history, and it should not accumulate unbounded guidance. Each decision is derived from the current event, durable run state, approved memory, monitor signals, and configured steering budget.

1. **Run start**: the first hook event creates a run record with provider, model, repository, task metadata, pricing profile, and configuration snapshot.
2. **Step ingest**: every hook payload is captured as raw JSON, assigned a stable event id, and associated with a run id.
3. **Normalization**: provider-specific payloads are converted into normalized step records: command, file read, edit, validation, tool call, model usage, finalization attempt, or error.
4. **Run-state update**: the daemon updates counters for edited paths, validation freshness, repeated tools, recent files, cost, tokens, monitor history, and difficulty state.
5. **Trajectory assessment**: deterministic monitors evaluate loops, repeated reads, stale evidence, skipped validation, drift, risky tools, and cost pressure.
6. **Memory retrieval**: semantic file memory and approved lessons are retrieved only when scope, confidence, and cooldown gates pass.
7. **Prompt optimization**: the sidecar may produce a compact task contract, continuation prompt, validation reminder, or context injection.
8. **Decision evaluation**: runtime monitors and confidence gates classify the step. Ambiguous cases may use an ensemble of cheaper steering models if configured. The final action is one of allow, warn, block, require continuation, inject context, or require validation.
9. **Persistence**: the daemon stores raw event, normalized event, monitors fired, decision, cost rollup, prompt optimization output, and outcome labels.
10. **Response**: the hook command returns a decision object to the agent runtime before the agent continues.

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

The agent should see only the relevant decision text or injected context for that step. The dashboard stores the larger explanation: fired monitors, supervision reason, confidence gates, cost impact, and related trace evidence.

## State And Storage

SQLite is the MVP storage layer. The daemon owns all reads and writes. The dashboard accesses data through daemon APIs so state transitions stay centralized.

Minimum durable entities:

- `runs`: provider, model, repo, task, status, outcome, cost, tokens, start/end timestamps.
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

Agent Sidecar should cover these minimum runtime reliability capabilities:

- Runbook memory: retrieve reviewed local fix notes only when repo scope, task shape, failure signal, and confidence gates match.
- Dead-end avoidance: store operational guidance as a situation, avoided paths, and the unlock that worked.
- Repo map cache: reuse compact file summaries, ownership hints, and validation notes when file hashes show the context is still current.
- Trajectory watchdogs: detect repeated commands, repeated file reads, semantic retries, stale evidence, drift, and low-progress high-cost runs.
- Tool-cost guardrails: identify redundant fetches, repeated searches, broad edits, protected paths, and risky commands before they compound cost or damage.
- Prompt shaping and compaction: rewrite vague prompts into compact task briefs, preserve durable state, active constraints, validation requirements, and approved notes, and drop noisy or stale context.
- Ensemble steering: use cheaper configured models to steer Codex and Claude Code through ambiguous next steps while keeping the steering budget lower than the avoided agent spend.
- Reasoning-aware pruning: remove low-value context based on task state, validation evidence, and dead-end history rather than token count alone.
- Confidence-gated injection: inject patterns only when structured triggers and similarity scores clear configurable thresholds.
- Difficulty-state tracking: maintain a lightweight state such as `fast`, `normal`, `slow`, or `skip` to guide whether the sidecar should inject context, ask steering, require validation, or stay quiet.
- Cost-per-success evaluation: compare guarded and unguarded runs and label results as controlled, estimated, or correlated depending on the evaluation design.

These capabilities are terminal-run and local by default. Shared or cloud pattern libraries are a future opt-in feature and must use scrubbed, approved, operational lessons rather than raw traces.
