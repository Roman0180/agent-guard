# Cowork Spend Ingestion Plan

Status: planned, not started. Companion to `LAPTOP_PILOT_PLAN.md` (which stays Claude
Code-only). Written 2026-08-06 against the Cowork docs current at that date.

## Goal and explicit non-goals

**Goal:** Agent Sidecar ingests Claude Cowork token/cost telemetry so an org's Cowork
spend appears in the same cost tracking, measurement reports, and exports as Claude Code
spend — per prompt, per user, per day.

**Non-goals (blocked by Cowork's architecture, do not plan around them):**

- Prompt refinement and steering for Cowork sessions. Hooks do not fire in Cowork
  (anthropics/claude-code#63360, marked not planned as of May 2026) and there is no
  per-session env injection. Cowork support is a *visibility* feature only.
- Assist-vs-control measurement arms for Cowork. Arm assignment needs per-session
  config we cannot set. Cowork sessions are all effectively "observe" arm.
- Individual Pro/Max users. Cowork OTLP export is Team/Enterprise admin-configured only.

## What we know (and the one thing Phase 0 must confirm)

Cowork exports OTLP `api_request` events carrying `input_tokens`, `output_tokens`,
`cost_usd`, `duration_ms`, `model`, and a `prompt.id` that correlates all work from one
user prompt. Endpoint, protocol (`http/json` or `http/protobuf`), and auth headers are
set in Admin settings > Cowork (Claude Desktop ≥ 1.1.4173); metadata-only by default
(`otlpContentCapture` stays off — that is our privacy posture too).

**Unknown until tested:** where events originate — the Anthropic cloud sandbox or the
user's desktop app. This decides everything about deployment:

- Desktop-origin → the receiver can sit on the user's machine (today's model, easy).
- Cloud-origin → the receiver needs a publicly reachable HTTPS endpoint with bearer
  auth (tailscale funnel or cloudflared in front of the daemon's OTLP port), which is
  a new deployment mode and a real security surface.

## Phase 0 — validation spike (no product code)

1. Get access to a Team/Enterprise org with Cowork enabled (we do not currently have
   one — this is the schedule risk; see Risks).
2. Point Admin settings > Cowork OTLP at a sidecar daemon's existing `/v1/logs`
   receiver (`daemon/otlp.py`), via a funnel if cloud-origin.
3. Run a few Cowork sessions; capture raw payloads to disk.
4. Deliverable: a `docs/examples/cowork-otlp-sample.json` corpus plus written answers:
   event body name (is it `claude_code.api_request` or a cowork-specific name?),
   attribute names, session/prompt id semantics, event origin (cloud vs desktop),
   protobuf vs json default.

Exit criteria: we can name every attribute we will parse. If org access can't be had,
build Phase 1 behind an `experimental_cowork` config flag from docs alone and label it
untested.

## Phase 1 — ingestion

- New adapter `src/agent_sidecar/adapters/cowork/otlp_adapter.py`, sibling of the
  `claude_code` one. Source detection in the shared ingest path
  (`daemon/otlp.py::ingest_otlp`) by event body name / resource attributes, routing to
  the right adapter.
- Sessions from telemetry alone: Cowork has no hook lifecycle, so promote the current
  "telemetry-orphans" fallback into a first-class telemetry-created session with
  `source: "cowork"` on the session record (`schema/session.py`, `schema/events.py`).
  Group by Cowork's session id; keep `prompt.id` on each event — it is the per-task
  cost unit.
- Config (`schema/config.py`): `cowork.enabled`, optional `cowork.bearer_token` for
  receiver auth, funnel/hostname settings if Phase 0 says cloud-origin.
- Auth on the receiver: today `/v1/logs` trusts localhost. If anything non-local can
  reach it, require the bearer header Cowork is configured to send.

## Phase 2 — cost model and reporting

- Cost: prefer the event's reported `cost_usd` (same policy as Claude Code ingestion);
  fall back to `intel/cost.py` price map by model. Cowork may report models the price
  map lacks — extend the bundled map as they show up.
- Per-task rollup: group by `prompt.id` → "cost per Cowork task", aligning with the
  cost-per-successful-task framing (no quality gate available — say so in output
  rather than pretending).
- Surface it: per-source (claude_code vs cowork) breakdowns in
  `cli/measurement_cmds.py` report, `cost show`, the JSON/markdown exporters
  (`export/`), and a dashboard tile.
- Receipt parity: decide whether `scripts/receipt_proxy.py`-style independent receipts
  make sense here (they don't — Cowork traffic never transits our machine; the OTLP
  stream *is* the receipt. Document that asymmetry in the report output).

## Phase 3 — org deployment and docs

- The product decision this feature forces: today the sidecar is per-user, per-repo.
  Org-level Cowork telemetry arrives at *one* endpoint for *many* users. Plan for a
  lightweight **collector mode**: one sidecar instance designated as the org receiver,
  storing cowork sessions keyed by user id from resource attributes; per-user
  sidecars unaffected. Do not try to merge collector data back into individual users'
  local stores in v1 — the collector's reports are the deliverable.
- Admin setup guide (`docs/examples/COWORK_ADMIN_SETUP.md`): endpoint URL, headers,
  minimum desktop version, Team/Enterprise requirement, restart-session-to-apply
  caveat, privacy statement (metadata only; content capture off).
- Positioning: this widens the persona story — agent spend spreading beyond
  engineering — and the dashboard shows both surfaces in one place.

## Risks

| Risk | Mitigation |
| --- | --- |
| No Team/Enterprise org to test against | Phase 0 gate; ship behind `experimental_cowork` flag if unavoidable |
| Events originate in Anthropic's cloud → public endpoint needed | Funnel + bearer auth design in Phase 1; if unacceptable, feature is Team-admin-hosted-collector only |
| Schema drift between docs and real payloads | Phase 0 sample corpus is the contract; parser tolerates unknown attributes |
| `cost_usd` is Anthropic's estimate, not a bill | Label as estimated everywhere; never sum with measured Claude Code costs without a source column |
| No hooks ⇒ no upgrade path to optimization | Framed as visibility-only in all docs and pitch material; revisit if #63360 reopens |

## Rough sequencing

Phase 0 is one day once org access exists (access itself is the long pole). Phase 1 is
~2–3 days including tests mirroring `tests/integration/test_measurement_api.py`
patterns. Phase 2 is ~2 days. Phase 3 docs are a day; collector mode is the only
open-ended item and can ship after 1+2 prove ingestion.
