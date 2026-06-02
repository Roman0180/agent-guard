# Agent Sidecar MVPs and Codex Prompts

This checklist translates the implementation plan into implementation-ready MVP slices and Codex prompts. It keeps the same product order used by the public site: business problem, six sidecar controls, demo flow, how to use, and deeper architecture.

## MVP Principles

- Keep Agent Sidecar terminal-run and local-first: `pip` install, daemon in the user's shell, and Codex or Claude Code hooks calling the sidecar command.
- Persist raw hook payloads before normalization so every decision remains auditable.
- Prefer deterministic monitors, tool-cost guardrails, repo-map hints, and prompt templates before model-based steering.
- Make prompt optimization part of the runtime pipeline rather than a replacement for monitors, tool-cost guardrails, or steering.
- Treat all savings numbers as evidence-labeled: controlled when an A/B arm exists, estimated or correlated when using historical matching, synthetic replay, or heuristics.
- Store prompt, trace, lesson, repo-map, pricing, and decision data locally by default.

## MVP 0: Monorepo Foundation

**Goal:** establish the TypeScript workspace and shared contracts needed by every later slice.

**Build scope**

- Create the pnpm workspace with `apps/daemon`, `apps/dashboard`, and shared packages.
- Add shared TypeScript config, package scripts, Vitest, and build targets.
- Add core protocol schemas for hook events, normalized events, decisions, usage, pricing, and policy snapshots.
- Document the hook protocol and local-first runtime assumptions.

**Exit criteria**

- `pnpm test` passes across the workspace.
- Core schemas compile and validate at least one generic hook-event fixture.
- README commands explain install, build, test, daemon, and dashboard flows.

**Codex prompt**

```text
Implement MVP 0 from docs/MVP_PROMPTS.md. Keep the change limited to monorepo foundation, shared TypeScript/Vitest setup, core protocol types, and initial docs. Do not implement storage, daemon ingest, dashboard UI beyond placeholders, prompt optimization, monitors, or steering yet. Run pnpm test and pnpm build, then summarize changed files and any follow-up tasks.
```

## MVP 1: Storage and Daemon Ingest

**Goal:** receive hook events from local agent runtimes and persist the raw audit trail before any processing.

**Build scope**

- Add the SQLite-backed storage layer and migration runner.
- Implement repositories for runs, raw events, normalized events, decisions, state snapshots, prompt optimization results, monitor results, cost rollups, and baseline links.
- Add the Fastify daemon with health and hook ingest endpoints.
- Persist raw events before normalization and attach provider metadata, repo, task, model, pricing profile, and config snapshot.

**Exit criteria**

- A synthetic hook event is stored and can be retrieved through a local daemon API.
- Raw event rows include provider metadata and timestamps.
- Storage tests cover run creation, event persistence, and retrieval.

**Codex prompt**

```text
Implement MVP 1 from docs/MVP_PROMPTS.md. Add SQLite migrations, storage repositories, daemon health and hook ingest APIs, and tests proving that a synthetic hook event is persisted before normalization. Keep all state local. Do not add prompt optimization, runtime monitors, dashboard analytics, or steering yet. Run pnpm test and pnpm build.
```

## MVP 2: CLI, Hooks, Normalization, and Run State

**Goal:** make hook events travel from a provider-facing command into the daemon and produce stable run state.

**Build scope**

- Implement `agent-sidecar status`, `agent-sidecar daemon start`, and hook commands for generic, Codex, and Claude Code providers.
- Add fail-open and fail-closed behavior controlled by policy.
- Implement provider normalizers for generic, Codex, and Claude Code payloads.
- Convert provider payloads into command, read, edit, validation, tool, usage, finalization, and error events.
- Update run state for edited paths, validation freshness, repeated-tool counters, recent files, token/cost totals, and difficulty state.

**Exit criteria**

- JSON sent to CLI stdin reaches the daemon and receives a provider-compatible decision response.
- Synthetic multi-event runs produce coherent normalized events and state snapshots.
- Unit tests cover provider normalization and fail-open/fail-closed behavior.

**Codex prompt**

```text
Implement MVP 2 from docs/MVP_PROMPTS.md. Add the CLI hook path, generic/Codex/Claude Code normalizers, fail-open/fail-closed policy behavior, and run-state updates for edited paths, validation freshness, repeated tools, usage, cost, and difficulty state. Keep decisions simple and deterministic. Run pnpm test and pnpm build.
```

## MVP 3: Prompt Optimization Layer

