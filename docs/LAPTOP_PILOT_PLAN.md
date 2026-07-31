# Laptop Pilot Plan: Remote Agent Sidecar Served From One Laptop

Goal: pilot users run the full Agent Sidecar locally (hooks, daemon, traces, detectors, budget guard — the free tier), and only the model-intelligence calls (refine/steer completions) route to the operator's laptop over Tailscale. The operator can test the identical remote path on the same laptop. When the operator's laptop is unreachable, every pilot silently degrades to deterministic mode — this is the free-tier fallback working as designed, and it doubles as the experiment's control condition.

```text
Pilot machine                                Operator laptop (M4 Pro, 24 GB)
┌──────────────────────────────┐             ┌─────────────────────────────────┐
│ Claude Code                  │             │ Tailscale (no public ports)     │
│ hooks → local daemon :7433   │  tailnet    │ Ollama :11434                   │
│ traces/detectors/budget local│ ──────────► │   llama3 (reasoning + coding)   │
│ model roles → operator laptop│  HTTP       │   keep_alive=-1 (stays resident)│
└──────────────────────────────┘             └─────────────────────────────────┘
```

Measured baseline on the operator laptop (2026-07-30): Llama 3 8B Q4 via Ollama generates at **51 tok/s**, cold load 3.5 s, 256-token completion ≈ 5.2 s warm. Tailnet RTT adds ~10–50 ms — negligible. The refine timeout is already bumped to 10 s via the installer default (`AGENT_SIDECAR_REFINE_TIMEOUT_SECONDS=10`).

## Design decisions

1. **Both model roles served from one Ollama instance.** The current config splits roles across Ollama (reasoning) and llama-server (coding). For the pilot, point both at Ollama's `llama3:latest`: one ~5 GB resident copy instead of two, one service to keep alive, and llama-server isn't running today anyway. The `serving` field per role already supports this.
2. **Tailscale, no auth code.** The tailnet is the security boundary. No bearer tokens, no TLS, no daemon changes. The pilot joins via a shared node or invite.
3. **Remote endpoints via existing config seams, not new code.** `validate_route_allowed` (src/agent_sidecar/models/router.py) blocks non-loopback endpoints unless `models.remote_fallback: true` and the allowlist matches. The pilot config flips that flag and pins the allowlist to the operator's tailnet URL only — no wildcard remote access.
4. **The pilot's `remote_fallback: true` is scoped by the allowlist pin.** Design decision D10 (remote disabled by default) stays true for the shipped defaults; the pilot config is an explicit, documented opt-in, and every model call is already receipted in the trace as a `model_call_completed` event with latency and failure reason.

## Phase 1 — Operator laptop setup (no code)

1. `tailscale up`; note the machine's tailnet IP (`tailscale ip -4`, e.g. `100.98.101.5`).
2. Apply the least-privilege ACL before inviting the pilot: fill the pilot's Tailscale identity into `docs/examples/tailscale-acl.hujson` (GitHub sign-in renders as `username@github`; other providers as an email — confirm the exact string in the admin console after they accept) and paste it into the Tailscale admin console. It restricts the pilot's devices to this laptop's ports 11434 and 8000 only (Tailscale's default is allow-all between nodes). Then invite the pilot, or prefer node sharing, which exposes a single machine instead of joining them to the tailnet.
3. Run `./scripts/pilot_operator_setup.sh`. It keeps Ollama bound to `127.0.0.1` (never set `OLLAMA_HOST=0.0.0.0` — that exposes the unauthenticated Ollama API on whatever Wi-Fi the laptop joins), publishes it to the tailnet with `tailscale serve --bg --tcp=11434 tcp://localhost:11434`, sets `OLLAMA_KEEP_ALIVE=-1` so the pilot's first prompt after idle doesn't pay the 3.5 s cold load, and verifies the tailnet path works while the LAN path stays closed. `--check` runs the verification without changing anything.
4. When stepping away with the lid closed, run `caffeinate -s` (plugged in) to keep serving; otherwise accept pilot degradation to deterministic mode.
5. Memory discipline while serving: avoid loading the 30B-class models (`qwen3:30b`, 18 GB) for personal experiments during pilot hours; llama3 (5 GB) + normal dev work fits comfortably in 24 GB.

## Phase 2 — Code and config changes (small)

