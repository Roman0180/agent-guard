# Remote Sidecar Plan: Agent Sidecar on AWS

Goal: the user types into Claude Code on their laptop exactly as today. Locally installed hooks intercept every prompt and tool event and route them to an Agent Sidecar daemon running on an AWS instance. The AWS instance runs refinement, detectors, steering, budget guard, and the local model ensemble, and continuously guides the Claude Code session through hook responses. Everything else about the Claude Code experience is unchanged.

## Architecture target

```text
Laptop                                        AWS EC2 instance
┌─────────────────────────────┐               ┌──────────────────────────────────┐
│ Claude Code (unchanged UX)  │               │ Caddy/nginx  :443 (TLS + auth)   │
│   .claude/settings.json     │    HTTPS      │   ├─ /api  → sidecar API :7433   │
│   hook_script.py (thin      │ ────────────► │   └─ /otlp → OTLP recv   :4318   │
│   remote client, exit 0)    │               │ agent-sidecar daemon (FastAPI)   │
│   OTEL exporter → remote    │ ────────────► │ Ollama :11434  (reasoning role)  │
│ CLI: session/replay/cost    │ ────────────► │ llama-server :8080 (coding role) │
│   points at remote URL      │               │ JSONL traces + SQLite on EBS     │
└─────────────────────────────┘               └──────────────────────────────────┘
```

Claude Code itself stays local — it edits local files and runs local commands. What moves to AWS is the sidecar daemon (API + OTLP receiver) and the model ensemble. The hooks remain the local interception point but become a thin authenticated remote client.

## What this changes about the frozen design

This reverses two v3 fixed decisions and must be recorded in `docs/decisions.md` before implementation:

- **D13 (loopback-only ports)** — the daemon becomes network-reachable behind TLS + auth.
- **A3 local-first ("traces stay on disk")** — prompts, tool payloads, file paths, diffs, and telemetry now leave the user's machine. This requires an explicit privacy stance: TLS everywhere, bearer-token auth, the existing `payload_max_bytes` sanitization, and a documented redaction config.

D11 (steering never blocks; hooks always exit 0) is **kept** and becomes even more important: a network failure to AWS must never break a Claude Code session. Every remote call in the hook path stays fail-open.

---

## Phase 0 — Decisions and prerequisites (no code)

1. **Network topology.** Two options:
   - **Option A (recommended for v1): Tailscale/WireGuard.** The EC2 instance joins a tailnet; no ports open to the internet; hooks talk to `http://sidecar-host:7433` over the mesh. Cheapest, fastest to ship, no TLS/auth code needed on day one.
   - **Option B: public HTTPS.** Elastic IP + DNS + Caddy for TLS, bearer-token auth middleware in FastAPI. Required for multi-user/team use. The plan below includes the auth work so Option B is reachable; Option A lets you defer it.
2. **Instance sizing.** The hook's refine timeout is 5 s (`REFINE_TIMEOUT_SECONDS` in [hook_script.py](../src/agent_sidecar/adapters/claude_code/hook_script.py)), and model-assisted refinement must fit inside it including WAN round trip. Llama 3 8B needs a GPU to reliably answer in ~1–3 s:
   - **g6.xlarge / g5.xlarge** (~$0.80–1.01/hr, 24 GB GPU) — runs both Ollama and llama-server comfortably.
   - **CPU-only (c7i.xlarge, ~$0.17/hr)** — viable only in deterministic-refinement mode (models disabled); the deterministic fallback already exists for every model-dependent path, so this is a legitimate cheap tier.
   - Mitigate cost with auto-stop schedules or spot; note that at ~$730/mo for an always-on g5.xlarge, the server cost must enter the cost-per-successful-task accounting or the savings story is dishonest.
3. **Decide the session/workspace identity model.** Session IDs are `cc-<claude-session-uuid>` (globally unique), but a shared server needs a workspace/client ID for grouping, quotas, and trace segregation. Decide: single-user v1 (skip it) or add `X-Sidecar-Workspace` header now.

## Phase 1 — Make the hook client remote-capable (local-side code)

All changes in `src/agent_sidecar/adapters/claude_code/` and `src/agent_sidecar/cli/`.

