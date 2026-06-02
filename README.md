# Agent Sidecar

Agent Sidecar is a local-first prompt control plane and runtime reliability sidecar for AI coding agents such as Codex.

The intended system accepts the user task before Codex starts, retrieves repo context, rewrites the task into an optimized prompt with constraints, acceptance criteria, PR boundaries, and test expectations, submits the optimized prompt to Codex, records prompt lineage and result quality, supervises hook events during the run, and exposes a dashboard for replay, lessons, and analytics.

This repository currently contains the initial TypeScript monorepo skeleton only.

## Workspace

- `apps/daemon`: Fastify daemon with a health endpoint.
- `apps/dashboard`: Next.js dashboard.
- `packages/core`: Shared types and protocol primitives.
- `packages/storage`: SQLite-ready storage package placeholder.
- `packages/cli`: Future `agent-sidecar` CLI package.
- `packages/detectors`: Future loop, command, validation, and edit detectors.
- `packages/policies`: Future runtime configuration and supervision settings.
- `packages/steering`: Future low-cost steering model ensemble interface.
- `packages/lessons`: Future approved lesson memory.
- `docs`: Product, architecture, MVP, and prompt documentation.

## Commands

```bash
pnpm install
pnpm build
pnpm test
pnpm dev:daemon
pnpm dev:dashboard
agent-sidecar codex "Fix the auth refresh bug"
```

The daemon defaults to `http://localhost:4319` and exposes `GET /health`.

## Planning docs

- `docs/IMPLEMENTATION_PLAN.md`: source-of-truth product and architecture plan.
- `docs/MVP_PROMPTS.md`: implementation-ready MVP slices and Codex prompts aligned to the plan.
- `docs/ARCHITECTURE.md`: higher-level runtime architecture overview.
