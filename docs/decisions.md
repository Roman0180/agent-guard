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

## 2026-07-06: Kimi Wrapper Prompt Flow

- Add an env-gated Claude Code hook mode, `AGENT_SIDECAR_KIMI_WRAPPER=1`, where `UserPromptSubmit` calls `/wrap` instead of `/refine`.
- The wrapper first applies deterministic prompt rules. If those rules do not flag the prompt, it tries DeepSeek reasoning refinement before handing the refined contract to Kimi.
- Kimi returns a strict `KimiWrapperResult` whose `display_response` is sent back through Claude Code. The default delivery mode is a hook `decision: block` response so Claude does not spend another model call; `AGENT_SIDECAR_KIMI_WRAPPER_DELIVERY=context` can instead inject the result as additional Claude context.
- Claude Code hooks still do not give Kimi filesystem/tool execution. The wrapper prompt requires Kimi to mark `needs_claude_execution: true` when actual repo edits or command execution are needed rather than claiming files were changed.

## 2026-07-06: SWE-bench Lite Token Savings Runner

- Add `scripts/swebench_lite_token_savings.sh` as a paired-run benchmark harness for token and cost movement.
- The harness loads `princeton-nlp/SWE-bench_Lite`, creates fresh baseline and Sidecar checkouts at each task's `base_commit`, runs Claude Code with prompt interception off and then on, and summarizes Claude telemetry from the Sidecar traces.
- The harness defaults Claude Code to `bypassPermissions` because these are non-interactive benchmark runs in disposable clones; callers can override the mode for safer debugging.
- Each phase records Sidecar startup, hook, telemetry, Claude exit, and optional Claude debug diagnostics beside the benchmark logs.
- The benchmark reports average and aggregate token savings only. It does not run the official SWE-bench Docker verifier or treat token savings as correctness evidence.

## 2026-07-07: CLI Timeout for Local Steering

- Increase the default Agent Sidecar CLI HTTP timeout from 5 seconds to 30 seconds and allow `AGENT_SIDECAR_CLI_TIMEOUT_SECONDS` override.
- Use a 120 second timeout for `agent-sidecar steer` because local DeepSeek/Kimi steering can legitimately exceed short health-check style request windows.

## 2026-07-07: SWE-bench Runner Task Selection

- Extend `scripts/swebench_lite_token_savings.sh` with explicit `--count`, `--test`, `--tests`, and `--test-file` selection flags while keeping the existing `--limit`, `--instances`, and `--instance-file` aliases.
- Exact instance selection and count/offset selection are mutually exclusive. Exact selection preserves caller order and fails before Claude runs start when any requested SWE-bench instance id is missing.

## 2026-07-11: Qwen3-Coder Coding Default

- Change the default coding role from `kimi-linear-48b-a3b` on `llama_server` to `qwen3-coder:30b` on Ollama.
- Keep Kimi-named wrapper APIs and environment variables as compatibility aliases, but route required coding refinement through the generic `AGENT_SIDECAR_REQUIRE_CODING_REFINEMENT` path.
- Update local-model startup so the default sidecar bootstrap pulls the configured coding model through Ollama instead of requiring a separate Kimi GGUF and llama-server process.

## 2026-07-13: Qwen3.6 IQ4 Coding Default

- Change the default coding fallback from `qwen3-coder:30b` to `batiai/qwen3.6-35b:iq4` on Ollama.
- Keep the `sidecar-qwen-coding` registry/model alias for compatibility with existing tuned-model registry entries.
- Treat the new local Ollama route as zero marginal provider cost in the packaged and fallback price maps.

## 2026-07-15: Local DeepSeek V4 Flash Default

- Change the default reasoning and coding fallbacks to `deepseek-ai/DeepSeek-V4-Flash` served through the loopback OpenAI-compatible `llama_server` route.
- Keep hosted DeepSeek API pricing entries for explicit remote configurations, but remove the hosted DeepSeek endpoint from the default allowlist so the default route remains local-only.
- Treat `deepseek-ai/DeepSeek-V4-Flash` and `openai/deepseek-ai/DeepSeek-V4-Flash` as zero marginal provider cost in the packaged and fallback price maps.
- Update `scripts/start_local_models.sh` to preflight a local V4 Flash server instead of pulling an Ollama coding model; `deepseek-v4-flash:cloud` is not acceptable for local-only runs.

