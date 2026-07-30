# Tuning Notes

Runtime never trains models and never imports `tuning/`. The runtime only reads `.agent-sidecar/models/registry.json` and routes to tuned weights when a registry entry is active and has a passing eval.

## Local Serving

Both roles default to Llama 3 8B, served through two different local backends, chosen by live-testing candidates on real hardware rather than by architecture on paper. Larger models tried first for the reasoning role (a DeepSeek-R1 distill, Qwen3-30B-A3B) both failed live testing: one was never actually pulled, the other returned malformed/empty responses after 11-14 seconds per call. DeepSeek V4 Flash was configured for the coding role previously but never verified reachable in this environment, and vLLM (needed to serve it) does not reliably support macOS/ARM. Verify any candidate model actually serves valid output within budget on your own hardware before trusting it as a default — a model that never completes, or never finishes correctly, contributes nothing, however capable it is on paper.

The reasoning role uses Ollama:

```bash
ollama pull llama3:latest
```

Verified live: answers a realistic steering judgment correctly (valid JSON, grounded evidence, no hallucination) in 1.4-2.1 seconds, comfortably inside the Claude Code `UserPromptSubmit` hook's default 5-second `/refine` round-trip budget. `DEEPSEEK_MODEL` remains supported as a compatibility alias for `REASONING_MODEL`.

The coding role uses llama.cpp's `llama-server` (OpenAI-compatible), with `--alias` set to match the configured model id:

```bash
brew install llama.cpp
llama-server -hf bartowski/Meta-Llama-3-8B-Instruct-GGUF:Q4_0 --host 127.0.0.1 --port 8080 --alias llama3:latest
```

If you already have the model pulled through Ollama, point `llama-server` at that GGUF directly instead of downloading it again: `ollama show llama3:latest --modelfile` prints the local blob path in its `FROM` line. Verified live through the real `refine_coding.txt` production prompt template: 2.7-4.1 seconds per call, valid schema-conforming `RefineDraft` JSON every time. `DEEPSEEK_V4_MODEL` remains supported as a compatibility alias for `CODING_MODEL`.

The helper checks that the local endpoints serve the configured reasoning and coding models, then runs a deterministic-plus-coding-model refinement smoke test:

```bash
./scripts/start_local_models.sh
agent-sidecar models list
```

`models list` queries Ollama `/api/tags` and OpenAI-compatible `/models` endpoints, then marks each role as served or unavailable — but "served" only means the endpoint responds and reports the right model name; it does not confirm the model actually produces valid, correctly-shaped output within your timeout budget, which needs a direct check like the ones described above. `refine` and `steer` only call LiteLLM when the selected route is allowlisted, reachable, and the target model is actually served. The default allowlist pins OpenAI-compatible calls to `http://localhost:8080/v1`; hosted DeepSeek API calls are not enabled by default.

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
