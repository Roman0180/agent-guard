# Agent Sidecar Decisions

## 2026-07-02: Bootstrap v3 Python Runtime

- Implement the v3 design as a Python package under `src/agent_sidecar`.
- Keep the legacy TypeScript monorepo in place for now; the v3 package is isolated by `pyproject.toml` and does not import it.
- Add `opentelemetry-proto` as a runtime dependency so Chunk 1 can accept OTLP/HTTP protobuf payloads without hand-written protobuf parsing.

## 2026-07-03: Chunk 1 Closeout and Chunk 2 Offline Baseline

- Keep the Claude Code hook script stdlib-only by duplicating the tiny `cc-` session-id normalization helper locally; importing package schemas would pull pydantic into the hook hot path.
- Use a 100ms loopback socket probe before LiteLLM calls so `refine` and `steer` degrade quickly when Ollama or llama-server is not running.
- Treat non-loopback model endpoints as invalid unless `remote_fallback` is enabled and the route is allowlisted; this check happens before any socket use.
- Seed the canonical `auth-refresh-loop` fixture with repeated failing validation, one relevant edit, and measured cost so detectors, steering, and cost commands can be tested offline.
- For the first Chunk 2 implementation, `models pull` is advisory only; promotion and rollback mutate the local registry, while real model download/registration remains an operator action through Ollama or llama-server.

## 2026-07-03: Chunk 2 Completion Details

- `models promote` runs the promptfoo promotion gate when a registry entry lacks a passing eval; CI injects a deterministic eval result through `AGENT_SIDECAR_PROMOTION_RESULT`.
- The price map ships with a small packaged snapshot plus `agent-sidecar cost refresh-map`, which writes a local `.agent-sidecar/cost-map/litellm_prices.json` snapshot from the installed LiteLLM SDK metadata.
- Detector calibration uses labeled JSONL cases under `evals/fixtures/datasets/` and reports per-evaluator precision/recall through `agent-sidecar dev calibrate-detectors`.

## 2026-07-03: Live Local Model Integration

- `models list` now queries Ollama `/api/tags` and llama-server `/v1/models`; routes are shown as unavailable if the selected DeepSeek/Kimi model is not actually served.
- `refine` and `steer` only call LiteLLM after local allowlist, socket reachability, and served-model checks pass.
- `models pull` performs a real Ollama `/api/pull` for Ollama-backed models; llama-server/Kimi models must be started or registered outside the sidecar.
- Runtime model prompts now load the checked-in versioned prompt templates under `src/agent_sidecar/models/prompts`.

## 2026-07-03: Claude Code Prompt Interception

- Claude Code command hooks cannot replace a `UserPromptSubmit` prompt; the supported mechanism is `hookSpecificOutput.additionalContext`, so Agent Sidecar injects the refined task contract as context beside the submitted prompt.
- The hook records the raw `UserPromptSubmit` event, calls `/refine` with `record_prompt_submitted: false`, and emits only JSON on stdout so Claude Code can parse the response.
- The installer gives `UserPromptSubmit` hooks a 30 second timeout while the hook script keeps its own refine timeout at 5 seconds by default.
- CLI commands that operate on one session default to the daemon's active session, falling back to the latest known session; explicit ids remain available for multi-session debugging.
- Savings are reported by comparing a baseline session to a Sidecar session with `agent-sidecar cost compare`; the command preserves precision labels and treats the weaker precision as the comparison precision.
- `cost compare` can infer the baseline session as the latest stopped session before the active Sidecar session, so the normal paired-run workflow does not require copying session ids.
