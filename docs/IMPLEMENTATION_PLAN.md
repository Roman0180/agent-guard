# AgentGuard Implementation Plan

## 1. Product Summary

AgentGuard is a local-first runtime reliability layer for AI coding agents such as Codex and Claude Code. It runs as a sidecar beside existing agents instead of replacing them. AgentGuard receives hook events from agent runtimes, normalizes and stores those events locally, evaluates deterministic policies, optionally asks a small steering model for ambiguous cases, and returns decisions that can warn, block, require continuation, inject lessons, or require validation.

The dashboard is the control plane and replay UI, but the core product is the runtime decision pipeline. The MVP should prove that AgentGuard can observe real agent runs, intervene on common failure modes, and measure whether interventions improve cost per successful task.

Primary user workflow:

1. Install the `agentguard` CLI.
2. Start the local daemon.
3. Configure Codex or Claude Code hooks to call AgentGuard.
4. Run the coding agent normally.
5. Review traces, decisions, policies, lessons, and analytics in the local dashboard.

## 2. MVP Scope

The MVP should include:

- TypeScript monorepo with shared packages and app workspaces.
- Local Fastify daemon that exposes hook ingestion and dashboard APIs.
- `agentguard` CLI for starting the daemon, installing hook snippets, sending hook events, and checking status.
- SQLite-backed local storage.
- Shared event schemas for raw events, normalized events, decisions, run state, policies, lessons, and analytics.
- Hook adapters for Codex and Claude Code, starting with a generic JSON hook protocol and thin provider-specific normalization.
- Deterministic hard rule engine for low-cost decisions.
- Optional small steering model interface for ambiguous decisions, disabled by default or configured explicitly.
- Local dashboard with runs, trace replay, policies, lessons, analytics, and feedback pages.
- Lesson memory with candidate, approved, disabled, and expired states.
- Basic cost and token accounting using event metadata when available and estimation when unavailable.
- Fail-open daemon unavailable behavior by default, with fail-closed configuration.

Initial hard rules:

- Block dangerous shell commands.
- Block protected files and paths.
- Warn on exact repeated commands.
- Require validation after code edits before final answers.
- Require approval for broad file changes.

Initial steering model use cases:

- Semantic loop detection.
- Stale evidence detection.
- Premature final answer detection.
- Broad edit classification.
- Approved lesson selection.
- Failure category classification.

## 3. Non-Goals

The MVP should not attempt to:

- Replace Codex, Claude Code, or any other coding agent.
- Build a fully remote SaaS control plane.
- Store traces in cloud services by default.
- Require an LLM call for every event or decision.
- Analyze complete raw conversations with a model by default.
- Guarantee secret redaction in v1.
- Implement enterprise policy distribution, teams, SSO, or role-based access control.
- Support every possible agent hook format before the core pipeline is proven.
- Automatically approve or reject lessons without user review.
- Optimize for distributed multi-user deployments.

## 4. Architecture Diagram

```text
┌────────────────────┐
│ Codex / Claude Code│
└─────────┬──────────┘
          │ hook event JSON
          ▼
┌────────────────────┐
│ agentguard CLI     │
│ hook adapter       │
└─────────┬──────────┘
          │ HTTP localhost
          ▼
┌──────────────────────────────────────────────────────┐
│ apps/daemon                                           │
│                                                      │
│  ┌──────────────┐   ┌──────────────┐                 │
│  │ raw ingest   │──▶│ normalize    │                 │
│  └──────────────┘   └──────┬───────┘                 │
│                            ▼                         │
│  ┌──────────────┐   ┌──────────────┐                 │
│  │ storage      │◀──│ run state    │                 │
│  └──────┬───────┘   └──────┬───────┘                 │
│         │                  ▼                         │
│         │          ┌──────────────┐                  │
│         │          │ hard rules   │                  │
│         │          └──────┬───────┘                  │
│         │                 │ unresolved ambiguous case │
│         │                 ▼                          │
│         │          ┌──────────────┐                  │
│         │          │ steering     │                  │
│         │          │ model        │                  │
│         │          └──────┬───────┘                  │
│         │                 ▼                          │
│         │          ┌──────────────┐                  │
│         └─────────▶│ decision log │                  │
│                    └──────┬───────┘                  │
└───────────────────────────┼──────────────────────────┘
                            │ decision JSON
                            ▼
                  ┌──────────────────┐
                  │ agent hook       │
                  │ allow/warn/block │
                  └──────────────────┘

┌────────────────────┐          ┌────────────────────┐
│ apps/dashboard     │─────────▶│ daemon API         │
│ Next.js local UI   │          │ SQLite-backed      │
└────────────────────┘          └────────────────────┘
```

