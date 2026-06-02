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

The marketing website remains at the dashboard app root (`/`). The local runtime dashboard is a separate route at `/dashboard` when running `pnpm dev:dashboard`.

## Local prompt optimization

Prompt optimization is model-assisted at runtime and defaults to Ollama on this laptop:

```bash
ollama pull deepseek-r1:7b
pnpm dev:daemon
```

The daemon calls `http://127.0.0.1:11434/api/chat` with `deepseek-r1:7b` by default. Use a smaller model if you want faster, lower-memory prompt rewrites:

Every prompt optimization request tells the local model that the user prompt needs more operational detail. The model is instructed to fill in that detail as a concrete coding-agent task brief with likely files or areas to inspect, implementation steps, constraints, risks, and validation commands instead of simply restating the original prompt.

```bash
AGENT_SIDECAR_LOCAL_MODEL=deepseek-r1:1.5b pnpm dev:daemon
```

The default local-model timeout is 60 seconds. Override it when testing larger or smaller models:

```bash
AGENT_SIDECAR_LOCAL_MODEL_TIMEOUT_MS=90000 pnpm dev:daemon
```

To disable prompt optimization entirely:

```bash
AGENT_SIDECAR_LOCAL_PROMPT_OPTIMIZER=off pnpm dev:daemon
```

## Planning docs

- `docs/IMPLEMENTATION_PLAN.md`: source-of-truth product and architecture plan.
- `docs/MVP_PROMPTS.md`: implementation-ready MVP slices and Codex prompts aligned to the plan.
- `docs/ARCHITECTURE.md`: higher-level runtime architecture overview.
