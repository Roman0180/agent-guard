# End-to-End Claude Code

Start/register Kimi for implementation focus and DeepSeek for post-run evaluation before running the demo. One available helper is:

```bash
START_DEEPSEEK=1 ./scripts/start_local_models.sh
```

Then run the demo from the repo root:

```bash
./scripts/e2e_claude_code.sh
```

The script runs Claude Code with `CLAUDE_MODEL=opus` by default. Override it when needed:

```bash
CLAUDE_MODEL=sonnet ./scripts/e2e_claude_code.sh
```

The demo script verifies the Kimi coding route and DeepSeek reasoning route before launching Claude Code. DeepSeek is used only to evaluate the saved baseline and Sidecar implementations after both runs; it is not used for prompt refinement.

The demo script backs up the current `boilerplate.html`, resets it to the same controlled starter file before both runs, uses deterministic prompt refinement plus Kimi implementation focus, submits the example prompt to Claude Code automatically, captures both session IDs, optionally derives a Sidecar cost budget from the baseline session when measured baseline cost is available, prints savings from raw Claude API-request telemetry, prints baseline-vs-Sidecar execution time, then asks DeepSeek for a single verdict on whether Sidecar preserved implementation quality. It resets `boilerplate.html` again before exit.

If Kimi cannot produce the coding focus, DeepSeek cannot evaluate the finished outputs, quality is not preserved, or measured Sidecar cost is not lower than baseline cost, the script exits non-zero. Cost savings are printed before the DeepSeek quality verdict. Model route preflight failures stop before spending Claude baseline/sidecar tokens.

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

For the Kimi-wrapper prompt flow, start the daemon and hooks normally, then enable the wrapper before launching Claude Code:

```bash
agent-sidecar start
agent-sidecar hooks install
eval "$(agent-sidecar telemetry print-env)"
export AGENT_SIDECAR_KIMI_WRAPPER=1
claude
```

In this mode, a `UserPromptSubmit` hook calls `/wrap`: deterministic prompt rules run first, DeepSeek refines only when the deterministic rules do not flag the prompt, Kimi produces the display response, and the hook blocks Claude execution by default so Claude Code displays the Kimi result without spending another model call. Set `AGENT_SIDECAR_KIMI_WRAPPER_DELIVERY=context` to inject the Kimi result as additional Claude context instead.

For a SWE-bench Lite token-savings benchmark:

```bash
./scripts/swebench_lite_token_savings.sh --limit 3
```

The script loads `princeton-nlp/SWE-bench_Lite`, creates fresh baseline and Sidecar checkouts for each selected instance, runs Claude Code once with prompt interception disabled and once with Sidecar enabled, then writes per-instance and aggregate token savings under `.agent-sidecar/swebench-lite/<timestamp>/`. This measures token and cost movement from Claude telemetry; it does not run the official SWE-bench Docker verifier or claim task correctness. Use `--instances <id1,id2>` or `--instance-file <path>` for fixed task sets, and `--require-kimi` when the local Kimi route must be part of the Sidecar run.

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
