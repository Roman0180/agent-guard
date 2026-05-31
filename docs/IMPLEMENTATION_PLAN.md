# AgentGuard Implementation Plan

## 1. Product Summary

AgentGuard is a local-first runtime reliability layer for AI coding agents such as Codex and Claude Code. It runs as a sidecar beside existing agents instead of replacing them. AgentGuard receives hook events from agent runtimes, normalizes and stores those events locally, retrieves approved reliability patterns, evaluates deterministic policies, optionally asks a small steering model for ambiguous cases, and returns decisions that can warn, block, require continuation, inject context, or require validation.

AgentGuard also includes a prompt optimization layer. This layer does not replace the runtime decision pipeline. It runs before hard rules and steering so the agent starts with, or continues from, a compact task contract instead of vague or stale prompt context. Prompt optimization should reduce wasted steps and downstream tokens while preserving deterministic runtime enforcement.

AgentGuard's reuse layer is inspired by the observation that coding agents often waste cost by re-exploring the same dead ends. AgentGuard should capture approved local lessons in a structured operational format: the situation encountered, the dead ends to avoid, and the unlock that worked. Injection must be confidence-gated, short, and explainable.

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
- Prompt optimization layer for task contracts, continuation prompts, compaction prompts, and approved lesson injection.
- Confidence-gated reasoning reuse with approved local patterns that capture situation, dead ends, and unlock.
- Semantic file memory with compact per-file summaries, validation notes, and last-observed hashes.
- Tool supervision for redundant fetches, repeated reads, repeated searches, and risky tool calls.
- Reasoning-aware context pruning that preserves constraints, validation evidence, and dead-end history.
- Lightweight difficulty-state tracking to decide whether to inject context, ask steering, require validation, or stay quiet.
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

- Ambiguous prompt optimization cases.
- Semantic loop detection.
- Stale evidence detection.
- Dead-end pattern matching when deterministic lesson triggers are insufficient.
- Difficulty-state classification.
- Reasoning-aware pruning classification.
- Premature final answer detection.
- Broad edit classification.
- Approved lesson selection.
- Failure category classification.

## 3. Non-Goals

The MVP should not attempt to:

- Replace Codex, Claude Code, or any other coding agent.
- Build a fully remote SaaS control plane.
- Store traces in cloud services by default.
- Use a shared cloud pattern library by default.
- Upload raw traces, raw prompts, source files, tool outputs, or chain-of-thought for pattern creation by default.
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
│         │          │ lessons      │                  │
│         │          │ retrieval    │                  │
│         │          └──────┬───────┘                  │
│         │                 ▼                          │
│         │          ┌──────────────┐                  │
│         │          │ semantic     │                  │
│         │          │ file memory  │                  │
│         │          └──────┬───────┘                  │
│         │                 ▼                          │
│         │          ┌──────────────┐                  │
│         │          │ prompt       │                  │
│         │          │ optimizer    │                  │
│         │          └──────┬───────┘                  │
│         │                 ▼                          │
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

Runtime pipeline:

```text
Hook event
  ↓
Normalize event
  ↓
Update run state
  ↓
Retrieve approved matching lessons
  ↓
Retrieve semantic file memory
  ↓
Prompt optimization layer
  ↓
Tool supervision + context pruning
  ↓
Hard rule engine
  ↓
Optional small steering model
  ↓
Decision composer
  ↓
Trace store + dashboard + lesson memory + analytics
```

Detailed runtime flow:

1. Receive raw hook event.
2. Normalize the event.
3. Store raw and normalized event.
4. Load or update run state.
5. Load repo policy.
6. Retrieve approved matching lessons and confidence-gated reasoning patterns.
7. Retrieve compact semantic file memory for touched or relevant files.
8. If the event is `UserPromptSubmit`, `Stop`, `PreCompact`, or `PostCompact`, run prompt optimization.
9. Run deterministic tool supervision and context-pruning checks.
10. Evaluate deterministic hard rules.
11. If a hard rule blocks or requires continuation, return immediately. If applicable, include the optimized continuation prompt.
12. If needed, call the small steering model with compact structured features.
13. Compose final decision.
14. Store the event, prompt optimization result, decision, state snapshot, file-memory update, and analytics features.
15. Show events, prompt optimizations, decisions, state, lessons, file memory, and analytics in the dashboard.

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
    file-memory/
      src/
        summaries.ts
        matcher.ts
        repository.ts
      package.json
    tool-supervisor/
      src/
        redundant-fetches.ts
        repeated-reads.ts
        pruning.ts
      package.json
    prompt-optimizer/
      src/
        contracts.ts
        templates.ts
        continuation.ts
        compaction.ts
        evaluation.ts
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

