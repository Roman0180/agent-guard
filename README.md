# Agent Sidecar

Agent Sidecar is a local runtime layer that runs beside coding agents such as Codex and Claude Code. Its goal is to reduce wasted coding-agent spend while keeping engineering velocity high through prompt refinement, local session tracing, loop detection, validation reminders, cost-aware steering, and replayable run summaries.

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
codex
# or
claude
```

Then associate the coding-agent run with a local sidecar session:

```bash
agent-sidecar session start --agent codex --repo . --name demo-session-001
agent-sidecar status
```

Later MVPs add prompt refinement, local steering, loop detection, validation guardrails, replay, summaries, and an optional local dashboard.

## Development Commands

```bash
pnpm install
pnpm build
pnpm test
pnpm dev:daemon
pnpm dev:dashboard
```

The daemon defaults to `http://localhost:4319` and exposes `GET /health`.

The marketing website remains at the dashboard app root (`/`). The future local runtime dashboard is a separate route at `/dashboard` when running `pnpm dev:dashboard`.
