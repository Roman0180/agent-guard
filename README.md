# Agent Sidecar

Agent Sidecar is a local-first runtime reliability sidecar for AI coding agents such as Codex and Claude Code.

The intended system runs beside an existing coding agent, receives hook events, stores traces, optimizes prompts, evaluates runtime monitors, optionally consults an ensemble of cheaper steering models for ambiguous cases, and exposes a dashboard for replay, lessons, and analytics.

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
```

The daemon defaults to `http://localhost:4319` and exposes `GET /health`.

## Planning docs

- `docs/IMPLEMENTATION_PLAN.md`: source-of-truth product and architecture plan.
- `docs/MVP_PROMPTS.md`: implementation-ready MVP slices and Codex prompts aligned to the plan.
- `docs/ARCHITECTURE.md`: higher-level runtime architecture overview.
