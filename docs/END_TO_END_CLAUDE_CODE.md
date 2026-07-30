# End-to-End Claude Code

Start the coding-role model locally through llama.cpp's llama-server, then let the helper pull and preflight the Llama 3 8B reasoning model through Ollama:

```bash
brew install llama.cpp
llama-server -hf bartowski/Meta-Llama-3-8B-Instruct-GGUF:Q4_0 --host 127.0.0.1 --port 8080 --alias llama3:latest
./scripts/start_local_models.sh
```

Then run the demo from the repo root:

```bash
./scripts/e2e_claude_code.sh
```

The script runs Claude Code with `CLAUDE_MODEL=opus` by default. Override it when needed:

```bash
CLAUDE_MODEL=sonnet ./scripts/e2e_claude_code.sh
```

The demo script verifies the local coding route (Llama 3 8B via llama-server) and the local reasoning route (Llama 3 8B via Ollama) before launching Claude Code. Sidecar uses deterministic prompt refinement, then asks the configured local coding model for the implementation-focused follow-up. In paired mode, the local reasoning model evaluates the saved baseline and Sidecar implementations after both runs.

The demo script backs up the current `boilerplate.html`, resets it to the same controlled starter file before both runs, uses deterministic prompt refinement plus local coding-model implementation focus, submits a compact example prompt to Claude Code automatically, captures both session IDs, optionally derives a Sidecar cost budget from the baseline session when measured baseline cost is available, prints savings from raw Claude API-request telemetry, prints baseline-vs-Sidecar execution time, then asks the local reasoning model for a single verdict on whether Sidecar preserved implementation quality. It resets `boilerplate.html` again before exit.

The built-in prompt is scoped for a roughly 45 second Claude phase. Override it without editing the script:

```bash
AGENT_SIDECAR_E2E_PROMPT='Replace boilerplate.html with a compact static status card.' ./scripts/e2e_claude_code.sh
```

If the local coding model cannot produce the coding focus, the local reasoning model cannot evaluate the finished outputs in paired mode, quality is not preserved, or measured Sidecar cost is not lower than baseline cost, the script exits non-zero. Cost savings are printed before the reasoning-model quality verdict. Model route preflight failures stop before spending Claude baseline/sidecar tokens.

By default the paired run sets:

```bash
AGENT_SIDECAR_REQUIRE_BUDGET=0
AGENT_SIDECAR_TARGET_SAVINGS_PCT=10
AGENT_SIDECAR_BUDGET_WARNING_THRESHOLD_PCT=80
AGENT_SIDECAR_BUDGET_ENFORCEMENT=block
```

The Sidecar hook tries to configure the run budget from `AGENT_SIDECAR_BASELINE_SESSION`, adds the budget to the refined prompt context when configuration succeeds, checks spend on each hook invocation, and blocks more work when current measured cost reaches a configured budget. Missing budget configuration is not a hard failure in the e2e flow.

Outputs are saved under:

```bash
.agent-sidecar/e2e/<timestamp>/
```

The DeepSeek implementation verdict is saved as:

```bash
.agent-sidecar/e2e/<timestamp>/deepseek.implementation-eval.json
```

The raw DeepSeek evaluator responses are saved for debugging as:

```bash
.agent-sidecar/e2e/<timestamp>/deepseek.implementation-eval.raw.txt
```

Claude execution timing is saved as:

```bash
.agent-sidecar/e2e/<timestamp>/claude.baseline.duration.txt
.agent-sidecar/e2e/<timestamp>/claude.sidecar.duration.txt
```

For a single intercepted run without baseline comparison:

```bash
./scripts/e2e_claude_code.sh --single
```

For the legacy wrapper prompt flow, start the daemon and hooks normally, then enable the wrapper before launching Claude Code:

```bash
agent-sidecar start
agent-sidecar hooks install
eval "$(agent-sidecar telemetry print-env)"
export AGENT_SIDECAR_KIMI_WRAPPER=1
claude
```

In this mode, a `UserPromptSubmit` hook calls `/wrap`: deterministic prompt rules run first, DeepSeek refines only when the deterministic rules do not flag the prompt, the configured local coding model produces the display response, and the hook blocks Claude execution by default so Claude Code displays that result without spending another model call. Set `AGENT_SIDECAR_KIMI_WRAPPER_DELIVERY=context` to inject the wrapper result as additional Claude context instead.

For a SWE-bench Lite token-savings benchmark:

```bash
./scripts/swebench_lite_token_savings.sh --count 3
./scripts/swebench_lite_token_savings.sh --test astropy__astropy-12907 --test django__django-11099
./scripts/swebench_lite_token_savings.sh --tests astropy__astropy-12907,django__django-11099
./scripts/swebench_lite_token_savings.sh --test-file ./swebench-instances.txt
./scripts/swebench_lite_token_savings.sh --count 12 --parallel 6
```

The script loads `princeton-nlp/SWE-bench_Lite`, creates fresh baseline and Sidecar checkouts for each selected instance, runs Claude Code once with prompt interception disabled and once with Sidecar enabled, runs the SWE-bench grader for both generated patches by default, then writes per-instance and aggregate token savings plus score deltas under `.agent-sidecar/swebench-lite/<timestamp>/`. Use `--count <n>` with optional `--offset <n>` for count-based task selection, or use `--test`, `--tests`, or `--test-file` for fixed task sets. Exact test selection preserves the requested order and fails before any Claude runs if an instance id is not found. Sidecar runs use coding-model focus by default and fall back to deterministic refinement if the local model fails; pass `--skip-model-refinement` for the deterministic-only path or `--strict-model-refinement` to fail on coding-model errors.

Tasks run `--parallel N` at a time (default 4), each already running its baseline and Sidecar Claude Code phases concurrently — so the real concurrent Claude Code process count is `2 * N`. Baseline and sidecar SWE-bench grading also run concurrently. Lower `--parallel` if Claude API rate limits, Docker resources, or local machine memory become a bottleneck; `--parallel 1` restores the old fully-sequential behavior.

The runner defaults Claude Code to `--permission-mode bypassPermissions` because SWE-bench execution is non-interactive and happens in disposable task checkouts. Override with `--permission-mode acceptEdits` for safer debugging. Each task phase writes `claude.<phase>.log`, `sidecar.<phase>.log`, and, with `--claude-debug`, `claude.<phase>.debug.log` for failed-run diagnosis.

For the older paste-it-yourself flow:

```bash
./scripts/e2e_claude_code.sh --manual
```

If your env is already installed:

```bash
./scripts/e2e_claude_code.sh --skip-install
```

Cleanup:

```bash
agent-sidecar hooks uninstall
```