## 2026-07-17: SWE-bench Grading Closes the Token-Only Reporting Gap

- The 2026-07-06 decision noted the SWE-bench harness reported token/cost savings only and did not run the official verifier. That caveat is now stale: `scripts/swebench_lite_token_savings.sh` runs the SWE-bench Docker grader by default (`--skip-grading` opts out), and `write_summary` reports `quality_preserved_pct`, `score_delta`, `sidecar_regressions`, and `sidecar_improvements` alongside token and cost savings in the same `summary.json`/`summary.txt`, so cost movement is never reported without a correctness signal next to it.
- `daemon/api.py`'s `_swebench_dashboard_runs` reads each instance's `results.jsonl` row directly and surfaces `baselineScore`/`sidecarScore`/`qualityVerdict` next to `savingsPercent` per run in the dashboard, and `_dashboard_totals` rolls this into a `qualityPreservationRate` across all runs (session and SWE-bench). Covered by `test_dashboard_metrics_route_returns_real_session_and_swebench_rows` in `tests/integration/test_daemon_api.py`.
- No code change was required for this entry; it corrects the record so the design doc and decisions log describe the harness that actually exists.

## 2026-07-17: DeepSeek-R1 Reasoning Role, Split Back Out From DeepSeek V4 Flash

- Change the reasoning-role default from `deepseek-ai/DeepSeek-V4-Flash` (`llama_server`) to a DeepSeek-R1 distill (`deepseek-r1:14b`) served through Ollama. The coding role is unchanged and still defaults to `deepseek-ai/DeepSeek-V4-Flash` via `llama_server`.
- Reasoning is the role behind steering judgments (`continue`/`suggest`/`warn`) and refinement approval — the model that most directly "guides Claude." R1 distills are trained specifically for chain-of-thought judgment tasks, which is a closer fit than a flash-tier coding model tuned for fast code drafting. This reintroduces the two-model split from before the 2026-07-15 collapse to a single model, but for reasoning quality, not cost: both routes remain local and zero marginal cost under D10, so there is no cost regression from serving two models instead of one.
- `scripts/start_local_models.sh` now starts Ollama and pulls the reasoning model by default (`START_DEEPSEEK` defaults to `1`, `DEEPSEEK_MODEL` defaults to `deepseek-r1:14b`); the coding-role V4 Flash preflight is unchanged. Callers on constrained hardware can set `DEEPSEEK_MODEL=deepseek-r1:8b`; callers with more memory can size up to `deepseek-r1:32b` or larger.
- `evaluate_implementations_with_deepseek` in `scripts/e2e_claude_code.sh` already resolves `ModelRole.reasoning` through the router, so the e2e paired-run quality verdict now runs on the reasoning model without any script logic change.
- Added `deepseek-r1:14b` and `deepseek-r1:32b` as zero-cost entries in the packaged price map alongside the existing `deepseek-r1:8b` entry.

## 2026-07-17: Qwen3-Coder-Next Coding Role

- Change the coding-role fallback from `deepseek-ai/DeepSeek-V4-Flash` to `Qwen/Qwen3-Coder-Next` served through the loopback OpenAI-compatible `llama_server` route.
- Keep DeepSeek-R1 as the reasoning role. Qwen is used for implementation-focused prompt refinement and concrete next-step drafting, while DeepSeek-R1 handles steering judgments and refinement approval.
- Update `scripts/start_local_models.sh` to preflight `Qwen/Qwen3-Coder-Next` and print vLLM/SGLang install commands when it is not served locally.
- Treat `Qwen/Qwen3-Coder-Next` and `openai/Qwen/Qwen3-Coder-Next` as zero marginal provider cost in the packaged and fallback price maps.

## 2026-07-17: Revert Qwen3-Coder-Next Coding Role