## 5. Monorepo Structure

```text
agent-guard/
  apps/
    daemon/
      src/
        api/
        ingest/
        normalization/
        runtime/
        analytics/
        config/
      package.json
    dashboard/
      app/
      components/
      lib/
      package.json
  packages/
    cli/
      src/
        commands/
        hooks/
        config/
      package.json
    core/
      src/
        schemas/
        types/
        errors/
        protocol/
      package.json
    storage/
      src/
        migrations/
        repositories/
        sqlite.ts
      package.json
    policies/
      src/
        loader.ts
        engine.ts
        rules/
      package.json
    detectors/
      src/
        commands/
        loops/
        validation/
        edits/
      package.json
    steering/
      src/
        client.ts
        schemas.ts
        providers/
      package.json
    lessons/
      src/
        matcher.ts
        candidates.ts
        repository.ts
      package.json
  docs/
    IMPLEMENTATION_PLAN.md
    CONFIGURATION.md
    HOOKS.md
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
```

Recommended stack:

- Package manager: `pnpm`.
- Language: TypeScript.
- API server: Fastify.
- Dashboard: Next.js.
- Database: SQLite through `better-sqlite3` or `sqlite`.
- Runtime validation: Zod.
- Tests: Vitest for packages, Playwright for dashboard smoke tests.
- Lint/format: ESLint and Prettier.

## 6. Core Data Models

Core schemas should live in `packages/core` and be validated at all process boundaries.

### Raw Hook Event

```ts
type RawHookEvent = {
  id: string;
  provider: "codex" | "claude-code" | "generic";
  providerEventType: string;
  runExternalId?: string;
  sessionExternalId?: string;
  receivedAt: string;
  payload: unknown;
  payloadHash: string;
};
```

### Normalized Event

```ts
type NormalizedEvent = {
  id: string;
  rawEventId: string;
  runId: string;
  provider: AgentProvider;
  eventType:
    | "run_started"
    | "prompt"
    | "tool_call"
    | "tool_result"
    | "file_edit"
    | "validation"
    | "final_attempt"
    | "run_finished"
    | "error";
  timestamp: string;
  actor: "agent" | "user" | "tool" | "system";
  summary: string;
  command?: NormalizedCommand;
  fileEdit?: NormalizedFileEdit;
  validation?: ValidationSignal;
  tokenUsage?: TokenUsage;
  costEstimate?: CostEstimate;
  metadata: Record<string, unknown>;
};
```

### Decision

```ts
type RuntimeDecision = {
  id: string;
  runId: string;
  eventId: string;
  createdAt: string;
  source: "hard_rule" | "steering_model" | "manual" | "system";
  action: "allow" | "warn" | "block" | "require_continue" | "require_approval" | "inject_lesson";
  severity: "info" | "warning" | "error";
  reasonCode: string;
  message: string;
  ruleId?: string;
  lessonIds?: string[];
  modelDecisionId?: string;
  expiresAt?: string;
};
```

### Policy

```ts
type PolicyConfig = {
  version: 1;
  failMode: "open" | "closed";
  protectedPaths: string[];
  dangerousCommands: string[];
  broadChangeThreshold: {
    maxFilesChanged: number;
    maxLinesChanged: number;
  };
  validation: {
    requireAfterEdit: boolean;
    acceptedCommands: string[];
  };
  steering: {
    enabled: boolean;
    provider?: string;
    maxCallsPerRun: number;
  };
};
```

### Lesson

```ts
type Lesson = {
  id: string;
  trigger: LessonTrigger;
  text: string;
  confidence: number;
  evidence: LessonEvidence[];
  scope: LessonScope;
  status: "candidate" | "approved" | "disabled" | "expired";
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
};
```

## 7. Hook Integration Strategy

The CLI should expose a stable local hook command:

```bash
agentguard hook --provider codex
agentguard hook --provider claude-code
agentguard hook --provider generic
```

The hook command should:

1. Read JSON from stdin.
2. Add provider and local metadata.
3. POST to the local daemon.
4. Print a provider-compatible response.
5. Fail open if the daemon is unavailable and policy is fail-open.
6. Fail closed if explicitly configured.