New prompt optimization package:

- `packages/prompt-optimizer`: prompt rewriting, task contracts, continuation prompts, compaction prompts, lesson injection, and prompt optimization evaluation metadata.
- `packages/file-memory`: compact per-file semantic summaries, matching, invalidation by content hash, and file-memory repository helpers.
- `packages/tool-supervisor`: redundant tool-call detection, repeated read/search tracking, context-pruning signals, and tool-cost avoidance metrics.
- `packages/evaluation`: local benchmark fixtures, A/B-style comparison harnesses, cost-per-success calculations, and correlation/causality labeling helpers.

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
    | "compaction"
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

Provider events should map into these stable event types. For example, `UserPromptSubmit` maps to `prompt`, `Stop` maps to `final_attempt`, and `PreCompact` or `PostCompact` maps to `compaction` with the provider lifecycle phase preserved in metadata.

### Decision

```ts
type RuntimeDecision = {
  id: string;
  runId: string;
  eventId: string;
  createdAt: string;
  source: "hard_rule" | "steering_model" | "manual" | "system";
  action:
    | "allow"
    | "warn"
    | "block"
    | "block_continue"
    | "require_continue"
    | "require_approval"
    | "inject_lesson";
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
  situation: string;
  deadEnds: string[];
  unlock: string;
  injectionFormat: "operational_lesson_v1";
  confidence: number;
  evidence: LessonEvidence[];
  scope: LessonScope;
  status: "candidate" | "approved" | "disabled" | "expired";
  usageStats: LessonUsageStats;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
};
```

Lesson fields must remain operational and compact:

- `situation`: the compact scenario where the lesson applies.
- `deadEnds`: specific approaches, commands, assumptions, or files that wasted effort or caused failure.
- `unlock`: the action or insight that resolved the issue.
- `text`: a short rendered lesson derived from the structured fields for injection.

This structure is intentionally not raw chain-of-thought. It captures reusable operational guidance, not hidden reasoning traces.

### Semantic File Memory

```ts
type FileMemory = {
  id: string;
  repoRoot: string;
  path: string;
  contentHash?: string;
  language?: string;
  summary: string;
  exportedSymbols: string[];
  responsibilities: string[];
  validationNotes: string[];
  lastObservedAt: string;
  sourceRunIds: string[];
  confidence: number;
};
```

Semantic file memory should help the agent avoid repeatedly reading unchanged files. It stores compact, local, per-file operational summaries and must not store full file contents by default.

### Pattern Match

```ts
type PatternMatch = {
  id: string;
  runId: string;
  eventId: string;
  lessonId?: string;
  fileMemoryId?: string;
  matchKind: "lesson" | "file_memory" | "dead_end" | "tool_pattern";
  confidence: number;
  triggerSummary: string;
  shouldInject: boolean;
  injected: boolean;
  reasonCode: string;
  createdAt: string;
};
```

Pattern injection must be confidence-gated. The runtime should store matches even when `shouldInject` is false so the dashboard can explain why AgentGuard stayed quiet.

### Difficulty State

```ts
type DifficultyState = {
  runId: string;
  state: "fast" | "normal" | "slow" | "skip";
  confidence: number;
  reasons: string[];
  updatedAt: string;
};
```

Difficulty state is a compact runtime signal, not an orchestration system. It helps AgentGuard decide whether to inject context, ask steering, require validation, or suppress low-confidence interventions.

### Prompt Optimization

Prompt optimization schemas live in `packages/core` because the daemon, dashboard, storage, steering, and prompt optimizer all need the same contract.

```ts
type PromptRewriteMode =
  | "initial_task"
  | "continuation"
  | "compaction"
  | "lesson_injection";

type TaskContract = {
  task: string;
  scope: string[];
  constraints: string[];
  validation_requirements: string[];
  relevant_lessons: string[];
  dead_ends_to_avoid: string[];
  file_memory: string[];
  risk_notes: string[];
};

type PromptOptimizationInput = {
  runId: string;
  eventId: string;
  mode: PromptRewriteMode;
  provider: AgentProvider;
  originalPrompt?: string;
  normalizedEvent: NormalizedEvent;
  runState: RunState;
  policy: PolicyConfig;
  approvedLessons: Lesson[];
  maxPromptLength: number;
};

type PromptOptimizationResult = {
  id: string;
  runId: string;
  eventId: string;
  mode: PromptRewriteMode;
  optimizedPrompt: string;
  taskContract: TaskContract;
  constraints: string[];
  validationRequirements: string[];
  relevantLessons: Lesson[];
  patternMatches: PatternMatch[];
  fileMemory: FileMemory[];
  riskNotes: string[];
  estimatedTokenDelta: number;
  rewriteReason: string;
  shouldInject: boolean;
  injected: boolean;
  deterministicOrModel: "deterministic" | "model_assisted";
  createdAt: string;
};
```