- Revert the coding-role default back to `deepseek-ai/DeepSeek-V4-Flash` through the loopback OpenAI-compatible `llama_server` route.
- Keep the split introduced earlier the same otherwise: DeepSeek-R1 remains the reasoning role through Ollama, and DeepSeek V4 Flash is again the implementation-focused coding role.
- Keep optional Qwen route support available for explicit overrides, but remove Qwen from the default config and local runbooks.

## 2026-07-17: Qwen3-30B-A3B Reasoning Role, Replacing DeepSeek-R1

- Change the reasoning-role default from a DeepSeek-R1 distill (`deepseek-r1:14b`) to `qwen3:30b-a3b` (Qwen3-30B-A3B-Instruct), still served through Ollama. The coding role is unchanged and still defaults to `deepseek-ai/DeepSeek-V4-Flash` via `llama_server`.
- Root cause of the reported problem ("still spending too much on Claude tokens" after the DeepSeek-R1 swap): the Claude Code `UserPromptSubmit` hook budgets the entire `/refine` round trip at `REFINE_TIMEOUT_SECONDS = 5.0` (`adapters/claude_code/hook_script.py`), not the per-model-call `models.timeout_ms` (12000ms). A dense 14B model doing full-parameter generation for every token routinely exceeds a 5-second wall-clock budget on typical local hardware, so in real Claude Code sessions the reasoning call was very likely timing out most of the time and silently falling back to the deterministic path (D11: steering/refinement never blocks, hooks always exit 0) — meaning the model swap had no measurable effect on Claude's token spend even though the local `/models` route reported it as available.
- `qwen3:30b-a3b` is a mixture-of-experts model with ~3B active parameters per token (same reasoning Kimi-Linear-48B-A3B was originally picked for the coding role, 2026-07-02 era decisions): 30B-class judgment quality at close to 3B-dense latency, so the reasoning call is far more likely to actually complete inside the 5-second hook budget and land its `continue`/`suggest`/`warn` judgment before Claude keeps burning turns, instead of quietly no-op'ing behind a timeout every time.
- `scripts/start_local_models.sh`: renamed the reasoning env vars to `REASONING_MODEL` (default `qwen3:30b-a3b`) and `START_REASONING` (default `1`); `DEEPSEEK_MODEL`/`START_DEEPSEEK` remain supported as compatibility aliases. Constrained hardware can set `REASONING_MODEL=qwen3:4b`; machines with more memory and a longer configured refine timeout can use `qwen3:32b`.
- `scripts/e2e_claude_code.sh`'s reasoning-route preflight previously asserted `"deepseek" in model_id.lower()`; that check is model-family-hardcoded and would have hard-failed under this default, so it was changed to check `served`/`available` only, independent of model family.
- Added `qwen3:30b-a3b` as a zero-cost entry in the packaged price map. The existing `deepseek-r1:*` entries are left in place for anyone who explicitly configures that route back.
- This does not touch the coding role or the Claude-Code-side token accounting; it only changes which local model the sidecar's own reasoning role runs, so the fix is about making the existing steering/refinement mechanism actually fire in practice, not about changing what it decides.
- Correction, same day: `deepseek-r1:14b` was never actually pulled on the machine this was configured on — `ollama list` never showed it, only `deepseek-r1:7b`/`8b`. Since the router checks `model_is_served()` before every call and silently falls back to deterministic on failure (D11), the reasoning role was very likely running 100% deterministic the whole time regardless of which model name was configured, independent of the timeout theory above. Configuring a route without verifying the weights are actually pulled is not a real model swap. `qwen3:30b-a3b` was pulled and confirmed present via `ollama list` before being relied on again.

## 2026-07-17: Bound Echoed-Prompt Length in the Deterministic Refiner

