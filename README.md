# AgentGuard

AgentGuard is a local-first runtime reliability sidecar for AI coding agents such as Codex and Claude Code.

The intended system runs beside an existing coding agent, receives hook events, stores local traces, applies deterministic runtime policies, optionally consults a compact steering model for ambiguous cases, and exposes a local dashboard for replay, lessons, and analytics.

This repository currently contains the initial TypeScript monorepo skeleton only.

## Workspace

- `apps/daemon`: Fastify daemon with a health endpoint.
- `apps/dashboard`: Next.js dashboard.
- `packages/core`: Shared types and protocol primitives.
- `packages/storage`: SQLite-ready storage package placeholder.
- `packages/cli`: Future `agentguard` CLI package.
- `packages/detectors`: Future loop, command, validation, and edit detectors.
- `packages/policies`: Future deterministic policy engine.
- `packages/steering`: Future small steering model interface.
- `packages/lessons`: Future approved lesson memory.
- `docs`: Product and architecture documentation.

## Commands

```bash
pnpm install
pnpm build
pnpm test
pnpm dev:daemon
pnpm dev:dashboard
```

The daemon defaults to `http://localhost:4737` and exposes `GET /health`.
