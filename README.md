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

The marketing website remains at the dashboard app root (`/`). The local runtime dashboard is a separate route at `/dashboard` when running `pnpm dev:dashboard`.

## Task-first usage

Users should enter plain tasks into Agent Sidecar rather than constructing hook JSON or supplying token usage:

```bash
node packages/cli/dist/index.js codex "Fix login refresh token bug"
```

The sidecar collects local repo context before prompt optimization:

- repo type
- `AGENTS.md`
- previous plans
- file tree
- active branch
- relevant diffs

It then asks the local prompt model to rewrite the task, records the original prompt and optimized prompt, and returns the optimized prompt that should be submitted to Codex. Token estimates and cost rollups are sidecar responsibilities; the user does not type those values.

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