- Real cost data (`.agent-sidecar/swebench-lite/20260716T133636Z/summary.json`) showed a paired run costing 97% more with the sidecar path (2 instances, same grade both ways: no quality gain for the extra spend). Tracing one instance to its session trace found the actual cause, unrelated to reasoning-model choice: the raw prompt that day had the SWE-bench oracle `FAIL_TO_PASS`/`PASS_TO_PASS` test-name lists (~89 names) embedded in the issue text, and `refine_deterministically()` (`intel/refiner_fallback.py`) echoed the entire original prompt verbatim into `Task: {task}` with no length bound. Claude then treated the enumerated list as a checklist and ran all 89 tests, versus baseline's targeted 29 tests it chose on its own from the same polluted input.
- Added `MAX_ECHOED_TASK_CHARS = 700` in `intel/refiner_fallback.py` and truncate the echoed task text (word-boundary aware, matching the `_truncate` pattern already used in `intel/refiner.py`'s coding-followup prompt). `detect_issues()` still runs against the full untruncated prompt so vague/underspecified detection is unaffected.
- Added a second, independent bound in `adapters/claude_code/hook_script.py`: `MAX_TASK_CHARS = 4000` truncates `refined_prompt` before `format_refinement_context()` assembles the final context block, so the synthesized `Checks:`/`Validation:`/`Boundaries:` sections (the actual scope-limiting guidance) can no longer be silently crowded out by a long or model-drafted `refined_prompt` when the whole block later gets cut at `MAX_CONTEXT_CHARS = 9500`. This covers the ensemble/reasoning-only/coding-only paths where `refined_prompt` comes from a model and isn't bounded by the deterministic-path fix above.
- The exporter-side leak this specific regression traced back to (`write_prompt()` in `scripts/swebench_lite_token_savings.sh` embedding dataset fields beyond `problem_statement`) was not reproduced in the current script — `problem_statement` was confirmed clean in the current `tasks.jsonl` shape. The two bounds above are still worth keeping regardless, since nothing else in the pipeline previously stopped a long or polluted prompt from being amplified into an even larger contract.
- Not yet re-verified with a fresh live paired SWE-bench run: the reasoning-role model (`qwen3:30b-a3b`) had to be pulled from scratch in this environment, and the coding role's `llama_server`/vLLM endpoint for `deepseek-ai/DeepSeek-V4-Flash` was not running and vLLM is not installed (this Ollama instance is macOS/ARM, which vLLM does not reliably support). A live before/after comparison is still outstanding.

## 2026-07-17: Llama 3 8B Reasoning Role, Replacing Qwen3-30B-A3B (Live-Verified)

- After pulling `qwen3:30b-a3b` and testing it live on real hardware (24GB unified memory, Ollama 0.30.8): direct `complete_json` calls took 11-14 seconds and returned `None` (parse/timeout failure); `curl` against Ollama's `/api/chat` returned a malformed empty response (`{"model":"","message":{"content":""},"done":false}`) even with a 90-second client timeout; `ollama run qwen3:30b-a3b` produced no output at all. This is not a latency problem, it is broken on this hardware — the MoE-active-parameters efficiency argument from the previous entry does not hold here in practice, whatever the theoretical reasoning was.
- Verified the same Ollama instance is otherwise healthy: `deepseek-r1:8b` (already pulled) answered correctly and fast (585ms) on the identical endpoint immediately before and after the qwen3 failures. The problem is specific to `qwen3:30b-a3b` on this machine, not a general local-serving outage.
- Changed the reasoning-role default to `llama3:latest` (Meta Llama 3 8B, Q4_0, already present locally, no pull required). Verified live with the actual `complete_json(ModelRole.reasoning, ...)` path against a realistic steering judgment (repeated failed validation + repeated edit findings): 1.4-2.1 seconds per call across repeated runs, valid `SteerResult` JSON every time, `evidence_event_ids` correctly grounded to only the ids present in the findings (no hallucination), and a defensible `warn`/`suggest` decision. This is the first of the three reasoning-role changes made today that was confirmed working end-to-end before being committed as the default, rather than configured and assumed to work.
- `qwen3:30b-a3b` and `deepseek-r1:14b` entries are left in the price map for anyone who wants to retry them on different hardware; do not assume either is currently viable as a default without live-testing on the target machine first, per the same-day `llama3:latest` verification method above (a direct `complete_json` timing+correctness check, not just checking `/models` reports the route as available).
- `src/agent_sidecar/schema/config.py`: reasoning role now `sidecar-llama3-reasoning` / `llama3:latest` / `ollama`. `src/agent_sidecar/data/litellm_prices.json`: added a zero-cost `llama3:latest` entry. `scripts/start_local_models.sh`: `REASONING_MODEL` default is now `llama3:latest`; help text now explicitly says to verify a candidate model actually serves and finishes within the timeout budget on your own hardware before trusting it, rather than picking one on paper.
- Also fixed, exposed by this verification: `tests/integration/test_daemon_api.py::test_chunk2_routes_refine_steer_cost_and_models` asserted a hardcoded `"warn"` steering decision, which is only guaranteed when no local model is reachable (D7: CI runs fully offline). Since this dev machine had a real Ollama instance running with a model matching whatever the configured reasoning-role default happened to be, the test intermittently exercised the live model path instead of the deterministic fallback and got a different, also-valid decision (`"suggest"`). Added `_write_unreachable_model_endpoints_config()` to point both role endpoints at an unreachable loopback port for that test, so its assertions no longer depend on what happens to be running on the host.

## 2026-07-17: Parallelize the SWE-bench Lite Runner

- `scripts/swebench_lite_token_savings.sh` previously ran selected SWE-bench Lite instances strictly one at a time (baseline+Sidecar Claude phases already ran in parallel within a task, but the outer loop over tasks was sequential), and graded baseline vs Sidecar predictions in two sequential SWE-bench harness invocations. Both are now parallelized.
- Added `--parallel N` / `SWEBENCH_PARALLEL_TASKS` (default 4): runs up to N tasks concurrently via a same-process PID-tracking job pool (`reap_finished_tasks`/`wait_for_task_slot`/`wait_for_all_tasks`), not `wait -n` or `xargs -P`. `wait -n` needs bash >= 4.3; this machine's `/bin/bash` is 3.2.57 (Apple's default, no Homebrew bash on PATH), and this script has to run there. `xargs -P` would need `export -f` for every helper function `run_task` transitively calls, which is fragile at this file's size (~40 interdependent functions, many relying on script-global variables).
- `run_grading()` now runs the baseline and sidecar SWE-bench grader phases concurrently (each grades an independent prediction set under a distinct run_id, so no shared mutable state between them) instead of back to back.
- Fixed two concurrency hazards this exposed, both real bugs the sequential design happened to never trigger:
  - `ensure_repo_cache()` had no locking: two tasks selecting instances from the same repo (common in SWE-bench Lite, e.g. multiple `django/django` instances) could race to `git clone --mirror` the same not-yet-cached repo concurrently and corrupt it. Added a portable mkdir-based spinlock per repo (no `flock(1)` — not present on macOS by default) with a 5-minute wait ceiling and a `set +e`/`set -e` guard so a failed clone still releases the lock instead of deadlocking every future run for that repo.
  - `append_pair_result`'s CSV writer checked `csv_path.exists()` and conditionally called `writer.writeheader()` on every task's result — a check-then-write race that could duplicate the header row under concurrent tasks. Fixed by pre-writing the CSV header once in `prepare_output_files()` (before any tasks start) and removing the conditional header logic entirely.
