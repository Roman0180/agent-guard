# Agent Sidecar Video and Demo Script

## Core story

Coding agents are powerful, but they waste tokens when they loop, reread too much context, or act without a plan. Agent Sidecar sits beside the agent loop as middleware. It does not replace the LLM provider and does not receive provider API keys. It receives only a compact, sanitized trajectory slice, detects wasteful or risky behavior, returns a targeted intervention, and lets the agent continue with a better next step.

## Concrete demo flow

```text
Agent starts migration task
↓
Agent reads too many files / repeats a failing command
↓
Agent Sidecar receives sanitized trajectory slices
↓
Sidecar detects loop or context bloat
↓
Sidecar returns intervention:
  “Stop rereading broad files. Summarize current state, search for registration points, and validate with targeted tests.”
↓
Agent follows narrower plan
↓
Token usage and wasted steps decrease
```

## 30-second version

| Beat | Narration | On-screen text | Suggested visuals |
| --- | --- | --- | --- |
| 0-5s | Coding agents can burn tokens fast when they loop, reread broad files, or edit without a plan. | Agents loop. Context grows. Costs rise. | Agent terminal repeating a failing migration test. |
| 5-12s | Agent Sidecar is middleware beside the agent loop. Your normal provider call still goes directly to OpenAI, Anthropic, or your chosen provider. | Provider calls stay direct. | Diagram: agent loop → provider, sidecar beside the loop. |
| 12-20s | The SDK sends only a compact, sanitized trajectory slice: tool name, truncated output, token counts, files touched, and errors. | No provider keys. No full system prompts. No unrelated code. | Privacy boundary animation. |
| 20-27s | Sidecar detects the loop and returns a targeted intervention. | “Stop rereading broad files…” | Warning card appears in agent UI. |
| 27-30s | The agent continues with a narrower plan, fewer wasted steps, and better validation. | Fewer wasted tokens. Cleaner execution. | Before/after sample metrics labeled “demo”. |

## 60-second version

| Beat | Narration | On-screen text | Suggested visuals |
| --- | --- | --- | --- |
| 0-8s | Coding agents are powerful, but they can spend thousands of tokens rereading files, retrying failing commands, or making risky edits without enough planning. | The hidden cost of agent loops. | Timeline with repeated read/test steps. |
| 8-16s | Agent Sidecar sits beside the agent loop as middleware. It observes behavior; it does not replace the LLM provider. | Middleware for coding agents. | Architecture diagram. |
| 16-25s | Provider API keys and full system prompts stay in your environment. The normal call still goes directly to OpenAI, Anthropic, or your selected model provider. | Provider call continues normally. | Split-screen: provider path bypasses Sidecar. |
| 25-36s | Sidecar receives a compact trajectory slice: state summary, tool name and arguments, truncated output, token counts, timing, files touched, errors, and tags. | Compact sanitized slices only. | JSON slice with redacted fields. |
| 36-48s | In the migration demo, the agent repeats a failing command. Sidecar detects the repeated failure and context bloat. | Loop detected. | Detector badge lights up. |
| 48-56s | It returns: “Stop rereading broad files. Summarize current state, search for registration points, and validate with targeted tests.” | Targeted intervention. | Intervention card. |
| 56-60s | The agent follows the narrower plan. Demo metrics show fewer wasted steps and sample tokens avoided. | Demo metrics, not guaranteed savings. | Before/after cards. |

## 90-second version

| Beat | Narration | On-screen text | Suggested visuals |
| --- | --- | --- | --- |
| 0-10s | Coding agents can move fast, but when they lose the thread they burn context: broad file reads, repeated errors, weak plans, risky edits, and missing validation. | Agent reliability needs a runtime layer. | Agent transcript scrolls with repeated commands. |
| 10-22s | Agent Sidecar is provider-agnostic middleware for agent loops. Codex, Claude Code, custom agents, and local agents can all emit trajectory slices. | Provider-agnostic sidecar. | Multiple agent logos feeding same SDK shape. |
| 22-34s | Sidecar is not a proxy for the LLM call. Your application still calls OpenAI, Anthropic, or your chosen provider directly. Sidecar does not receive provider API keys. | Not a replacement provider. | Boundary diagram. |
| 34-48s | The local SDK redacts likely secrets and obvious PII, truncates oversized fields, and sends only the compact slice needed for intervention. | Redact locally. Truncate locally. | Redaction animation over API key/email. |
| 48-62s | The MVP intervention engine is rule-based: repeated failed tools, similar errors, excessive reads, oversized outputs, weak planning, risky edits, missing tests, and high token use without progress. | Rule-based detectors. | Detector checklist. |
| 62-76s | Demo: a migration task starts, the agent rereads files and repeats a failing command, and Sidecar returns a concrete next step instead of another broad retry. | “Summarize state. Search registration points. Validate targeted tests.” | Intervention card injected into agent loop. |
| 76-86s | The agent follows the narrower plan, validates the change, and avoids additional wasteful steps. | Cleaner execution. Better validation. | Green validation badge. |
| 86-90s | Agent Sidecar can reduce wasted tokens by catching bad trajectories before they sprawl. | Stop loops before they burn context. | Product logo and CTA. |

## Demo beats

1. Show terminal command: `pnpm dev:daemon`.
2. Show SDK snippet using `createAgentSidecar` with `redact: true`.
3. Start migration task in demo agent.
4. Show repeated failing command: `pnpm test -- migration`.
5. Show sanitized trajectory slice crossing boundary.
6. Show intervention response.
7. Show agent adopting narrower plan.
8. Show targeted validation.
9. Show sample demo metrics: “4 fewer wasteful steps” and “8.1k sample tokens avoided”; label as demo metrics.