Provider adapters should be thin. Provider-specific differences belong in parser modules that convert raw hook payloads into `RawHookEvent` plus normalization hints. The daemon owns durable storage, run state, policy evaluation, and final decision composition.

Codex integration should start with documented hook event shapes available in the local environment. Claude Code integration should start with its hook lifecycle events. If either provider changes hook formats, only the adapter and normalizer should need updates.

## 8. Event Normalization Strategy

Normalization converts provider-specific events into stable AgentGuard events.

Normalization goals:

- Preserve raw payloads for replay and future migration.
- Store compact normalized events for rules, analytics, and dashboard queries.
- Normalize commands into executable, args, cwd, environment presence, and risk features.
- Normalize file edits into paths, counts, operation type, and protected path matches.
- Normalize validation into command type, pass/fail status, and evidence.
- Avoid sending raw logs or full conversations into the steering model.

Implementation approach:

1. Validate raw event envelope.
2. Persist raw event before deeper parsing.
3. Select provider normalizer.
4. Extract or create stable `runId`.
5. Derive event type and compact summary.
6. Attach normalized command, edit, validation, usage, and cost features when present.
7. Persist normalized event.
8. Emit normalization warnings for unknown but accepted provider payloads.

Unknown event types should be stored and displayed, but ignored by hard rules until explicit support is added.

## 9. Run State Model

Run state is a compact derived snapshot updated after each normalized event.

```ts
type RunState = {
  runId: string;
  status: "active" | "blocked" | "completed" | "failed";
  startedAt: string;
  updatedAt: string;
  provider: AgentProvider;
  repoRoot?: string;
  branch?: string;
  taskSummary?: string;
  eventCounts: Record<string, number>;
  recentCommands: NormalizedCommand[];
  commandFrequency: Record<string, number>;
  editedFiles: string[];
  changedFileCount: number;
  estimatedChangedLines: number;
  validationSinceLastEdit: boolean;
  lastValidation?: ValidationSignal;
  pendingApprovals: PendingApproval[];
  interventions: InterventionSummary;
  tokenUsage: TokenUsage;
  costEstimate: CostEstimate;
};
```

The run state should be recomputable from normalized events. Persist snapshots for performance and trace replay, but treat event history as the source of truth.

State update rules:

- Tool calls update recent command and command frequency features.
- File edits reset `validationSinceLastEdit` to `false`.
- Validation events update `lastValidation` and set `validationSinceLastEdit` based on accepted validation commands.
- Final attempts check whether validation is required.
- Decisions update intervention counters and pending approval state.

## 10. Hard Rule Engine Design

The hard rule engine should be deterministic, fast, and model-free. It receives a normalized event, current run state, loaded policy config, and repository metadata. It returns zero or more decisions.

Rule interface:

```ts
type HardRule = {
  id: string;
  description: string;
  appliesTo: NormalizedEvent["eventType"][];
  evaluate(input: RuleInput): RuleDecision[];
};
```

Initial rules:

- `dangerous_command.block`: block shell commands matching denylisted patterns such as recursive deletion, disk formatting, credential exfiltration, or known destructive git operations.
- `protected_path.block`: block edits to protected paths such as `.env`, secrets, lockfiles, or configured production files unless explicitly allowed.
- `exact_command_repeat.warn`: warn when the same normalized command repeats beyond a threshold in a short window.
- `validation_after_edit.require`: require continuation instead of final answer when code was edited and no accepted validation has run.
- `broad_change.require_approval`: require approval when changed file or changed line thresholds are exceeded.

Design principles:

- Rules should return structured reason codes, not free-form-only text.
- Rules should be separately testable with fixture events.
- Block and require decisions should short-circuit steering model calls.
- Warn decisions can be accumulated and shown without preventing later evaluation.
- Rule config should come from layered policy loading: defaults, global user config, repo config, then runtime overrides.

## 11. Small Steering Model Design

The steering model should be optional and used only when deterministic rules are insufficient. It should receive compact structured features, not raw transcripts.

Model request:

```ts
type SteeringRequest = {
  runId: string;
  purpose:
    | "semantic_loop"
    | "stale_evidence"
    | "premature_final"
    | "broad_edit"
    | "lesson_selection"
    | "failure_category";
  features: Record<string, unknown>;
  allowedActions: RuntimeDecision["action"][];
  candidateLessons?: Lesson[];
};
```

