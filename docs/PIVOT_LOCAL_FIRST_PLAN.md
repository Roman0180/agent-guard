# Pivot Plan: Local-First Open-Core Agent Sidecar

Status: proposed. Written 2026-08-19. Supersedes the hosted-daemon direction in
`REMOTE_SIDECAR_PLAN.md` (see "What this changes" below).

## Thesis

Agent Sidecar is a **local-first developer tool** (like a linter or language server), not a
hosted service. The engine — hooks, refinement, steering, budget guard, trace capture —
runs on the customer's machine next to their repo. The **paid product** is the things a
copied binary cannot provide: hosted model intelligence (metered), the authenticated team
dashboard over aggregate measurement, and the proof it saves money. Prompts and code stay
local by default; only aggregates ever leave.

One sentence: **free local engine as the funnel; hosted intelligence + aggregate dashboard
as the paid tier, gated by a server-verified entitlement.**

## Why (the reasoning this encodes)

- The engine is latency-critical (5 s hook budget), privacy-sensitive (raw prompts/diffs),
  and **repo-local** (must read the actual files). All three say "run next to the repo."
  Hosting the daemon on AWS fought this — most visibly in the repo-context gap where the
  daemon reads `AGENT_SIDECAR_REPO_PATH` server-side and the repo isn't there.
- "Runs locally" is not "source is public." We already ship a compiled wheel, not the repo
  (`scripts/pilot_distribute.sh`: ~74 KB, no recipes, no docs). The moat was never the code.
- For a B2B dev tool the defensible assets are hosted intelligence, the org-level aggregate
  view no single machine has, and measured proof — none stealable by copying a binary.

## What this changes vs. `REMOTE_SIDECAR_PLAN.md`

- **Drop** the always-on GPU EC2 box, the public-HTTPS multi-tenant daemon, and the
  server-side repo-context rework (Phase 2.3 there). Those are shelved, not deleted — they
  remain the answer for a future managed/enterprise offering (see Phase 5).
- **Keep** the daemon local (where v3 already runs it). Reverse none of D13/A3.
- **Redirect** the "remote" energy into the model-location dial and the entitlement gate.

## What already exists (reuse, do not rebuild)

| Capability | Where | Role in the pivot |
|---|---|---|
| Aggregate-only push (no prompt/code) | `push_measurement_report()` in `intel/measurement.py`; `measurement.report_push_url` config | The privacy boundary; the paid dashboard's data source |
| Cloud link: device token (write) + Google OAuth (read) | `cloud/credentials.py`, `cli/cloud_cmds.py` (`link`), `docs/CLOUD_DASHBOARD_AUTH_PLAN.md` | The entitlement/identity spine of the paid tier |
| Value framing (plan multiplier) | `docs/CAPACITY_VALUE_PLAN.md` | The paid dashboard's headline metric |
| Remote model seams (allowlist/endpoints/`remote_fallback`) | `models/router.py`, `schema/config.py` | Points the model role at a hosted API |
| Deterministic fallback everywhere | `intel/refiner_fallback.py` and callers | The free tier + the outage floor |
| Wheel-only distribution | `scripts/pilot_distribute.sh` | Ships the engine without the source/IP |

## The free / paid line

- **Free (local engine, the funnel):** hooks, deterministic refinement + steering, budget
  guard, on-disk traces, single-user CLI (`session`/`trace`/`cost`/`replay`). Fully usable
  offline. A copied binary gets exactly this — which is fine, it *is* the give-away.
- **Paid (requires our servers, gated by entitlement):**
  1. **Hosted model intelligence (metered).** Model-assisted refine/steer via a hosted API
     we run; billed per-call (resell inference + margin). Unreachable without an account.
  2. **Team dashboard + org cost/capacity accounting.** Authenticated per-user/org view over
     the aggregate report; the cross-user rollup no single machine has.
  3. **Enterprise wrap (later):** SSO, managed/on-prem hosting, support SLA, compliance.

## The model-location dial (the one real decision)