- Bash 3.2 gotcha hit and fixed during this work: bare `"${array[@]}"` expansion of a zero-element array raises "unbound variable" under `set -u` in bash 3.2/3.x (confirmed live on this machine), even though `${#array[@]}` and `${!array[@]}` are safe on empty arrays. `reap_finished_tasks()`'s array reassignments are guarded with explicit `${#array[@]} -gt 0` checks rather than relying on the bare expansion.
- Verified with `--dry-run` (skips the real Claude/Docker/network paths) at `--count 5 --parallel 2`, `--count 8 --parallel 3`, and `--count 2 --parallel 5 --fail-fast`: all completed with exit 0, interleaved task output confirming genuine concurrent execution, no unbound-variable errors. Not verified against a real (non-dry-run) paired run with live Claude Code/Docker grading in this environment — that would spend real Anthropic API cost and requires Docker running, neither exercised here.
- `--fail-fast`'s semantics changed slightly under parallel execution: it now stops launching *new* tasks on the first failure but lets already-in-flight concurrent tasks finish before exiting non-zero, rather than exiting the instant one failure is seen. Aborting in-flight real Claude Code sessions immediately isn't safe or desirable (their results wouldn't be recorded), so this is a deliberate adaptation of the original sequential-only semantics, not an oversight.

## 2026-07-17: Llama 3 8B Coding Role, Replacing DeepSeek V4 Flash (Live-Verified)

- Checked whether the coding role was actually reachable, applying the same live-verification standard the reasoning-role fix established: `deepseek-ai/DeepSeek-V4-Flash` via `llama_server` at `localhost:8080/v1` has never had anything listening on that port in this environment. `complete_json` confirmed this fails fast and cleanly (0.00s, not a hang), so every coding-model call has been silently falling back to deterministic refinement — the same "configured but never proven" bug as the reasoning role, just degrading gracefully instead of hanging.
- Verified the `llama_server` serving path itself works by standing up a real `llama-server` (llama.cpp, installed via Homebrew) on port 8080, reusing GGUF blobs already on disk from prior Ollama pulls (`ollama show <model> --modelfile` prints the blob path) rather than downloading anything new. First test used Phi-3-Mini and returned `None`; traced this to the test's own ad-hoc prompt omitting `files_or_components`, a required `RefineDraft` field — not a real bug. Re-ran against Llama 3 8B (same GGUF-blob trick) using the actual production `refine_coding.txt` template: valid, schema-conforming `RefineDraft` JSON every time, 2.7-4.1 seconds per call.
- Changed the coding-role default from `deepseek-ai/DeepSeek-V4-Flash` to `llama3:latest`, keeping `serving: llama_server` (unchanged architecture: llama.cpp's llama-server, OpenAI-compatible, distinct from the reasoning role's Ollama backend). Both roles now default to the same model file but via two different local server processes, which was a deliberate choice to preserve D8's dual-backend design rather than collapsing to a single shared Ollama instance — running two ~4.7GB (Q4_0) copies is well within budget on the 24GB machine this was verified on, unlike the previous near-20GB single-model failures.
- `src/agent_sidecar/schema/config.py`: coding role now `sidecar-llama3-coding` / `llama3:latest` / `llama_server`. `litellm_prices.json` and `intel/cost.py`'s `FALLBACK_PRICE_MAP`: added zero-cost `llama3:latest` and `openai/llama3:latest` entries (the `openai/` prefix is what LiteLLM uses for the `llama_server` route). `scripts/start_local_models.sh`: introduced `CODING_MODEL` (default `llama3:latest`), with `DEEPSEEK_V4_MODEL` kept as a compatibility alias; `assert_local_coding_model_served()` now documents starting `llama-server` (via `brew install llama.cpp` or reusing an existing Ollama-pulled GGUF) instead of vLLM/SGLang.
- Two tests asserted the old coding default and were updated to match: `test_router_defaults_coding_to_local_deepseek_v4_flash` (renamed `test_router_defaults_coding_to_local_llama3`) in `tests/unit/test_intel_chunk2.py`, and `test_config_created_with_defaults` in `tests/unit/test_schema_store.py`. `test_deepseek_v4_infers_local_openai_compatible_serving` was left alone — it tests `infer_serving()`'s behavior for the literal string `"deepseek-ai/DeepSeek-V4-Flash"`, which is independent of what the current default happens to be.
- Not changed: `tuning/recipes/*.yaml` and `tuning/modelfiles/*.Modelfile` still carry names from the original Kimi-era design (`kimi_coding_qlora.yaml`, `sidecar-kimi-coding.Modelfile`) and the design doc's B1 tree listing already referenced a `deepseek_v4_coding_qlora.yaml` that never existed on disk — this drift between the offline tuning pipeline's naming and the runtime default predates this change by several coding-role swaps and is out of scope here; the offline tooling doesn't affect runtime behavior or cost.