The wire format and storage metadata should expose prompt optimization fields as `optimized_prompt`, `task_contract`, `validation_requirements`, `relevant_lessons`, `risk_notes`, `estimated_token_delta`, `rewrite_reason`, and `should_inject`. TypeScript implementations can use local naming conventions internally if adapters serialize the documented field names.

Example optimization:

```text
Original prompt:
Fix the logger issue in Queue Service 2.

Optimized prompt:
Task: Fix the Queue Service 2 logger issue.
Scope: Inspect current logging setup, dependency injection registration, configuration, and tests before editing.
Constraints: Keep changes minimal. Do not refactor unrelated services.
Validation: Run targeted Queue Service 2 build/tests after edits.
Relevant lesson: For C# DI/logging failures, inspect service registration before constructor or test changes.
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

## 10. Prompt Optimization Layer Design

The prompt optimization layer runs after run state and lesson retrieval, but before hard rules and optional steering. It improves prompt structure so the coding agent wastes fewer steps and tokens. It must not weaken or bypass hard-rule enforcement.

Primary purposes:

- Rewrite vague user prompts into compact task contracts.
- Add repo-specific constraints from policy and run context.
- Add validation expectations before edits begin.
- Inject only relevant approved lessons.
- Inject dead ends to avoid and the unlock that worked when a high-confidence approved pattern matches.
- Inject compact semantic file memory for relevant unchanged files instead of encouraging repeated reads.
- Generate continuation prompts when the agent tries to stop too early.
- Generate compaction summaries for `PreCompact` and `PostCompact` events.
- Reduce downstream token usage by giving Codex or Claude Code a clearer task structure.
- Prefer deterministic and template-based rewriting first.
- Use the small steering model only for ambiguous prompt optimization cases.

The optimizer should run mainly on:

- `UserPromptSubmit`: create an initial task contract and optimized prompt.
- `Stop` or `block_continue`: create a short continuation prompt when the agent attempts to stop prematurely.
- `PreCompact`: create a compact summary of durable state, open decisions, validation requirements, and relevant lessons.
- `PostCompact`: verify or repair the compacted continuation context.

Output fields:

- `optimized_prompt`
- `task_contract`
- `constraints`
- `validation_requirements`
- `relevant_lessons`
- `dead_ends_to_avoid`
- `file_memory`
- `pattern_matches`
- `risk_notes`
- `estimated_token_delta`
- `rewrite_reason`
- `should_inject`

Implementation approach:

1. Classify the event into a `PromptRewriteMode`.
2. Build compact features from normalized event, run state, repo policy, and approved matching lessons.
3. Retrieve high-confidence pattern matches and relevant file-memory summaries.
4. Apply deterministic templates for task contracts, validation requirements, continuation prompts, compaction prompts, dead-end avoidance, and file-memory insertion.
5. Inject at most 1-3 short approved lessons when their structured triggers and confidence gate match the current run.
6. Estimate token delta by comparing original prompt length with optimized prompt length and expected avoided repeated context, repeated reads, and repeated tool calls.
7. Reject or truncate rewrites that exceed the configured maximum length.
8. Store the result even when `shouldInject` is false so the dashboard can explain the decision.
9. For ambiguous cases only, optionally ask the steering model to choose or refine a rewrite using compact structured prompt metadata.
10. Ignore invalid model rewrites and fall back to deterministic output.

Package ownership:

- `packages/prompt-optimizer/contracts.ts`: task contract builders and validation helpers.
- `packages/prompt-optimizer/templates.ts`: deterministic prompt templates.
- `packages/prompt-optimizer/continuation.ts`: short continuation prompt generation.
- `packages/prompt-optimizer/compaction.ts`: `PreCompact` and `PostCompact` summaries.
- `packages/prompt-optimizer/evaluation.ts`: length limits, token delta estimates, and rewrite metadata.
- `packages/prompt-optimizer/patterns.ts`: confidence-gated lesson and dead-end rendering.
- `packages/prompt-optimizer/file-memory.ts`: rendering compact file-memory hints.

Prompt optimization is an assistive input-shaping layer. Hard rules still decide whether a run is allowed, blocked, or required to continue.

## 11. Hard Rule Engine Design

The hard rule engine should be deterministic, fast, and model-free. It receives a normalized event, current run state, loaded policy config, and repository metadata. It returns zero or more decisions.

Hard rules run after prompt optimization so they can include optimized continuation prompts in their responses, but they remain deterministic and zero-token. Prompt optimization must never weaken hard-rule enforcement or convert a block into an allow decision.

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
- `redundant_fetch.warn`: warn when the same URL, file, or search query is fetched repeatedly without new evidence.
- `repeated_read.prune`: suggest file-memory or compact summaries when unchanged files are read repeatedly.
- `dead_end_redirect.require_continue`: require continuation with a redirect prompt when the current trajectory matches an approved dead-end pattern.
- `validation_after_edit.require`: require continuation instead of final answer when code was edited and no accepted validation has run.
- `broad_change.require_approval`: require approval when changed file or changed line thresholds are exceeded.

Design principles:

- Rules should return structured reason codes, not free-form-only text.
- Rules should be separately testable with fixture events.
- Block and require decisions should short-circuit steering model calls.
- If validation is missing on `Stop`, the validation rule should produce `block_continue` and use the prompt optimizer to attach a short continuation prompt.
- Warn decisions can be accumulated and shown without preventing later evaluation.
- Rule config should come from layered policy loading: defaults, global user config, repo config, then runtime overrides.

## 12. Small Steering Model Design

The steering model should be optional and used only when deterministic rules or deterministic prompt templates are insufficient. It should receive compact structured features, not raw transcripts or full raw prompt history.

Model request:

```ts
type SteeringRequest = {
  runId: string;
  purpose:
    | "semantic_loop"
    | "stale_evidence"
    | "dead_end_match"
    | "premature_final"
    | "broad_edit"
    | "lesson_selection"
    | "difficulty_state"
    | "context_pruning"
    | "failure_category"
    | "prompt_optimization";
  features: Record<string, unknown>;
  allowedActions: RuntimeDecision["action"][];
  candidateLessons?: Lesson[];
  candidateFileMemory?: FileMemory[];
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
  fileMemoryIds?: string[];
  difficultyState?: DifficultyState["state"];
  pruneHints?: string[];
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
- For prompt optimization, send compact prompt metadata, task hints, policy constraints, validation state, and candidate lesson summaries only.
- For dead-end matching, send only compact summaries of recent events, command signatures, failure categories, and approved candidate lesson summaries.
- For file memory, send only file paths, hashes, compact summaries, and relevance features; never send full file contents by default.
- Ignore invalid model rewrites.
- Reject or truncate long generated rewrites before they can be injected.

Initial provider strategy:

- Define provider-agnostic interface in `packages/steering`.
- Support a no-op provider for tests and default installs.
- Add configurable local HTTP provider for users running a small local model.
- Add later cloud provider support behind explicit configuration.

## 13. Lesson Memory Design

Lessons are structured memory items that require approval before runtime injection. They should help avoid repeated mistakes without storing raw reasoning.

AgentGuard lessons should use a compact three-part operational format:

- Situation: when this lesson applies.
- Dead ends: specific approaches, commands, assumptions, or files that wasted work.
- Unlock: the action or insight that led to a correct solution.

The rendered injection should be short and may combine these fields into a single block. The stored lesson remains structured so matching, filtering, and evaluation can inspect each field separately.

Lesson lifecycle:

1. Candidate generated from successful run, repeated failure pattern, explicit dead-end redirect, or user feedback.
2. User reviews candidate in dashboard.
3. User approves, disables, edits, or expires the lesson.
4. Runtime matches approved lessons against compact run features.
5. A confidence gate decides whether the lesson is injected, logged as a non-injected match, or ignored.
6. Prompt optimizer injects at most 1-3 short approved matching lessons into task contracts or continuation prompts.
7. Hard rules or steering model may still decide whether lesson injection should be suppressed for a specific event.
8. Dashboard tracks accepted, ignored, stale, injected, non-injected, and helpful/unhelpful lessons.

Matching inputs:

- Repo language and framework hints.
- Error category and command output summary.
- File paths and file extensions.
- Tool call pattern.
- Failure mode.
- User-provided tags.

Storage constraints:

- `text` should be short and directly actionable.
- `situation`, `deadEnds`, and `unlock` should be structured and separately stored.
- `trigger` should be structured.
- `evidence` should reference run IDs, event IDs, and compact summaries.
- Approved lessons can be injected by the prompt optimizer, but only when relevant.
- Inject no more than 1-3 lessons per prompt optimization.
- Apply a configurable confidence threshold before injection.
- Lesson text must be short and scoped.
- Disabled, expired, or candidate lessons must never be injected automatically.
- No raw chain-of-thought.
- Never inject raw trace history.
- No full logs unless the user explicitly adds them later.

## 13A. Semantic File Memory Design

Semantic file memory stores compact local summaries of files the agent has already inspected. Its purpose is to reduce repeated file reads and preserve repository understanding across runs without storing full file contents by default.

Lifecycle:

1. File read, search, edit, or validation events identify candidate files.
2. AgentGuard records path, hash when available, language hints, exported symbols, responsibilities, and validation notes.
3. If the file changes, the memory is marked stale until refreshed.
4. Future runs retrieve matching file memory by repo, path, symbols, task terms, and confidence.
5. Prompt optimizer injects only compact file-memory hints when relevant.

Constraints:

- Store local file memory only by default.
- Do not store full source file contents by default.
- Invalidate or down-rank memory when content hash changes.
- Show file-memory provenance in the dashboard.
- Track repeated reads avoided as an analytics metric.

## 13B. Tool Supervision and Context Pruning

Tool supervision detects wasteful or risky tool behavior before it compounds cost.

Minimum detections:

- Repeated reads of the same unchanged file.
- Repeated searches with equivalent queries.
- Repeated fetches of the same URL or dependency metadata.
- Repeated failed commands without changed inputs.
- Tool calls that revisit a known dead end from an approved lesson.

Context pruning should be reasoning-aware. It should preserve active task constraints, validation requirements, failed approaches, file-memory hints, policy decisions, and user-approved lessons while pruning stale logs, duplicate tool output, and already-resolved branches.

The pruning layer should emit explainable metadata:

- what was kept
- what was pruned
- why it was pruned
- estimated token delta
- whether pruning was deterministic or model-assisted

## 14. Dashboard Design

The dashboard should be a local Next.js app served either by its own dev server in development or by the daemon in packaged mode.

Pages:

- Runs: searchable list of recent runs with provider, status, cost, tokens, success signal, loop count, validation status, and intervention count.
- Trace replay: chronological raw and normalized event timeline, prompt optimizations, decisions, state snapshots, and feedback controls.
- Failure modes: grouped failures by category, repeated loop signatures, stale evidence signals, and validation misses.
- Policies: current effective policy, repo overrides, protected paths, dangerous command patterns, and rule test fixtures.
- Lessons and patterns: candidate review queue, approved lessons, disabled lessons, situation/dead-end/unlock fields, confidence gates, pattern matches, lesson usage, and lesson effectiveness.
- File memory: per-repo file summaries, stale/hash status, provenance, injected file-memory hints, and repeated reads avoided.
- Tool supervision: redundant fetches, repeated reads/searches, repeated failed commands, and dead-end redirects.
- Analytics: cost per successful task, estimated tokens per success, success rate, loop rate, validation block rate, prompt optimization count, continuation prompt count, compaction prompt count, average optimized prompt length, rule decision count, model decision count, accepted/rejected interventions, pattern match rate, high-confidence injection rate, repeated reads avoided, repeated fetches avoided, and repeated tool calls avoided.
- Feedback: mark run success/failure, accept/reject intervention usefulness, and create lesson candidates.

Prompt optimization UI should show:

- Original prompt when raw prompt storage is enabled.
- Optimized prompt.
- Task contract.
- Rewrite reason.
- Whether the rewrite was injected.
- Deterministic or model-assisted rewrite badge.
- Relevant approved lessons injected.
- Dead ends to avoid.
- File-memory hints injected.
- Pattern match confidence and gate result.
- Estimated token delta.

Dashboard API endpoints should read from daemon APIs rather than accessing SQLite directly. This keeps storage ownership in one process.

MVP UI priorities:

- Fast local run list.
- Clear trace timeline.
- Explainable decision cards with reason codes.
- Prompt optimization cards in trace replay.
- Simple policy editor or read-only policy viewer with file path to edit.
- Lesson approval workflow.
- File-memory review and stale-memory inspection.
- Tool-supervision event list.
- Analytics summary cards and trend table, including prompt optimization metrics.

Analytics should include:

- Cost per successful task when cost data exists.
- Estimated tokens per successful task.
- Success rate.
- Loop rate.
- Validation block rate.
- Rule decision count.
- Model decision count.
- Prompt optimizations count.
- Continuation prompts count.
- Compaction prompts count.
- Average optimized prompt length.
- Runs with prompt optimization vs without.
- High-confidence pattern match rate.
- Injection rate after confidence gating.
- Runs with pattern injection vs without.
- Runs with file-memory injection vs without.
- Repeated tool-call rate after prompt optimization.
- Repeated file-read rate after file-memory injection.
- Redundant fetch/search rate after tool supervision.
- Validation block rate after prompt optimization.
- Interventions accepted and rejected.
- Repeated tool calls avoided.

Prompt optimization analytics should clearly label correlation as correlation unless an explicit A/B evaluation exists. For example, "runs with prompt optimization had lower repeated tool-call rate" must not be presented as causal unless controlled evaluation is implemented.

## 15. Storage Schema

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

CREATE TABLE prompt_optimizations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  original_prompt TEXT,
  optimized_prompt TEXT NOT NULL,
  task_contract_json TEXT NOT NULL,
  rewrite_reason TEXT NOT NULL,
  should_inject INTEGER NOT NULL,
  injected INTEGER NOT NULL,
  deterministic_or_model TEXT NOT NULL,
  estimated_token_delta INTEGER NOT NULL,
  created_at TEXT NOT NULL,
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
  situation TEXT NOT NULL,
  dead_ends_json TEXT NOT NULL,
  unlock TEXT NOT NULL,
  injection_format TEXT NOT NULL,
  confidence REAL NOT NULL,
  scope_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  usage_stats_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT
);