Recommended default: **hosted model API** (Bedrock / Anthropic Haiku / DeepSeek / Groq)
wired through the existing `models.endpoints` + `allowlist`. Rationale: zero customer
setup, pay-per-call (no idle GPU), fast, and it *is* the metered paid feature — a stolen
client cannot call it without a key. Offer **local Ollama** as a privacy/offline option for
customers who won't send prompt text to a vendor (proven at ~1.5 s in the pilot). The
deterministic fallback stays the floor under both. Retire self-hosted always-on GPU as the
default; keep the tuning recipes as proprietary IP for the hosted models.

## Workstreams

### A. Entitlement gate (turn the existing link flow into the paywall)
1. Extend the device-token claim so the server returns an **entitlement** (tier + expiry),
   cached alongside `cloud/credentials.py`. Free tier = no/invalid entitlement.
2. Gate the paid model role and dashboard push on a valid entitlement; on absence, silently
   fall back to deterministic (no broken sessions — keep D11).
3. `agent-sidecar link status` reports tier + expiry.

### B. Hosted model intelligence (metered)
1. Add a hosted-API endpoint preset to `models.endpoints` (start with one provider) and a
   pinned `allowlist` entry; route the reasoning/coding roles there when entitled.
2. Per-call metering: emit a usage record on each hosted model call (aggregate only — model,
   tokens, latency; no prompt text) to the ingest URL. Reuse the receipt-proxy shape.
3. Keep `models.max_tokens` / `timeout_ms` tuned so hosted calls fit the 5 s hook budget.

### C. Paid dashboard (finish the slice already in flight)
1. Complete `CLOUD_DASHBOARD_AUTH_PLAN.md` slice 1 (Google sign-in, per-user snapshot).
2. Surface the `CAPACITY_VALUE_PLAN` plan-multiplier as the headline; add org rollup for
   team accounts.
3. Entitlement-aware: free accounts see their own single-machine view; paid see team/org.

### D. Packaging & install (local-first, low friction)
1. Harden the wheel install into a one-command setup (`pipx install` + `hooks install` +
   `link`), OS-checked, no repo needed. Extend `pilot_distribute.sh` into a real release.
2. Document the free-tier quickstart (works with zero account) and the upgrade path (`link`).

### E. Prove the value (gates everything — see Risks)
1. Get `swebench_lite_token_savings.sh` to a **positive, repeatable** savings number with the
   hosted model in the refine/steer role, denominated in plan capacity per CAPACITY_VALUE_PLAN.
2. Publish the arm-comparison methodology; never claim "proven" without arm data.

## Sequencing

| # | Milestone | Definition of done |
|---|---|---|
| 1 | Decision + doc | This plan accepted; `REMOTE_SIDECAR_PLAN` marked superseded-for-now in `decisions.md` |
| 2 | E (value proof) | One hosted model in refine/steer yields positive, repeatable SWE-bench savings |
| 3 | A + B | Entitlement gates the hosted model role; metered usage records flow to ingest |
| 4 | C | Google-authed dashboard shows the plan multiplier per user; org rollup for teams |
| 5 | D | One-command install of the free engine; `link` upgrades to paid |
| 6 | Enterprise (deferred) | Managed hosting / SSO — reopen `REMOTE_SIDECAR_PLAN` only if demand is real |

## Risks

- **Value first, not piracy.** The last SWE-bench run measured *negative* savings. If the
  paid intelligence does not beat the free deterministic tier, nothing else matters. Milestone 2
  gates the rest — do not build the paywall around a feature that is not yet worth paying for.
- **Latency of hosted calls on the 5 s critical path.** Measure p95 per provider; fall back to
  deterministic (already the default) when a call misses. Never let it break a session.
- **Privacy story of the hosted model.** Hosted API means prompt text reaches a vendor. Make it
  explicit, offer the local-Ollama tier for customers who refuse, and prefer vendors with
  no-retention/BAA terms. The aggregate dashboard boundary is unchanged and already clean.
- **Free/paid line drift.** Keep the free tier genuinely useful (deterministic mode) so the
  funnel works; resist moving must-have engine features behind the paywall.

