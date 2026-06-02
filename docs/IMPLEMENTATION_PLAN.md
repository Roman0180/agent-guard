# Agent Sidecar Implementation Plan

## Product direction

Agent Sidecar is middleware for coding agents. It sits beside an agent loop, observes compact trajectory slices, detects token waste / loops / risky behavior / poor planning, and returns targeted interventions before the agent wastes more context or makes low-quality changes.

The normal LLM provider call remains direct from customer infrastructure to OpenAI, Anthropic, a local model, or another chosen provider. Agent Sidecar does not need provider API keys, full raw system prompts, unrelated repository contents, or files the agent did not read.

## MVP modules

1. **Trajectory Slice Model** — typed and validated compact event in `packages/core` with `schemaVersion` and bounded metadata.
2. **Redaction / Sanitization Layer** — local SDK sanitization for secrets, API keys, tokens, passwords, connection strings, obvious PII, and oversized fields.
3. **Intervention Model** — typed response with severity, category, message, rationale, recommended action, optional prompt patch, block flag, confidence, and metadata.
4. **Intervention Engine** — rule-based detectors in `packages/detectors`; no ML system in the MVP.
5. **SDK / Middleware** — `createAgentSidecar` in `packages/sdk` with API transport and `localOnly` mode.
6. **Sidecar API** — Fastify endpoint `POST /api/trajectory-slices` returning intervention responses.
7. **Demo Agent Loop** — wasteful migration demo that triggers repeated-failure intervention.
8. **Website / Docs / Video** — provider-agnostic copy, privacy boundary, developer snippets, demo metrics labeled as sample/demo metrics.

## Detector backlog

- repeated failed tool calls
- repeated similar errors
- excessive file reads
- oversized tool outputs
- weak planning before edits
- risky edits to deployment/auth/config/security/migration files
- implementation without validation/tests
- high token usage without progress

## Privacy guardrails

The SDK should send only the data needed for trajectory-level intervention. Customer application code should not be sent unless the agent already read it and the local redaction/truncation layer has minimized it. Privacy claims must remain accurate: Agent Sidecar receives the sanitized slice supplied by the SDK/API caller, not the provider call or full environment.

## API shape

```http
POST /api/trajectory-slices
content-type: application/json
```

Request: `TrajectorySlice`.

Response:

```json
{
  "accepted": true,
  "sanitized": true,
  "slice": { "schemaVersion": 1 },
  "intervention": {
    "intervention_id": "int_...",
    "severity": "warning",
    "category": "loop",
    "message": "Repeated failed tool call detected.",
    "rationale": "The same tool signature failed three times in the recent trajectory window.",
    "recommended_action": "Stop rerunning the same command. Summarize current state, inspect a narrower registration point, then run one targeted validation.",
    "suggested_prompt_patch": "Stop rereading broad files. Summarize current state, search for registration points, and validate with targeted tests.",
    "should_block": false,
    "confidence": 0.9,
    "metadata": { "rule": "repeated_failed_tool_calls" }
  }
}
```

## Validation plan

- Unit tests for trajectory and intervention schemas.
- Unit tests for redaction and SDK transport behavior.
- Unit tests for detector rules.
- API tests for valid loop intervention and invalid raw fields.
- Monorepo `pnpm test`, `pnpm typecheck`, and `pnpm build`.
- Dashboard `next build` through the workspace build.