CREATE TABLE file_memory (
  id TEXT PRIMARY KEY,
  repo_root TEXT NOT NULL,
  path TEXT NOT NULL,
  content_hash TEXT,
  language TEXT,
  summary TEXT NOT NULL,
  exported_symbols_json TEXT NOT NULL,
  responsibilities_json TEXT NOT NULL,
  validation_notes_json TEXT NOT NULL,
  source_run_ids_json TEXT NOT NULL,
  confidence REAL NOT NULL,
  last_observed_at TEXT NOT NULL,
  stale INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE pattern_matches (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  lesson_id TEXT,
  file_memory_id TEXT,
  match_kind TEXT NOT NULL,
  confidence REAL NOT NULL,
  trigger_summary TEXT NOT NULL,
  should_inject INTEGER NOT NULL,
  injected INTEGER NOT NULL,
  reason_code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id),
  FOREIGN KEY (event_id) REFERENCES normalized_events(id),
  FOREIGN KEY (lesson_id) REFERENCES lessons(id),
  FOREIGN KEY (file_memory_id) REFERENCES file_memory(id)
);

CREATE TABLE tool_supervision_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  supervision_type TEXT NOT NULL,
  signature TEXT NOT NULL,
  action TEXT NOT NULL,
  message TEXT NOT NULL,
  estimated_token_delta INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  data_json TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id),
  FOREIGN KEY (event_id) REFERENCES normalized_events(id)
);