Model response:

```ts
type SteeringResponse = {
  action: RuntimeDecision["action"];
  confidence: number;
  reasonCode: string;
  message: string;
  lessonIds?: string[];
  failureCategory?: string;
};
```

Guardrails:

- Validate strict JSON with Zod.
- Reject unknown actions, reason codes, lesson IDs, or categories.
- Enforce per-run model call budgets.
- Log model inputs and outputs as structured records.
- Fall back to allow or warn when the model provider fails, depending on policy.
- Do not include raw chain-of-thought, full prompts, or full logs in requests.

Initial provider strategy:

- Define provider-agnostic interface in `packages/steering`.
- Support a no-op provider for tests and default installs.
- Add configurable local HTTP provider for users running a small local model.
- Add later cloud provider support behind explicit configuration.

## 12. Lesson Memory Design

Lessons are structured memory items that require approval before runtime injection. They should help avoid repeated mistakes without storing raw reasoning.

Lesson lifecycle:

1. Candidate generated from successful run, repeated failure pattern, or user feedback.
2. User reviews candidate in dashboard.
3. User approves, disables, edits, or expires the lesson.
4. Runtime matches approved lessons against compact run features.
5. Hard rules or steering model decide whether to inject one or more matching lessons.
6. Dashboard tracks accepted, ignored, and stale lessons.

Matching inputs:

- Repo language and framework hints.
- Error category and command output summary.
- File paths and file extensions.
- Tool call pattern.
- Failure mode.
- User-provided tags.

Storage constraints:

- `text` should be short and directly actionable.
- `trigger` should be structured.
- `evidence` should reference run IDs, event IDs, and compact summaries.
- No raw chain-of-thought.
- No full logs unless the user explicitly adds them later.

## 13. Dashboard Design

The dashboard should be a local Next.js app served either by its own dev server in development or by the daemon in packaged mode.

Pages:

- Runs: searchable list of recent runs with provider, status, cost, tokens, success signal, loop count, validation status, and intervention count.
- Trace replay: chronological raw and normalized event timeline, decisions, state snapshots, and feedback controls.
- Failure modes: grouped failures by category, repeated loop signatures, stale evidence signals, and validation misses.
- Policies: current effective policy, repo overrides, protected paths, dangerous command patterns, and rule test fixtures.
- Lessons: candidate review queue, approved lessons, disabled lessons, lesson usage, and lesson effectiveness.
- Analytics: cost per successful task, estimated tokens per success, success rate, loop rate, validation block rate, rule decision count, model decision count, accepted/rejected interventions, and repeated tool calls avoided.
- Feedback: mark run success/failure, accept/reject intervention usefulness, and create lesson candidates.

Dashboard API endpoints should read from daemon APIs rather than accessing SQLite directly. This keeps storage ownership in one process.

MVP UI priorities:

- Fast local run list.
- Clear trace timeline.
- Explainable decision cards with reason codes.
- Simple policy editor or read-only policy viewer with file path to edit.
- Lesson approval workflow.
- Analytics summary cards and trend table.

## 14. Storage Schema

SQLite should be the durable source for local traces and configuration state.

Initial tables:

```sql
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  external_id TEXT,
  repo_root TEXT,
  branch TEXT,
  task_summary TEXT,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  success_status TEXT,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  total_estimated_cost_usd REAL DEFAULT 0
);

CREATE TABLE raw_events (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  provider TEXT NOT NULL,
  provider_event_type TEXT NOT NULL,
  received_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id)
);

CREATE TABLE normalized_events (
  id TEXT PRIMARY KEY,
  raw_event_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  summary TEXT NOT NULL,
  data_json TEXT NOT NULL,
  FOREIGN KEY (raw_event_id) REFERENCES raw_events(id),
  FOREIGN KEY (run_id) REFERENCES runs(id)
);

CREATE TABLE run_state_snapshots (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  state_json TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id),
  FOREIGN KEY (event_id) REFERENCES normalized_events(id)
);

CREATE TABLE decisions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  source TEXT NOT NULL,
  action TEXT NOT NULL,
  severity TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  message TEXT NOT NULL,
  rule_id TEXT,
  model_decision_id TEXT,
  data_json TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id),
  FOREIGN KEY (event_id) REFERENCES normalized_events(id)
);

CREATE TABLE model_decisions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  purpose TEXT NOT NULL,
  request_json TEXT NOT NULL,
  response_json TEXT NOT NULL,
  valid INTEGER NOT NULL,
  error TEXT,
  FOREIGN KEY (run_id) REFERENCES runs(id),
  FOREIGN KEY (event_id) REFERENCES normalized_events(id)
);

CREATE TABLE lessons (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  trigger_json TEXT NOT NULL,
  text TEXT NOT NULL,
  confidence REAL NOT NULL,
  scope_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT
);

CREATE TABLE intervention_feedback (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  decision_id TEXT,
  created_at TEXT NOT NULL,
  feedback_type TEXT NOT NULL,
  value TEXT NOT NULL,
  note TEXT,
  FOREIGN KEY (run_id) REFERENCES runs(id),
  FOREIGN KEY (decision_id) REFERENCES decisions(id)
);

CREATE TABLE policy_audit_log (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  source TEXT NOT NULL,
  policy_hash TEXT NOT NULL,
  policy_json TEXT NOT NULL
);
```