**Goal:** turn vague or stale task context into compact contracts before downstream monitors and steering decide what to do.

**Build scope**

- Add prompt optimization schemas and persistence.
- Implement deterministic task-contract, continuation, validation-reminder, compaction, lesson-injection, dead-end-avoidance, and repo-map-hint templates.
- Preserve original user intent, active constraints, validation requirements, changed-file context, approved lessons, and compact run state.
- Store rewrite reason, injection status, deterministic/model badge, estimated token delta, and source event id.
- Never send raw full prompts or raw trace history to steering providers for prompt optimization.

**Exit criteria**

- Vague prompt fixtures produce compact task contracts.
- Validation-missing finalization fixtures produce short continuation prompts.
- Approved relevant lessons and high-confidence dead-end patterns render as short hints while disabled or low-confidence entries are logged but not injected.
- Prompt optimization results are persisted and queryable by event.

**Codex prompt**

```text
Implement MVP 3 from docs/MVP_PROMPTS.md. Add deterministic prompt optimization schemas, templates, persistence, and tests for initial task contracts, validation-missing continuation prompts, compaction, approved lesson injection, dead-end avoidance, and repo-map hints. Preserve user intent and keep all prompt data local by default. Do not implement model-assisted steering. Run pnpm test and pnpm build.
```

## MVP 4: Runtime Monitors and Tool-Cost Guardrails

**Goal:** provide low-cost decisions for common agent failure modes before they burn more steps.

**Build scope**

- Implement policy loading for monitor thresholds, protected paths, tool-cost limits, and fail behavior.
- Add deterministic monitors for semantic loops, repeated tool calls, skipped validation, silent topic drift, stale evidence, hedging/backtracking, premature finalization, broad edits, and unbounded context growth.
- Add tool-cost guardrails for dangerous shell commands, protected paths, broad edits, redundant fetches, repeated searches, repeated reads, repeated failed commands, missing validation, and dead-end revisits.
- Compose decisions as allow, warn, block, require continuation, require validation, or inject context.
- Record reason codes, severity, evidence, cooldown state, and cost impact.

**Exit criteria**

- Dangerous command, protected path, repeat command, redundant fetch, repeated read/search, dead-end redirect, validation, and broad-change fixtures produce expected decisions without ensemble calls.
- Monitor results and tool-cost guardrail events are persisted and queryable.
- Decisions remain compact enough to return to the hook before the agent continues.

**Codex prompt**

```text
Implement MVP 4 from docs/MVP_PROMPTS.md. Add policy loading, deterministic runtime monitors, tool-cost guardrails, decision composition, persistence, and fixture tests for dangerous commands, protected paths, repeated tools, redundant fetch/search, stale evidence, skipped validation, dead-end revisits, and broad edits. Do not call steering models. Run pnpm test and pnpm build.
```

## MVP 5: Dashboard Replay and Local Feedback

**Goal:** let users inspect what happened in a run, why the sidecar intervened, and whether the intervention helped.

**Build scope**

- Add daemon APIs for run lists, trace replay, normalized events, prompt optimization results, monitor results, decisions, repo-map hints, tool-cost guardrail events, cost rollups, and feedback.
- Add dashboard pages for traces, decisions, policies, lessons, repo map, analytics, and feedback.
- Show original prompt, optimized prompt, task contract, context snapshot metadata, token estimate, result quality, rewrite reason, submission/injection status, deterministic/model badge, injected lessons, monitor evidence, and validation status.
- Keep dashboard higher level than internal schemas while preserving auditability.

**Exit criteria**

- A user can inspect a run and see optimized prompts, pattern matches, repo-map hints, tool-cost guardrail events, and intervention reasons.
- A user can mark feedback locally for accepted/rejected interventions and successful/failed outcomes.
- Dashboard smoke tests verify the trace replay API contract and key pages render.

**Codex prompt**

```text
Implement MVP 5 from docs/MVP_PROMPTS.md. Add daemon APIs and dashboard views for local trace replay, decisions, prompt optimization details, monitor evidence, repo-map hints, tool-cost guardrail events, cost rollups, and local feedback. Keep the UI aligned with the public six-control model and avoid exposing unnecessary internal schema detail. Run pnpm test and pnpm build.
```

## MVP 6: Lessons and Repo Map Cache

**Goal:** reuse approved local knowledge and compact file memory only when confidence and freshness gates pass.

**Build scope**