CREATE TABLE evaluation_runs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  eval_name TEXT NOT NULL,
  baseline_run_ids_json TEXT NOT NULL,
  treatment_run_ids_json TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  causal_claim_allowed INTEGER NOT NULL DEFAULT 0
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
- `prompt_optimizations(run_id, created_at)`
- `prompt_optimizations(event_id)`
- `prompt_optimizations(mode, created_at)`
- `decisions(run_id, created_at)`
- `decisions(reason_code, created_at)`
- `lessons(status, updated_at)`
- `file_memory(repo_root, path)`
- `file_memory(repo_root, content_hash)`
- `pattern_matches(run_id, created_at)`
- `pattern_matches(match_kind, confidence)`
- `tool_supervision_events(run_id, created_at)`
- `intervention_feedback(run_id, created_at)`

## 16. Testing Strategy

Package-level tests:

- Core schema validation for all public payloads.
- Provider normalizer fixtures for Codex, Claude Code, and generic events.
- Command normalization fixtures for common shell commands.
- Dangerous command detection.
- Protected path matching.
- Exact repeated command detection.
- Validation-after-edit state transitions.
- Broad-change threshold decisions.
- Prompt optimizer converts vague prompts into structured task contracts.
- Validation-missing `Stop` creates a short continuation prompt.
- Approved lessons are injected only when relevant.
- Disabled, candidate, and expired lessons are ignored by prompt optimization.
- Prompt optimization never injects raw trace history.
- Prompt rewrites stay under configured maximum length.
- Three-field lesson rendering includes situation, dead ends, and unlock without raw reasoning.
- Confidence gates suppress low-confidence pattern injection and log the non-injection reason.
- Semantic file memory retrieval ignores stale hashes and never injects full file contents by default.
- Tool supervision detects repeated reads, repeated searches, redundant fetches, and repeated failed commands.
- Context pruning preserves active constraints, validation requirements, and dead ends to avoid.
- Difficulty-state classification transitions are stable and respect hysteresis.
- Steering response validation and invalid response handling.
- Lesson matching and status filtering.
- Storage migrations and repository methods.

