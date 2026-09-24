# End-to-End Claude Code

## Everyday use: refine your prompts in the terminal

To use Agent Sidecar for normal interactive work — open Claude Code in the terminal, type prompts as usual, and have Sidecar refine each one automatically — you only need the daemon and the hooks. Run these from the repo where you want Sidecar active (the hooks are written into that repo's `.claude/settings.json`):

```bash
# 1. Start the Sidecar daemon (the background service that does the refinement)
agent-sidecar start

# 2. Install the Claude Code hooks into ./.claude/settings.json
agent-sidecar hooks install

# 3. Run Claude Code and type prompts normally
claude
```

Once the hooks are installed, every prompt you submit fires a `UserPromptSubmit` hook that refines the prompt before Claude sees it: deterministic prompt rules run first, and a well-specified prompt passes straight through. The interception is transparent — you just use Claude Code as you normally would.

**Notes:**

- Hooks are per-repo. `agent-sidecar hooks install` edits `.claude/settings.json` in the current directory (backing up the original); run it in each repo where you want Sidecar. Check state with `agent-sidecar hooks status`.
- The hook waits `--refine-timeout` seconds (default 10) for a model refine, then falls back to deterministic refinement. Raise it if your local model is slow: `agent-sidecar hooks install --refine-timeout 30`.
- Deterministic refinement needs no extra setup. Coding-model refinement additionally needs the local model routes described below (`./scripts/start_local_models.sh`).
- Everyday use does not require telemetry setup; the benchmarking scripts below configure telemetry themselves.
- When you're done: `agent-sidecar hooks uninstall`.

The rest of this document covers the baseline-vs-Sidecar benchmarking harness and the SWE-bench savings run, which are for **measuring** Sidecar rather than everyday use.

## Benchmarking harness

### Local model routes

Sidecar's benchmarking flow uses two local routes:

- **Coding route** — Llama 3 8B served by llama.cpp's `llama-server`. Produces the implementation-focused follow-up.
- **Reasoning route** — Llama 3 8B pulled and served through Ollama. Evaluates the finished baseline and Sidecar implementations in paired mode.

Both routes currently run the same model (Llama 3 8B); the split exists so either route can be swapped independently. Some output filenames and the wrapper env var retain legacy model names (`deepseek.*`, `KIMI_WRAPPER`) from earlier route configurations — they are kept for compatibility and do not indicate which model is actually running.

Start the coding route, then let the helper pull and preflight the reasoning route:

```bash
# macOS
brew install llama.cpp
# Linux: build llama.cpp from source or use the official release binaries

llama-server -hf bartowski/Meta-Llama-3-8B-Instruct-GGUF:Q4_0 --host 127.0.0.1 --port 8080 --alias llama3:latest

./scripts/start_local_models.sh
```

The `--alias llama3:latest` value must match the model name Sidecar's coding route is configured to request.

### Running the demo

From the repo root:

```bash
./scripts/e2e_claude_code.sh
```

The script runs Claude Code with `CLAUDE_MODEL=opus` by default. `CLAUDE_MODEL` is a script-level variable (translated to Claude Code's `--model` flag internally — exporting it for a plain `claude` session has no effect). Override it when needed:

```bash
CLAUDE_MODEL=sonnet ./scripts/e2e_claude_code.sh
```

The demo script verifies both local routes before launching Claude Code. Sidecar uses deterministic prompt refinement, then asks the configured local coding model for the implementation-focused follow-up. In paired mode, the local reasoning model evaluates the saved baseline and Sidecar implementations after both runs.

**What the paired run does, in order:**

1. Backs up the current `boilerplate.html`.
2. Resets it to the same controlled starter file before both runs.
3. Applies deterministic prompt refinement plus local coding-model implementation focus.
4. Submits a compact example prompt to Claude Code automatically and captures both session IDs.
5. Optionally derives a Sidecar cost budget from the baseline session when measured baseline cost is available.
6. Prints savings from raw Claude API-request telemetry, then baseline-vs-Sidecar execution time.
7. Asks the local reasoning model for a single verdict on whether Sidecar preserved implementation quality (cost savings print before this verdict).
8. Resets `boilerplate.html` again before exit.

The built-in prompt is scoped for a roughly 45-second Claude phase. Override it without editing the script:

```bash
AGENT_SIDECAR_E2E_PROMPT='Replace boilerplate.html with a compact static status card.' ./scripts/e2e_claude_code.sh
```

**The script exits non-zero when any of the following occur:**

- The local coding model cannot produce the coding focus.
- The local reasoning model cannot evaluate the finished outputs in paired mode.
- Quality is not preserved.
- Measured Sidecar cost is not lower than baseline cost.

Model route preflight failures stop the run before spending any Claude baseline/Sidecar tokens.

### Budget defaults

By default the paired run sets:

```
AGENT_SIDECAR_REQUIRE_BUDGET=0
AGENT_SIDECAR_TARGET_SAVINGS_PCT=10
AGENT_SIDECAR_BUDGET_WARNING_THRESHOLD_PCT=80
AGENT_SIDECAR_BUDGET_ENFORCEMENT=block
```

A budget is **optional** (`AGENT_SIDECAR_REQUIRE_BUDGET=0`) — missing budget configuration is not a hard failure in the e2e flow. When a budget **is** configured, enforcement blocks further work at the limit: the Sidecar hook tries to configure the run budget from `AGENT_SIDECAR_BASELINE_SESSION`, adds the budget to the refined prompt context when configuration succeeds, checks spend on each hook invocation, and blocks more work when current measured cost reaches the configured budget.

### Outputs

Outputs are saved under the repo root:

```
.agent-sidecar/e2e/<timestamp>/
```

| File | Contents |
| --- | --- |
| `deepseek.implementation-eval.json` | Reasoning-model implementation verdict (legacy `deepseek.` prefix) |
| `deepseek.implementation-eval.raw.txt` | Raw reasoning-model evaluator responses, for debugging |
| `claude.baseline.duration.txt` | Baseline Claude execution timing |
| `claude.sidecar.duration.txt` | Sidecar Claude execution timing |

### Script flags

```bash
./scripts/e2e_claude_code.sh --single        # single intercepted run, no baseline comparison
./scripts/e2e_claude_code.sh --manual        # older paste-it-yourself flow
./scripts/e2e_claude_code.sh --skip-install  # skip env installation if already installed
```

## Legacy wrapper prompt flow

Start the daemon and hooks normally, then enable the wrapper before launching Claude Code:

```bash
agent-sidecar start
agent-sidecar hooks install
eval "$(agent-sidecar telemetry print-env)"
export AGENT_SIDECAR_KIMI_WRAPPER=1   # legacy name; enables the wrapper flow
claude
```

In this mode, a `UserPromptSubmit` hook calls `/wrap`: deterministic prompt rules run first, the local reasoning model refines only when the deterministic rules do not flag the prompt, the configured local coding model produces the display response, and the hook blocks Claude execution by default so Claude Code displays that result without spending another model call. Set `AGENT_SIDECAR_KIMI_WRAPPER_DELIVERY=context` to inject the wrapper result as additional Claude context instead.

## SWE-bench Lite token-savings benchmark

```bash
./scripts/swebench_lite_token_savings.sh --count 3
./scripts/swebench_lite_token_savings.sh --test astropy__astropy-12907 --test django__django-11099
./scripts/swebench_lite_token_savings.sh --tests astropy__astropy-12907,django__django-11099
./scripts/swebench_lite_token_savings.sh --test-file ./swebench-instances.txt
./scripts/swebench_lite_token_savings.sh --count 12 --parallel 6
```

The script loads `princeton-nlp/SWE-bench_Lite`, creates fresh baseline and Sidecar checkouts for each selected instance, runs Claude Code once with prompt interception disabled and once with Sidecar enabled, runs the SWE-bench grader for both generated patches by default, then writes per-instance and aggregate token savings plus score deltas under `.agent-sidecar/swebench-lite/<timestamp>/`.

**Task selection:** use `--count <n>` with optional `--offset <n>` for count-based selection, or `--test`, `--tests`, or `--test-file` for fixed task sets. Exact test selection preserves the requested order and fails before any Claude runs if an instance id is not found.

**Refinement modes:** Sidecar runs use coding-model focus by default and fall back to deterministic refinement if the local model fails. Pass `--skip-model-refinement` for the deterministic-only path or `--strict-model-refinement` to fail on coding-model errors.

**Parallelism:** tasks run `--parallel N` at a time (default 4), each already running its baseline and Sidecar Claude Code phases concurrently — so the real concurrent Claude Code process count is `2 * N`. Baseline and Sidecar SWE-bench grading also run concurrently. Lower `--parallel` if Claude API rate limits, Docker resources, or local machine memory become a bottleneck; `--parallel 1` restores the old fully-sequential behavior.

**Permissions:** the runner defaults Claude Code to `--permission-mode bypassPermissions` because SWE-bench execution is non-interactive and happens in disposable task checkouts. Override with `--permission-mode acceptEdits` for safer debugging.

**Logs:** each task phase writes `claude.<phase>.log`, `sidecar.<phase>.log`, and, with `--claude-debug`, `claude.<phase>.debug.log` for failed-run diagnosis.

## Cleanup

```bash
agent-sidecar hooks uninstall
```