Important indexes:

- `runs(updated_at)`
- `runs(provider, updated_at)`
- `raw_events(run_id, received_at)`
- `normalized_events(run_id, timestamp)`
- `decisions(run_id, created_at)`
- `decisions(reason_code, created_at)`
- `lessons(status, updated_at)`
- `intervention_feedback(run_id, created_at)`

## 15. Testing Strategy

Package-level tests:

- Core schema validation for all public payloads.
- Provider normalizer fixtures for Codex, Claude Code, and generic events.
- Command normalization fixtures for common shell commands.
- Dangerous command detection.
- Protected path matching.
- Exact repeated command detection.
- Validation-after-edit state transitions.
- Broad-change threshold decisions.
- Steering response validation and invalid response handling.
- Lesson matching and status filtering.
- Storage migrations and repository methods.

Integration tests:

- CLI hook command posts to daemon and returns expected allow decision.
- Daemon stores raw event, normalized event, run state, and decision in one request.
- Hard rule block short-circuits steering.
- Fail-open behavior when daemon is unavailable.
- Fail-closed behavior when configured.
- Dashboard API returns run list and trace replay data.

End-to-end smoke tests:

- Start daemon with temporary SQLite database.
- Send synthetic run with tool call, edit, validation, and final attempt.
- Confirm dashboard APIs show run, events, decisions, and analytics.
- Send run with edit and no validation before final attempt.
- Confirm validation block decision.

Test fixtures should be compact, synthetic, and scrubbed of secrets. Avoid depending on live model providers in automated tests.

## 16. Privacy and Security Considerations

Default posture:

- Local-first storage.
- No outbound network calls unless explicitly configured.
- Steering model disabled or local-only by default.
- Fail open if daemon is unavailable, unless fail-closed is configured.
- Raw payloads stored locally because replay and future migration need fidelity.

Security risks:

- Raw traces may contain source code, secrets, prompts, credentials, and internal business context.
- Shell command classification can miss dangerous command variants.
- Protected path policies can be too broad or too narrow.
- A steering model could produce malformed or unsafe decisions.
- Dashboard APIs could expose sensitive local traces.

Mitigations:

- Bind daemon to localhost by default.
- Require explicit configuration for non-local listeners.
- Validate every request and response with schemas.
- Keep hard blocks deterministic.
- Store policy audit history.
- Add configurable retention limits.
- Add redaction support after MVP foundation.
- Add dashboard warning for raw trace sensitivity.
- Never send raw trace data to steering providers by default.
- Sanitize command summaries used for analytics and model features.

## 17. Build Milestones

### Milestone 1: Monorepo Foundation

- Create pnpm workspace.
- Add TypeScript, lint, format, and test setup.
- Add `packages/core` with schemas and shared types.
- Add initial docs for configuration and hook protocol.

Exit criteria:

- `pnpm test` runs.
- Core schemas compile and validate fixture payloads.

### Milestone 2: Storage and Daemon Ingest

- Add SQLite migration runner.
- Implement raw event, normalized event, run, decision, and state repositories.
- Create Fastify daemon with health check and hook ingest endpoint.
- Persist raw events before normalization.

Exit criteria:

- Synthetic hook event is stored and visible through a local API.

### Milestone 3: CLI and Generic Hook Adapter

- Implement `agentguard status`.
- Implement `agentguard daemon start`.
- Implement `agentguard hook --provider generic`.
- Add fail-open and fail-closed behavior.

