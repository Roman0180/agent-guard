# Tuning Notes

Runtime never trains models and never imports `tuning/`. The runtime only reads `.agent-sidecar/models/registry.json` and routes to tuned weights when a registry entry is active and has a passing eval.

## Local Serving

Reasoning defaults to DeepSeek through Ollama:

```bash
ollama serve
agent-sidecar models pull deepseek-r1:8b
agent-sidecar models list
```

Coding defaults to Kimi through an OpenAI-compatible llama-server endpoint. Start llama-server with the Kimi GGUF or a tuned exported GGUF and a model alias that matches `.agent-sidecar/config.json`:

```bash
llama-server --host 127.0.0.1 --port 8080 --model /path/to/kimi-linear.gguf --alias kimi-linear-48b-a3b
agent-sidecar models list
```

`models list` queries Ollama `/api/tags` and llama-server `/v1/models`, then marks each role as served or unavailable. `refine` and `steer` only call LiteLLM when the selected route is local, allowlisted, reachable, and the target model is actually served.

## Promotion Gate

`agent-sidecar models promote <name>` promotes an existing registry entry only after a passing eval is present. If the entry has no passing eval, the command runs `evals/promotion.promptfoo.yaml` with `promptfoo` and writes the resulting score into the registry.

For offline CI and local smoke tests, set `AGENT_SIDECAR_PROMOTION_RESULT` to either a JSON object or a path containing:

```json
{"suite":"evals/promotion.promptfoo.yaml","score":0.91,"base_score":0.84,"passed":true}
```

Promotion still refuses unless the tuned score beats the base score and `passed` is true.

## Dataset Export

Use `agent-sidecar dev export-dataset --kind refine|steer` to export SFT-style JSONL rows from local traces. Rows include provenance so users can curate them before training.

## Calibration

Use `agent-sidecar dev calibrate-detectors --labels evals/fixtures/datasets/steering_labels.jsonl` to check deterministic detector precision/recall over labeled trace fixtures.