- Implement lesson repository fields: situation, dead ends to avoid, unlock, scope, confidence, approval state, disabled state, expiration, and provenance.
- Implement lesson candidate creation from feedback plus approval, disable, expiration, and matching flows.
- Implement repo-map cache entries with file path, symbols, ownership hints, compact summary, validation notes, content hash, and staleness tracking.
- Retrieve approved lessons and repo-map entries only when repo scope, task shape, failure signal, similarity, content hash, and cooldown gates pass.

**Exit criteria**

- Approved lessons can be matched, confidence-gated, injected, disabled, and expired.
- Repeated unchanged file reads can be replaced by compact repo-map hints.
- Stale repo-map cache entries are not injected after content hash changes.
- Low-confidence matches are logged but not injected.

**Codex prompt**

```text
Implement MVP 6 from docs/MVP_PROMPTS.md. Add lesson memory and repo-map cache repositories, matching, confidence gates, hash-based staleness, approval/disable/expiration flows, prompt-injection integration, dashboard APIs, and tests. Ensure stale or low-confidence entries are logged but not injected. Run pnpm test and pnpm build.
```

## MVP 7: Steering Ensemble, Analytics, and Packaging

**Goal:** add optional model-assisted steering, auditable cost metrics, and real local trial readiness.

**Build scope**

- Add no-op and local HTTP steering providers with strict request/response schemas.
- Enforce call budgets, provider allowlists, model ids, prompt versions, redacted compact feature inputs, and fallback actions.
- Use steering only for ambiguous cases after deterministic prompt templates, monitors, and tool-cost guardrails run.
- Add token and cost rollups, success feedback model, cost-per-success, loop rate, validation block rate, prompt optimization metrics, monitor/ensemble decision counts, accepted/rejected interventions, pattern match metrics, repo-map metrics, tool-cost guardrail metrics, and repeated tool calls avoided.
- Add controlled/estimated/correlated reporting labels and local synthetic benchmark fixtures.
- Package the CLI and document task-first `agent-sidecar codex` setup plus Codex and Claude Code hook setup for real local trials.

**Exit criteria**

- Ambiguous fixtures can call fake steering providers, aggregate outputs, persist records, and fall back safely.
- Analytics distinguish controlled comparisons from estimated or correlated baselines.
- CLI package install, task-first Codex submission, and hook setup docs support real local Codex and Claude Code trials.

**Codex prompt**

```text
Implement MVP 7 from docs/MVP_PROMPTS.md. Add optional no-op/local HTTP steering providers, call budgets, strict schemas, redacted compact feature inputs, fallback actions, analytics/evaluation rollups, controlled/estimated/correlated labels, synthetic benchmarks, CLI packaging, and Codex/Claude Code hook docs. Steering must remain off or locally configured by default. Run pnpm test and pnpm build.
```

## Demo Prompt Script

Use this script for landing-page copy, smoke fixtures, and demo checkpoints so the website matches the runtime plan.

1. **Setup prompt:** `python -m pip install agent-sidecar && agent-sidecar daemon start && agent-sidecar codex "Fix the auth refresh bug"`.
2. **User task:** `Login keeps breaking after token refresh. Can you figure it out and fix whatever is wrong?`
3. **Context checkpoint:** sidecar retrieves repo type, `AGENTS.md`, previous plans, file tree, active branch, and relevant diffs.
4. **Optimized task contract:** `Task: fix auth refresh so users stay signed in after token renewal. Constraints: keep changes narrow and follow AGENTS.md. Acceptance: token renewal persists before redirect. PR boundary: no unrelated auth refactors. Tests: run targeted auth refresh and login flow checks.`
5. **Runtime checkpoint:** Agent Sidecar submits the optimized prompt to Codex, then supervises hook events for loops, risky tools, validation gaps, and budget signals.
6. **Decision checkpoint:** return one compact hook response: allow, warn, block, require continuation, require validation, or inject context.
7. **Dashboard checkpoint:** show original prompt, optimized prompt, token estimate, result quality, decision, validation requirement, guarded run cost, baseline cost, total cost saved, monitor evidence, and feedback controls.

## Implementation Guardrails for Every MVP

- Do not replace Codex, Claude Code, or other coding agents.
- Do not upload raw traces, source files, prompts, tool outputs, or chain-of-thought by default.
- Do not require an LLM call for every event or decision.
- Do not add cloud pattern libraries, teams, SSO, RBAC, or distributed multi-user deployment to the MVP path.
- Keep hook responses small; store larger explanations in the local dashboard and daemon storage.
- Preserve negative cost deltas and failed interventions so regressions remain visible.