1. **Pilot config template** — add `docs/examples/pilot-config.json` (copied into the pilot's `.agent-sidecar/config.json`), diffs from default:
   - `models.roles.coding.serving`: `"ollama"`, `fallback_base`: `"llama3:latest"` (single-backend decision)
   - `models.roles.reasoning.fallback_base`: `"llama3:latest"` (unchanged behavior, explicit)
   - `models.endpoints.ollama.api_base`: `"http://<operator-tailscale-ip>:11434"`
   - `models.remote_fallback`: `true`
   - `models.allowlist`: `["ollama_chat/*@http://<operator-tailscale-ip>:11434"]` — pinned, no other remote allowed
2. **Env override for the Ollama endpoint** — add `AGENT_SIDECAR_OLLAMA_API_BASE` support in config loading (`schema/config.py`). Lets the operator switch one machine between self-test (tailnet URL) and pure-local (`127.0.0.1`) without editing files, and lets the pilot be reconfigured without touching JSON.
3. **Cap completion length** — `LiteLLMModelProvider._max_tokens()` defaults to 768, which at 51 tok/s is a worst-case 15 s generation; the 12 s `timeout_ms` would kill it and waste the whole budget. Lower the default for refine/steer calls to 256 (≈5 s worst case) or set `AGENT_SIDECAR_MODEL_MAX_TOKENS=256` in the pilot's daemon environment. Prefer a `models.max_tokens` config field so it's per-install, not per-shell.
4. **Preflight timeout audit** — `model_is_served(..., timeout_s=0.5)` and `_endpoint_reachable(timeout=1.0)` run per model call. Over the tailnet these fit easily (RTT ≪ 500 ms) but verify once from the pilot's machine; if the pilot is on a high-latency network, make the preflight timeout configurable.
5. **No hook or daemon changes.** The pilot's hooks talk to their own local daemon; the refine-timeout default (10 s) is already in the installer.

## Phase 3 — Self-test on the operator laptop

The point: exercise the *identical* remote path the pilot uses, on one machine. Traffic to the machine's own tailnet IP routes through the Tailscale interface, so allowlist enforcement, non-loopback validation, serving preflight, and real network framing are all exercised — unlike a `127.0.0.1` test, which `validate_route_allowed` treats as a different (loopback) case. Use the tailnet IP, not the `.ts.net` DNS name: Ollama's DNS-rebinding protection returns 403 for hostnames it does not recognize while accepting IP `Host` headers (verified 2026-07-30).

1. Apply the pilot config template locally with `api_base` set to this laptop's own tailnet IP.
2. `agent-sidecar models list` → both roles must show `available: true`, `serving: ollama`, the tailnet `api_base`.
3. Route validation check: with `remote_fallback: false` temporarily, confirm both roles go unavailable (proves the allowlist/loopback gate actually guards the path); restore `true`.
4. Live refine: in a Claude Code session with hooks installed, submit a vague prompt; verify the injected task contract reports a model-assisted `source` (not `deterministic`) and the trace records `model_call_completed` with sane latency (~3–6 s).
5. Fallback drill: `ollama stop` (or quit the app), submit another prompt; session must continue with `source: deterministic` and no user-visible error. Restart Ollama; next prompt returns to model-assisted. This is the exact experience of "operator laptop asleep".
6. Timing check under contention: run a personal inference call concurrently with a refine; confirm the refine still lands inside the 10 s hook timeout.
7. Full loop: `./scripts/e2e_claude_code.sh --single` with the remote-path config to confirm nothing in the paired-run tooling assumes loopback model endpoints.

## Phase 4 — Pilot onboarding

1. Pilot installs Tailscale, accepts the tailnet invite; verify `curl http://<operator-tailscale-ip>:11434/api/tags` from their machine.
2. Pilot installs the sidecar from a URL served off the operator laptop: the operator runs `./scripts/pilot_distribute.sh` (builds the wheel into `dist/pilot/`, prints the SHA-256, and serves it on the tailnet address), and the pilot runs `pip install http://<operator-tailscale-ip>:8000/agent_sidecar-<version>-py3-none-any.whl` into a venv. Only the ~74 KB runtime wheel is distributed — no repo access, no tuning recipes, no docs. Full client instructions: `docs/examples/PILOT_SETUP.md`.
3. Pilot drops in the config template, runs `agent-sidecar start`, `agent-sidecar hooks install` (gets the 10 s refine timeout automatically), and `agent-sidecar models list` to confirm both roles resolve to the operator endpoint.
4. One live smoke test together (screen share): vague prompt → model-assisted contract; operator kills Ollama → deterministic fallback; restore.
5. Disclose explicitly: pilot prompts (not code, not traces) transit to the operator's laptop for refinement; traces stay on the pilot's machine.

## Phase 5 — Measurement

- Every refinement records its `source` and every model call records latency and `failure_reason`, so normal pilot usage produces a natural A/B: model-assisted refinements when the operator laptop is up, deterministic when it isn't.
- Weekly: pull the pilot's session summaries (`agent-sidecar summary export`) and compare cost-per-successful-task and steps-per-task between model-assisted and deterministic sessions.
- Success criterion for the pilot (same bar as the benchmark): model-assisted sessions are non-inferior on outcome quality and better on measured cost. If deterministic ties or wins, the paid tier isn't earning its latency — that's a product finding, not a deployment failure.

## Risks

- **Operator laptop sleep/downtime** → pilot degrades to deterministic. Acceptable and disclosed; also the control condition. Mitigate during pilot hours with `caffeinate`.
- **Timeout stack-up**: refine hook 10 s > model timeout 12 s is inverted — a slow model call can outlive the hook wait, wasting the call. Consider dropping `models.timeout_ms` to ~9000 in the pilot config so the daemon gives up before the hook does.
- **Contention with operator's own inference** on shared Apple Silicon: requests serialize; rare with one pilot, bounded by the timeout, invisible beyond a slower refine.
- **`remote_fallback: true` scope**: keep the pilot allowlist pinned to exactly one URL; never ship a wildcard remote entry.
- **Unauthenticated Ollama API**: Ollama has no auth of its own, so the tailnet is the entire security boundary. Keep Ollama loopback-only behind `tailscale serve` (never `OLLAMA_HOST=0.0.0.0`), keep the ACL scoped to the pilot's login and ports 11434/8000, and keep Ollama updated (its API has a history of RCE-class CVEs).