Integration tests:

- CLI hook command posts to daemon and returns expected allow decision.
- Daemon stores raw event, normalized event, run state, and decision in one request.
- Daemon stores prompt optimization results linked to `event_id`.
- Daemon stores file-memory updates and pattern-match records linked to events.
- Redundant tool supervision events are visible through dashboard APIs.
- Hard rule block short-circuits steering.
- Validation block uses the prompt optimizer result when returning a continuation prompt.
- Fail-open behavior when daemon is unavailable.
- Fail-closed behavior when configured.
- Dashboard API returns run list, trace replay data, and prompt optimization detail.

End-to-end smoke tests:

- Start daemon with temporary SQLite database.
- Send synthetic run with tool call, edit, validation, and final attempt.
- Confirm dashboard APIs show run, events, decisions, and analytics.
- Send run with edit and no validation before final attempt.
- Confirm validation block decision.
- Send prompt optimization fixture and confirm dashboard can display original prompt, optimized prompt, task contract, rewrite reason, injection status, deterministic/model badge, and injected lessons.
- Send repeated file-read and repeated-search fixtures and confirm tool supervision records are created.
- Send matching lesson fixtures and confirm only high-confidence approved patterns are injected.
- Run a local synthetic baseline/treatment comparison and confirm analytics label it as correlation unless the fixture is explicitly configured as controlled.

