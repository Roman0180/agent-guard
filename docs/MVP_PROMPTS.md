# Agent Sidecar MVP Prompts

This MVP pivots Agent Sidecar from prompt-centric tooling into provider-agnostic middleware for coding agents. The sidecar observes compact trajectory slices, detects token waste / loops / risky edits / weak planning, and returns targeted interventions before agents burn more context.

## MVP 1 — Trajectory and intervention contracts

Implement typed and validated `TrajectorySlice` and `Intervention` models in `packages/core`.

**Prompt**

Add a compact trajectory slice schema and intervention response schema. The slice may include session id, step id, timestamp, agent name, provider, model, step type, state summary, tool name, normalized tool arguments, truncated tool output, files touched, error message, token counts, timing, tags, and metadata. It must reject unsupported raw fields such as full system prompts. Add tests for valid slices, rejected raw fields, and intervention validation.

## MVP 2 — Local redaction SDK

Implement `@agent-sidecar/sdk` with `createAgentSidecar`, `observeStep`, and local sanitization.

**Prompt**

Create a TypeScript SDK that validates observe-step input, redacts likely secrets, API keys, tokens, passwords, connection strings, obvious email/phone PII, truncates oversized fields, and posts sanitized slices to `/api/trajectory-slices`. Add `localOnly` mode that runs the rule engine without network transport. Add tests proving sensitive values are redacted before transport.

## MVP 3 — Rule-based intervention engine

Implement the MVP detectors in `packages/detectors`.

**Prompt**

Build a simple rule-based engine for repeated failed tool calls, repeated similar errors, excessive file reads, oversized tool outputs, weak planning before edits, risky deployment/auth/config/security/migration edits, implementation without validation, and high token usage without progress. Return the highest-severity intervention and keep metadata compact. Add detector tests.

## MVP 4 — Sidecar API endpoint

Implement `POST /api/trajectory-slices` in the daemon.

**Prompt**

Add a Fastify endpoint that accepts a sanitized trajectory slice, validates it with the core schema, maintains a short per-session recent-slice window, evaluates the intervention engine, and returns `{ accepted, sanitized, slice, intervention }`. Add API contract tests for a repeated failure loop and invalid raw fields.

## MVP 5 — Website and demo story

Update product copy away from Codex-specific prompt interception and toward coding-agent middleware.

**Prompt**

Update the homepage and docs to position Agent Sidecar as middleware for coding agents that detects wasted tokens, loops, risky edits, and weak planning. Include architecture, privacy boundary, what it detects, what never leaves the environment, before/after demo metrics clearly labeled as sample metrics, SDK setup, sample trajectory slice, and sample intervention.

## MVP 6 — Video script

Create the video script story for 30, 60, and 90 seconds.

**Prompt**

Write a video script showing a migration task where an agent rereads too much context and repeats a failing command. Show Agent Sidecar receiving sanitized trajectory slices, detecting loop/context bloat, returning “Stop rereading broad files. Summarize current state, search for registration points, and validate with targeted tests,” and the agent continuing with a narrower plan. Include narration, on-screen text, suggested visuals, and demo beats.
