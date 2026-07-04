# Agent Sidecar Tuning

This directory is offline tooling only. Runtime code must not import it.

1. Export training data:

   ```bash
   agent-sidecar dev export-dataset --kind refine
   agent-sidecar dev export-dataset --kind steer
   ```

2. Train adapters with LLaMA-Factory:

   ```bash
   pip install llamafactory
   llamafactory-cli train tuning/recipes/deepseek_reasoning_qlora.yaml
   llamafactory-cli train tuning/recipes/kimi_coding_qlora.yaml
   ```

3. Export servable GGUF weights:

   ```bash
   tuning/export_gguf.sh
   ollama create sidecar-deepseek-reasoning -f tuning/modelfiles/sidecar-deepseek-reasoning.Modelfile
   ```

4. Promote only after eval:

   ```bash
   agent-sidecar models promote sidecar-deepseek-reasoning
   agent-sidecar models rollback sidecar-deepseek-reasoning
   ```

`models promote` runs `evals/promotion.promptfoo.yaml` when the registry entry does not already have a passing eval. CI can inject a stub result through `AGENT_SIDECAR_PROMOTION_RESULT`; real promotion should use promptfoo against reachable local model endpoints.