Test fixtures should be compact, synthetic, and scrubbed of secrets. Avoid depending on live model providers in automated tests.

## 17. Privacy and Security Considerations

Default posture:

- Local-first storage.
- No outbound network calls unless explicitly configured.
- Steering model disabled or local-only by default.
- Fail open if daemon is unavailable, unless fail-closed is configured.
- Raw payloads stored locally because replay and future migration need fidelity.
- Raw prompt storage is configurable.
- Prompt optimization storage is local-only by default.
- File memory and pattern matches are local-only by default.
- Any future shared pattern library is opt-in and must use scrubbed, approved operational lessons.

Security risks:

- Raw traces and raw prompts may contain source code, secrets, credentials, prompts, and internal business context.
- Shell command classification can miss dangerous command variants.
- Protected path policies can be too broad or too narrow.
- A steering model could produce malformed or unsafe decisions.
- File memory could become stale and mislead the agent after source changes.
- Pattern injection could overfit to a superficially similar but semantically different task.
- Dashboard APIs could expose sensitive local traces.

Mitigations:

- Bind daemon to localhost by default.
- Require explicit configuration for non-local listeners.
- Validate every request and response with schemas.
- Keep hard blocks deterministic.
- Store policy audit history.
- Add configurable retention limits.
- Add redaction support after MVP foundation.
- Add future redaction support for raw prompts before any non-local export features.
- Add dashboard warning for raw trace sensitivity.
- Never send raw trace data to steering providers by default.
- Never send raw full prompts or raw trace history to steering providers for prompt optimization.
- Never send full file contents to steering providers for file-memory matching by default.
- Apply confidence thresholds and provenance display before injecting lessons or file-memory hints.
- Mark file memory stale when hashes change or validation contradicts the summary.
- Sanitize command summaries used for analytics and model features.

## 18. Build Milestones

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

### Milestone 5: Prompt Optimization Layer

- Add `packages/prompt-optimizer`.
- Add prompt optimization schemas.
- Implement deterministic task-contract templates.
- Implement continuation prompt generation.
- Implement compaction prompt generation.
- Implement lesson injection.
- Implement dead-end-to-avoid rendering.
- Implement file-memory hint rendering.
- Store prompt optimization results.
- Add unit tests.

Exit criteria:

- Vague prompt fixtures produce compact task contracts.
- Validation-missing `Stop` fixtures produce short continuation prompts.
- Approved relevant lessons can be injected while disabled lessons are ignored.
- High-confidence dead-end patterns render as short avoidance hints.
- Prompt optimization results are persisted and queryable by event.

### Milestone 6: Hard Rule Engine

- Implement policy loader.
- Implement initial deterministic hard rules.
- Implement redundant fetch, repeated read, and repeated search tool-supervision rules.
- Implement dead-end redirect rule.
- Add rule unit tests and fixture coverage.
- Compose decisions from rule outputs.

Exit criteria:

- Dangerous command, protected path, repeat command, redundant fetch, repeated read, repeated search, dead-end redirect, validation, and broad-change scenarios produce expected decisions without model calls.

### Milestone 7: Dashboard MVP

- Build local dashboard shell.
- Add runs list.
- Add trace replay.
- Add decision detail cards.
- Add prompt optimization cards.
- Add basic policies, lessons, file memory, tool supervision, analytics, and feedback pages.

Exit criteria:

- A user can inspect a run, see optimized prompts, pattern matches, file-memory hints, tool-supervision events, and why AgentGuard intervened, then mark feedback locally.

### Milestone 8: Lessons

