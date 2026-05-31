# AgentGuard Architecture

AgentGuard is designed as a local sidecar for coding agents. Codex, Claude Code, or another agent emits hook events to the `agentguard` CLI. The CLI forwards those events to a local daemon. The daemon normalizes events, updates run state, retrieves approved reliability patterns, applies prompt optimization, applies deterministic hard rules, optionally calls a small steering model, stores traces locally, and returns a runtime decision.

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
      +--> semantic file memory
      +--> approved pattern retrieval
      +--> prompt optimization
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

## Reliability Capabilities

AgentGuard should cover these minimum runtime reliability capabilities:

- Reasoning reuse: retrieve approved local patterns from prior successful runs and inject only high-confidence matches.
- Dead-end avoidance: store operational lessons in a structured format that captures the situation, dead ends to avoid, and the unlock that worked.
- Semantic file memory: remember compact per-file summaries, ownership hints, and validation notes so agents do not repeatedly re-read unchanged files.
- Loop detection: detect repeated commands, repeated file reads, semantic retries, and stale evidence loops.
- Tool supervision: identify redundant fetches, repeated searches, repeated reads, and risky tool calls before they compound cost or damage.
- Context compression: preserve durable state, open constraints, validation requirements, and approved lessons while dropping noisy or stale context.
- Reasoning-aware pruning: remove low-value context based on task state, validation evidence, and dead-end history rather than token count alone.
- Confidence-gated injection: inject patterns only when structured triggers and similarity scores clear configurable thresholds.
- Difficulty-state tracking: maintain a lightweight state such as `fast`, `normal`, `slow`, or `skip` to guide whether AgentGuard should inject context, ask steering, require validation, or stay quiet.
- Cost-per-success evaluation: compare runs with and without interventions and label results as correlation unless an explicit controlled evaluation exists.

These capabilities are implemented locally by default. Shared or cloud pattern libraries are a future opt-in feature and must use scrubbed, approved, operational lessons rather than raw traces.
