# Agent Sidecar

Agent Sidecar is middleware for coding agents that detects wasted tokens, loops, risky edits, and weak planning before agents burn more context.

It sits beside an agent loop, observes compact sanitized trajectory slices, and returns targeted interventions. The normal LLM provider call still goes directly from the customer environment to OpenAI, Anthropic, or the chosen provider. Agent Sidecar does not need provider API keys, full raw system prompts, unrelated repo contents, or files the agent never read.

## Architecture

```text
Customer infrastructure
--------------------------------------------------
Coding agent loop
  ↓
Agent Sidecar SDK / middleware
  ↓
Normal LLM provider call still goes to OpenAI / Anthropic / etc.

Sidecar boundary
--------------------------------------------------
SDK sends only a compact trajectory slice:
- state summary, tool name and normalized arguments
- truncated sanitized tool output
- token counts, timing, files touched, errors, tags

API returns:
- intervention, recommendation, prompt patch, warning,
  cost-saving suggestion, or validation suggestion
```

## Privacy boundary

Trajectory slices may include session and step identifiers, timestamp, agent name, provider/model, step type, state summary, tool name, normalized arguments, truncated output, files touched, error messages, token counts, timing, user-selected tags, and metadata.

Trajectory slices must not include provider API keys, full raw system prompts, secrets, raw end-user PII, files the agent did not read, unnecessary full source files, unrelated repository contents, or customer application code unless the agent already explicitly read it and it has been sanitized/truncated.

## Workspace

- `apps/daemon`: Fastify Sidecar API with health and trajectory-slice observation endpoints.
- `apps/dashboard`: Next.js product site and local dashboard routes.
- `packages/core`: Shared trajectory slice, intervention, and legacy runtime protocol primitives.
- `packages/sdk`: Local SDK/middleware with redaction, truncation, API transport, and local-only mode.
- `packages/detectors`: Rule-based intervention engine for loops, context bloat, risky edits, missing validation, and token waste.
- `packages/storage`: SQLite-ready storage package.
- `packages/cli`: Future CLI package.
- `packages/policies`, `packages/steering`, `packages/lessons`: Future policy, steering, and lesson modules.
- `demos`: Demo agent-loop flows.
- `docs`: Architecture, MVP prompts, and video/demo scripts.

## Developer quickstart

```bash
pnpm install
pnpm build
pnpm test
pnpm dev:daemon
pnpm dev:dashboard
```

The daemon defaults to `http://localhost:4319` and exposes:

- `GET /health`
- `POST /api/trajectory-slices`

The marketing website remains at the dashboard app root (`/`). The local runtime dashboard is a separate route at `/dashboard`.

## SDK usage

```ts
import { createAgentSidecar } from "@agent-sidecar/sdk";

const sidecar = createAgentSidecar({
  apiUrl: "http://localhost:4319",
  apiKey: process.env.AGENT_SIDECAR_API_KEY,
  localOnly: false,
  redact: true,
  maxFieldLength: 4000
});

const intervention = await sidecar.observeStep({
  sessionId,
  stepId,
  agentName: "demo-coding-agent",
  provider: "openai",
  model: "gpt-5.5",
  stepType: "tool_call",
  toolName: "read_file",
  toolArguments: { path: "src/index.ts" },
  toolOutput: fileContent,
  tokenCounts,
  timingMs,
  filesTouched: ["src/index.ts"],
  tags: ["debugging", "context"]
});
```

## Demo flow

The demo story in `demos/wasteful-agent-loop.ts` shows a coding agent starting a migration task, repeating a failing command, and receiving an intervention:

> Stop rereading broad files. Summarize current state, search for registration points, and validate with targeted tests.

Demo metrics in docs and UI are illustrative sample metrics, not guaranteed savings.
