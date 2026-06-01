# Agent Sidecar

Agent Sidecar is a local-first runtime reliability sidecar for AI coding agents such as Codex and Claude Code.

- `packages/policies`: Future runtime configuration and tool-cost guardrail settings.

This repository currently contains the initial TypeScript monorepo skeleton only.

## Workspace

- `apps/daemon`: Fastify daemon with a health endpoint.
- `apps/dashboard`: Next.js dashboard.
- `packages/core`: Shared types and protocol primitives.
- `packages/storage`: SQLite-ready storage package placeholder.
- `packages/cli`: Future `agent-sidecar` CLI package.
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

The daemon defaults to `http://localhost:4319` and exposes `GET /health`.