1. **Auth + TLS in `hook_script.py`.** `request_json()` builds `urllib` requests with only a content-type header. Add `Authorization: Bearer $AGENT_SIDECAR_API_TOKEN` when the env var is set. `urllib` handles HTTPS natively; no new dependencies (the hook script must stay stdlib-only).
2. **Timeout budget rework.** Current timeouts assume loopback: event posts use `TIMEOUT_SECONDS = 0.2`, which will fail on every WAN call and silently drop all capture events (they're wrapped in fail-open try/except). Make timeouts env-tunable with remote-appropriate defaults:
   - event post / budget check: 0.2 s → ~1.5 s (`AGENT_SIDECAR_EVENT_TIMEOUT_SECONDS`)
   - refine: keep 5 s ceiling but measure real RTT in Phase 5
   - All calls remain fail-open (exit 0) — an unreachable server degrades to "no guidance", never a broken session.
3. **Optional local spool (v1.1, not v1).** When the server is unreachable, append event payloads to `~/.agent-sidecar/spool/*.jsonl` and let a `agent-sidecar spool flush` command (or the next successful hook call) replay them. V1 can accept dropped events under outage.
4. **Installer support for remote targets.** Extend `hooks install` ([installer.py](../src/agent_sidecar/adapters/claude_code/installer.py)) with `--api-url https://sidecar.example.com/api --token-env AGENT_SIDECAR_API_TOKEN`, writing those into the hook command env in `.claude/settings.json` (URL inline; token referenced from the user's environment, never written to the settings file).
5. **CLI against the remote daemon.** [cli/client.py](../src/agent_sidecar/cli/client.py) and the `daemon.json` discovery need an override so `agent-sidecar session list|show`, `trace show`, `cost show|compare|budget`, `replay`, and `summary export` all work from the laptop against the AWS URL: honor `AGENT_SIDECAR_API_URL` (same var the hooks use) plus the token, and add `agent-sidecar remote set <url>` to persist it in `~/.agent-sidecar/remote.json`. `start`/`status` gain a mode that reports the remote daemon's `/health` instead of managing a local process.
6. **Telemetry env for remote OTLP.** [telemetry_cmds.print_env](../src/agent_sidecar/cli/telemetry_cmds.py) currently emits `http://127.0.0.1:<otlp_port>`. Teach it the remote endpoint and emit `OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer%20<token>` so Claude Code's native telemetry (measured tokens/cost — the daemon's best cost source) flows to the AWS OTLP receiver with auth.

## Phase 2 — Server-side hardening (daemon code)

1. **Bind address config.** `daemon/runner.py` boots uvicorn on loopback. Add `daemon.bind_host` to `SidecarConfig` (default stays `127.0.0.1`; the AWS deployment sets `0.0.0.0` behind the reverse proxy).
2. **Auth middleware.** FastAPI dependency that checks `Authorization: Bearer` against a token file (`~/.agent-sidecar/tokens.json`) on every `/api` and `/otlp` route except `/health`. Single shared token for v1; per-workspace tokens later. Skippable via config for Tailscale-only deployments.
3. **Audit and fix server-side repo-filesystem assumptions.** This is the biggest correctness gap: the daemon today runs on the same machine as the repo. On AWS, `repo_path` in event metadata is a *label*, not a readable path. Sweep `daemon/api.py`, `intel/refiner.py`, and `intel/wrapper.py` for any `Path(...)` reads of the repo (repo-context collection for refinement, file-tree hints, diff reading). For each:
   - move the collection client-side — the hook gathers a lightweight repo context (changed files from `git status`, file-tree hint, latest test output) and includes it in the `/refine` request body, or
   - degrade gracefully server-side when the path doesn't exist (v1 acceptable).
   The hook script must stay stdlib-only and fast, so keep client-side collection to cheap `git` calls with a strict time cap.
4. **Workspace namespacing (if decided in Phase 0).** Key trace storage (`store/sessions.py`) by workspace ID: `<trace_dir>/<workspace>/<session>.jsonl`, and scope `/sessions` listings and dashboard metrics to the caller's workspace.
5. **Redaction config.** Extend `hooks.payload_max_bytes` sanitization with an optional server-side redaction list (env-var patterns, `.env` file contents, secret-looking strings) applied before events are written to disk, since traces now live off-machine.

## Phase 3 — Continuous guidance loop

Today guidance reaches Claude Code at exactly one moment: `UserPromptSubmit` (refined task contract + budget context injected as `additionalContext`; budget guard can block the prompt). Events from `PreToolUse`/`PostToolUse`/`Stop` flow in and detectors/steering run server-side, but their output only surfaces via CLI `steer` — mid-session, nothing is delivered back. To make guidance continuous:

1. **Server: steer-on-ingest.** In the `/sessions/{id}/events` handler, after appending a `PostToolUse`/`Stop`-derived batch, run `collect_findings`/`steer` (already cheap and deterministic-first) and store the resulting recommendation as *pending* on the session record. Throttle with the existing `max_warnings_per_turn` config so one warning does not repeat on every tool call.
2. **Hook: deliver pending guidance.** In `hook_script.py`, on `PostToolUse` and `Stop` events, read the pending recommendation (either returned directly in the event-post response — preferred, zero extra round trips — or via `GET /sessions/{id}/recommendations?pending=1`) and emit it as `hookSpecificOutput.additionalContext` on `PostToolUse`, so the steering nudge ("you've run this failing test 3 times; try X") lands in Claude's context mid-session. Mark the recommendation delivered so it fires once.
3. **Budget guard stays as is.** It already runs on every hook invocation and blocks at the ceiling — it just now checks against the remote API with the Phase 1 timeout.
4. **Keep D11 semantics.** Steering delivery is context-only; only the budget guard may block, exactly as today.

## Phase 4 — AWS deployment

1. **Containerize.** `Dockerfile` for the sidecar (python:3.11-slim, `pip install .`, `agent-sidecar start --foreground`); `docker-compose.yml` with three services: `sidecar`, `ollama` (official image, GPU reservation), `llama-server` (`ghcr.io/ggml-org/llama.cpp:server-cuda` with the Llama 3 8B GGUF). Volume-mount `/data/agent-sidecar` for traces, config, and the SQLite index.
2. **Provision (Terraform, or manual first pass).**
   - EC2 g6.xlarge (Ubuntu 24.04 + NVIDIA driver, or the AWS Deep Learning base AMI), 100 GB gp3 EBS, Elastic IP.
   - Security group: Option A — no inbound except Tailscale (UDP 41641)/SSH; Option B — 443 only.
   - Caddy on the host (or as a fourth compose service) terminating TLS, routing `/api/*` → `:7433` and `/otlp/*` → `:4318`.
3. **Model warm-up on boot.** systemd unit or compose healthcheck that runs the existing `scripts/start_local_models.sh` logic: pull/verify `sidecar-llama3-reasoning` in Ollama, preflight both role endpoints, and only then mark the sidecar healthy — mirrors the e2e script's preflight so hooks never wait on a cold model.
4. **Ops basics.** Nightly `aws s3 sync` of the trace dir; logrotate on daemon logs; a CloudWatch alarm (or a cron + healthcheck ping) on `/health`; auto-stop schedule for off-hours if single-user.

## Phase 5 — Verification and rollout

1. **Latency measurement first.** From the laptop, time `POST /refine` and `POST /sessions/x/events` against the AWS instance 20×. Confirm p95 event-post fits the new 1.5 s timeout and p95 model-assisted refine fits 5 s; if refine misses, either raise the hook timeout (Claude Code hook config allows 30 s) or fall back to deterministic-only refinement remotely.
2. **Tests.** Existing offline pytest suite must stay green (auth middleware off by default keeps CI offline-clean). Add integration tests: auth rejection, remote-URL hook flow against a daemon bound to a non-loopback address, steer-on-ingest delivery, and repo-context-in-request refinement.
3. **End-to-end parity.** Run `scripts/e2e_claude_code.sh` with `AGENT_SIDECAR_API_URL` pointed at the AWS instance (script needs a small patch to pass the URL through and skip local daemon start). Then one `swebench_lite_token_savings.sh --count 3` run against the remote to confirm the paired-run and grading pipeline is unaffected.
4. **Honest accounting.** Add the amortized instance cost to `cost compare` output (config: `server_cost_usd_per_hour`) so the dashboard's savings claims include what the AWS box costs. Given the last SWE-bench run measured *negative* savings locally, this deployment makes measurement infrastructure better (always-on, shared) but makes the savings bar higher — worth stating explicitly in the rollout notes.

## Suggested milestone order

| # | Milestone | Definition of done |
|---|-----------|--------------------|
| 1 | Phase 0 decisions in `docs/decisions.md` | Topology, instance tier, identity model chosen |
| 2 | Phase 1 items 1–2 + Phase 2 items 1–2 | Laptop hooks talk to a daemon on another machine (LAN or tailnet) with auth; session captured end-to-end |
| 3 | Phase 2 item 3 | `/refine` produces full-quality contracts with repo context supplied by the client |
| 4 | Phase 4 | Same flow works against the EC2 instance with models served remotely |
| 5 | Phase 3 | Mid-session steering context lands in a live Claude Code session |
| 6 | Phase 1 items 3–6, Phase 5 | CLI/replay/telemetry remote-complete; e2e + SWE-bench parity runs pass |

## Key risks

- **Hook-path latency.** Every prompt now pays a WAN round trip. Fail-open timeouts protect the session, but a slow server silently disables guidance — add a `hooks status --probe` command that reports live RTT.
- **Repo-context gap (Phase 2.3).** If missed, remote refinement quietly degrades below the local baseline quality; audit before deploying, not after.
- **Privacy regression.** Traces of everything the user does in Claude Code now live on an AWS box. Redaction + TLS + auth are minimums; say so in the README.
- **Server economics.** A GPU instance can cost more per month than the token savings it produces. The CPU/deterministic tier and auto-stop are the mitigation; the accounting change in Phase 5.4 keeps the metric honest.
