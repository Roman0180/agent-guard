# Agent Sidecar Architecture

Agent Sidecar is provider-agnostic middleware for coding agents. It sits beside the agent loop, observes compact trajectory slices, detects token waste / loops / risky behavior / poor planning, and returns targeted interventions before the agent wastes more context or makes low-quality changes.

Agent Sidecar does **not** replace OpenAI, Anthropic, local models, or any other LLM provider. The customer's normal LLM provider call continues from the customer's infrastructure to the selected provider. Agent Sidecar does not need provider API keys, full raw system prompts, unrelated repo contents, or files the agent never read.

## Boundary

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
Agent Sidecar SDK sends a compact trajectory slice:
- agent thought / state summary
- tool name and normalized arguments
- truncated sanitized tool output
- token counts and timing
- files touched and errors
- user-selected tags and metadata

Agent Sidecar API returns:
- intervention
- recommendation
- prompt patch
- warning
- cost-saving suggestion
- validation suggestion
```

## Data contract

The trajectory slice is the compact event sent from the local agent loop to the Sidecar API. It is typed and validated in `packages/core` and supports future extension with `schemaVersion` plus bounded `metadata`.

Allowed fields include session id, step id, timestamp, agent name, provider, model, step type, agent state summary, tool name, normalized tool arguments, truncated tool output, files touched, error message, token counts, timing, tags, and metadata.

Disallowed data includes provider API keys, full raw system prompts, secrets, raw end-user PII, files the agent did not read, unnecessary full source files, unrelated repository contents, and customer application code unless already explicitly read by the agent and sanitized/truncated.

## Local SDK / middleware

The TypeScript SDK exposes `createAgentSidecar`. It validates inputs, redacts likely secrets and obvious PII, truncates oversized strings, and either:

1. posts the sanitized slice to `/api/trajectory-slices`, or
2. runs the rule-based intervention engine locally when `localOnly: true`.

The provider call remains outside this SDK. The SDK observes the agent step; it does not proxy the LLM provider request.

## Redaction and sanitization

The MVP redaction layer runs locally before transport. It redacts common API-key/token/password/authorization fields, connection strings, common secret token formats, email addresses, and phone numbers. It also truncates oversized fields. This is a defensive MVP layer, not a substitute for customer-side data minimization.

## Intervention model

The Sidecar API returns an intervention with:

- `intervention_id`
- `severity`: `info | warning | critical`
- `category`: `cost | loop | context | planning | tool_use | risky_edit | testing | security`
- `message`
- `rationale`
- `recommended_action`
- `suggested_prompt_patch`
- `should_block`
- `confidence`
- `metadata`

## Rule-based intervention engine

The MVP intentionally uses simple deterministic detectors rather than a complex ML system. Current detectors cover:

- repeated failed tool calls
- repeated similar errors
- excessive file reads
- oversized tool outputs
- weak planning before edits
- risky edits to deployment/auth/config/security/migration files
- implementation without validation/tests
- high token usage without progress

## API contract

`POST /api/trajectory-slices` accepts a sanitized trajectory slice and returns:

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

## Demo story

1. Agent starts a migration task.
2. Agent reads too many files or repeats a failing command.
3. Agent Sidecar receives sanitized trajectory slices.
4. Sidecar detects loop or context bloat.
5. Sidecar returns: “Stop rereading broad files. Summarize current state, search for registration points, and validate with targeted tests.”
6. Agent follows a narrower plan.
7. Token usage and wasted steps can decrease in the demo flow.

Demo numbers are sample metrics for storytelling and evaluation harnesses, not guaranteed cost savings.
