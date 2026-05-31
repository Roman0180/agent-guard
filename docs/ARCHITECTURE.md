# AgentGuard Architecture

AgentGuard is designed as a local sidecar for coding agents. Codex, Claude Code, or another agent emits hook events to the `agentguard` CLI. The CLI forwards those events to a local daemon. The daemon normalizes events, updates run state, applies deterministic hard rules, optionally calls a small steering model, stores traces locally, and returns a runtime decision.

```text
Coding agent hook
      |
      v
agentguard CLI adapter
      |
      v
Local Fastify daemon
      |
      +--> normalization
      +--> run state
      +--> hard rules
      +--> optional steering model
      +--> SQLite storage
      |
      v
Decision response

Dashboard --> daemon API --> local trace and analytics data
```

The dashboard is the control plane and replay UI. It should not own runtime decisions or access storage directly. The daemon owns ingestion, state, policy evaluation, persistence, and API access.

The MVP intentionally keeps model usage optional and scarce. Deterministic rules should handle obvious decisions before any steering model is considered.