Exit criteria:

- JSON sent to CLI stdin reaches daemon and receives a decision response.

### Milestone 4: Normalization and Run State

- Implement provider normalizer interface.
- Add generic, Codex, and Claude Code normalizers.
- Implement run state updater.
- Persist state snapshots.

Exit criteria:

- Synthetic multi-event run produces coherent run state.

### Milestone 5: Hard Rule Engine

- Implement policy loader.
- Implement initial deterministic hard rules.
- Add rule unit tests and fixture coverage.
- Compose decisions from rule outputs.

Exit criteria:

- Dangerous command, protected path, repeat command, validation, and broad-change scenarios produce expected decisions without model calls.

### Milestone 6: Dashboard MVP

- Build local dashboard shell.
- Add runs list.
- Add trace replay.
- Add decision detail cards.
- Add basic policies, lessons, analytics, and feedback pages.

Exit criteria:

- A user can inspect a run, see why AgentGuard intervened, and mark feedback locally.

### Milestone 7: Lessons

- Implement lesson repository.
- Implement lesson candidate creation from feedback.
- Implement approval, disable, and expiration flows.
- Implement approved lesson matching.
- Add lesson injection decision support.

Exit criteria:

- Approved lessons can be matched and injected into future matching runs.

### Milestone 8: Steering Model Interface

- Add no-op and local HTTP steering providers.
- Add strict request and response schemas.
- Add call budget enforcement.
- Add semantic loop, stale evidence, premature final, broad edit, lesson selection, and failure category purposes.

Exit criteria:

- Ambiguous fixture scenarios can call a fake steering provider, validate output, and persist model decision records.

### Milestone 9: Analytics

- Add token and cost rollups.
- Add success feedback model.
- Add cost-per-success, loop rate, validation block rate, rule/model decision counts, accepted/rejected interventions, and repeated tool calls avoided.

Exit criteria:

- Dashboard analytics update from local synthetic and real runs.

### Milestone 10: Packaging and Real Agent Trials

- Package CLI.
- Document Codex and Claude Code hook setup.
- Run real local trials.
- Tune default rules and policy examples.

Exit criteria:

- A user can install AgentGuard locally, configure at least one agent, run a real task, and review the run in the dashboard.

## 18. Risks and Mitigations

### Provider Hook Instability

Risk: Codex or Claude Code hook formats may change or expose different data than expected.

Mitigation: Keep raw payloads, isolate provider adapters, support generic events, and make normalizers tolerant of unknown fields.

### Too Many False Positives

Risk: Runtime intervention can annoy users if warnings and blocks are noisy.

Mitigation: Start with conservative hard blocks, make warnings visible but non-blocking, expose policy overrides, and track intervention feedback.

### Model Cost and Latency

Risk: Steering model calls could undermine the low-token product promise.

Mitigation: Hard rules run first, model calls are budgeted per run, inputs are compact structured features, and steering is optional.

### Sensitive Trace Storage

Risk: Local traces can contain secrets and proprietary code.

Mitigation: Local-only default, localhost binding, retention settings, clear UI warnings, future redaction, and no raw cloud upload by default.

### Weak Success Measurement

Risk: Cost-per-success depends on knowing whether a task succeeded.

Mitigation: Use explicit user feedback first, supplement with validation signals, and label inferred success separately from confirmed success.

### Command Detection Evasion

Risk: Dangerous command matching can miss obfuscated or multi-step commands.

Mitigation: Normalize commands, match executable and arguments, add tests for variants, and keep policy configurable.

### Broad Edit Detection Accuracy

Risk: File and line counts may be unavailable from some hooks.

Mitigation: Use best available metadata, derive from tool outputs where possible, and mark confidence on broad-change decisions.

### Dashboard Scope Creep

Risk: The dashboard can consume time before runtime value is proven.

Mitigation: Build the dashboard around replay, decision explanation, feedback, and analytics first. Defer advanced visualizations.

### Packaging Complexity

Risk: Running daemon, CLI, dashboard, and SQLite together can complicate installation.

Mitigation: Keep the first install path local and explicit, use one CLI entry point, and document dev and packaged modes separately.

### Lessons Becoming Vague Memory

Risk: Lessons can become generic advice that pollutes future runs.

Mitigation: Require structured triggers, approval, scoped evidence, confidence, expiration, and usage analytics.