- Implement lesson repository.
- Implement situation/dead-end/unlock lesson fields.
- Implement lesson candidate creation from feedback.
- Implement approval, disable, and expiration flows.
- Implement approved lesson matching.
- Implement confidence-gated pattern matching.
- Add prompt optimizer lesson injection support.

Exit criteria:

- Approved lessons can be matched, confidence-gated, and injected into future matching runs.
- Low-confidence matches are logged but not injected.

### Milestone 9: Semantic File Memory and Tool Supervision

- Add `packages/file-memory`.
- Add file-memory repository and hash-based staleness tracking.
- Add compact file summary matching by repo, path, symbols, and task terms.
- Add `packages/tool-supervisor`.
- Add redundant fetch, repeated read/search, repeated failed command, and dead-end revisit detection.
- Add dashboard APIs for file memory, pattern matches, and tool-supervision events.

Exit criteria:

- Repeated unchanged file reads can be replaced by compact file-memory hints.
- Stale file memory is not injected after content hash changes.
- Redundant fetch/search fixtures produce explainable tool-supervision events.

### Milestone 10: Steering Model Interface

- Add no-op and local HTTP steering providers.
- Add strict request and response schemas.
- Add call budget enforcement.
- Add semantic loop, stale evidence, dead-end match, premature final, broad edit, prompt optimization, lesson selection, difficulty state, context pruning, and failure category purposes.

Exit criteria:

- Ambiguous fixture scenarios can call a fake steering provider, validate output, and persist model decision records.

### Milestone 11: Analytics and Evaluation

- Add token and cost rollups.
- Add success feedback model.
- Add cost-per-success, loop rate, validation block rate, prompt optimization metrics, rule/model decision counts, accepted/rejected interventions, pattern match metrics, file-memory metrics, tool-supervision metrics, and repeated tool calls avoided.
- Add local synthetic benchmark fixtures for repeated reads, repeated searches, dead-end redirects, prompt optimization, and validation blocks.
- Label prompt optimization outcome comparisons as correlation unless an A/B evaluation exists.
- Label pattern and file-memory outcome comparisons as correlation unless an explicit controlled evaluation exists.

Exit criteria:

- Dashboard analytics update from local synthetic and real runs.
- Evaluation reports distinguish correlation from controlled comparisons.

### Milestone 12: Packaging and Real Agent Trials

- Package CLI.
- Document Codex and Claude Code hook setup.
- Run real local trials.
- Tune default rules and policy examples.

Exit criteria:

- A user can install AgentGuard locally, configure at least one agent, run a real task, and review the run in the dashboard.

## 19. Risks and Mitigations

### Provider Hook Instability

Risk: Codex or Claude Code hook formats may change or expose different data than expected.

Mitigation: Keep raw payloads, isolate provider adapters, support generic events, and make normalizers tolerant of unknown fields.

### Too Many False Positives

Risk: Runtime intervention can annoy users if warnings and blocks are noisy.

Mitigation: Start with conservative hard blocks, make warnings visible but non-blocking, expose policy overrides, and track intervention feedback.

### Model Cost and Latency

Risk: Steering model calls could undermine the low-token product promise.

Mitigation: Deterministic prompt templates and hard rules run first, model calls are budgeted per run, inputs are compact structured features, and steering is optional.

### Prompt Rewrite Overreach

Risk: Prompt optimization could distort user intent, add unrelated scope, or make the agent overconfident.

Mitigation: Use conservative deterministic templates, preserve the original task, keep constraints explicit, show rewrite reasons in the dashboard, store optimization metadata, and allow prompt injection to be disabled by policy.

### Prompt Optimization Privacy

Risk: Original prompts may contain secrets, private code, or internal details.

Mitigation: Keep prompt storage local-only by default, make raw prompt storage configurable, never inject raw trace history, avoid sending full prompts to steering providers, and add redaction support before non-local export.

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

Mitigation: Require situation/dead-end/unlock fields, structured triggers, approval, scoped evidence, confidence gates, expiration, and usage analytics.

### Pattern Over-Injection

Risk: AgentGuard could inject too many patterns and bloat prompts or bias the agent toward the wrong prior solution.

Mitigation: Inject at most 1-3 lessons, require confidence thresholds, log non-injected matches, show provenance, and track helpful/unhelpful feedback.

### Stale File Memory

Risk: File summaries can become inaccurate after source changes.

Mitigation: Store content hashes when available, mark memory stale on mismatch, down-rank old summaries, and require refresh before injection.

### Evaluation Overclaiming

Risk: Analytics can imply causality when they only show correlation.

Mitigation: Label uncontrolled comparisons as correlation, add explicit benchmark modes for controlled comparisons, and keep raw evaluation inputs local.
