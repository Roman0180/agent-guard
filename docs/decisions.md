# Agent Sidecar Decisions

## 2026-07-02: Bootstrap v3 Python Runtime

- Implement the v3 design as a Python package under `src/agent_sidecar`.
- Keep the legacy TypeScript monorepo in place for now; the v3 package is isolated by `pyproject.toml` and does not import it.
- Add `opentelemetry-proto` as a runtime dependency so Chunk 1 can accept OTLP/HTTP protobuf payloads without hand-written protobuf parsing.
