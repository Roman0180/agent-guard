# Capacity Value Plan — showing savings for Pro/Max subscribers

Status: planned, not started. Written 2026-08-09. Reframes how the pilot dashboard and
pitch present value for customers on flat-rate Claude plans (Pro $20, Max $100/$200).

## The insight this plan encodes

Pilot customers do not pay per token — they pay a flat monthly fee and run into **usage
limits**: the 5-hour rolling window and the weekly cap. Nobody on a Max plan cares that a
session "cost $2.43 instead of $3.10"; they care that they hit their limit Thursday and
lost Friday. Dollars measure the wrong scarcity. The scarce resource is **plan capacity**,
and the sidecar's value is stretching it: fewer wasted tokens per task means more tasks
before the window closes.

One sentence for the pitch: **"We make your $100 plan feel like a $200 plan — the waste we
prevent becomes extra work your plan can do."**

## What changes conceptually (nothing changes in how we measure)

All existing machinery stays: per-request telemetry, per-prompt attribution, k-estimated
avoided waste, assist-vs-control arms. Only the **denomination** changes: tokens (and
plan-capacity share) become primary; dollars become a derived, secondary framing.

Honesty rules carry over unchanged: per-event figures are estimates, the arm comparison
is the measurement, and we never claim "proven" without arm data. "Feels like $200" is a
framing of the same estimate, not a new number.

## The three surfaced numbers, in priority order

1. **Effective plan multiplier** (the headline).
   `multiplier = estimated default tokens ÷ measured actual tokens` over the period —
   same k-based estimate as today, denominated in tokens. Displayed as:
   "Your plan is doing **1.31×** the work" and, directly derived, "your $100/mo plan is
   delivering an estimated **$131/mo** of plan value." When no waste was caught, the
   multiplier is honestly 1.0×.

2. **Capacity headroom** (the felt benefit).
   Avoided tokens expressed as work units, not dollars: "≈ 3 extra coding tasks this week"
   (avoided tokens ÷ median tokens-per-completed-task, both computed from the user's own
   sessions). This is the number that maps to "I didn't hit my limit on Thursday."

3. **API-equivalent value delivered** (the anchor).
   Claude Code's telemetry prices usage at API rates even on subscription plans, so we can
   truthfully show: "your plan delivered $412 of API-equivalent work this month." This
   anchors what the flat fee is worth and makes the multiplier concrete without claiming
   cash savings.

## Phase 0 — investigate limit signals (gate for the headroom feature)

Unknowns to resolve before building capacity headroom against *actual* limits:

- Does Claude Code expose rate-limit/usage-window state anywhere the sidecar can read
  (OTLP attributes, `/status` output, local state files)? If yes, headroom can be shown
  against the real window ("~2h of heavy use left; sidecar bought you ~25 min of that").
- If no signal exists, fall back to relative framing only (tokens avoided ÷ median task
  tokens) — still useful, no fabricated limits. Do not hardcode guessed plan quotas;
  Anthropic changes them and being wrong here poisons trust.

Deliverable: a short findings note in this doc; pick framing A (real window) or B
(relative only).

## Phase 1 — dashboard reframe (token-first)

- `/api/dashboard/pilot` payload: add token totals alongside every cost figure that
  exists today (per prompt row, totals, history). Most are already computed inside
  `_measured_from_api_requests` — surface `tokensInput/tokensOutput/tokensAvoided`.
- Headline cards become: **Plan multiplier** (est.), **Tokens used / tokens avoided**,
  **API-equivalent value**, Prompts, Interventions. Dollar savings cards demote into the
  cost-movement panel.
- Per-prompt rows: tokens primary, `$` secondary. History table: tokens/day plus
  multiplier/day.
- Copy sweep: "savings" → "capacity" language everywhere on the pilot dashboard. The
  assist-vs-control table now compares **tokens per completed prompt** across arms — the
  same measured comparison, in the currency subscribers experience.

## Phase 2 — billing-mode detection (verified feasible) + plan context

**Finding (verified 2026-08-09 on the operator machine):** Claude Code's local state at
`~/.claude.json` → `oauthAccount` carries machine-readable billing metadata:

- `billingType`: `'stripe_subscription'` on a plan account (expect a different value —
  API/credits — for console-key users)
- `organizationType`: `'claude_max'` (plan family)
- `organizationRateLimitTier`: `'default_claude_max_20x'` (the exact tier — 20x = $200
  Max; 5x = $100 Max; pro = $20)
- `hasExtraUsageEnabled`: `true` — plan users can ALSO have pay-per-use overage enabled,
  so the two modes are not mutually exclusive (see hybrid note below)

**Detection ladder** (first match wins):

1. Explicit override in `pilot-config.json`: `billing: {mode: "credits" | "plan", ...}`
   — always respected; set at onboarding if detection ever misfires.
2. Auto-detect from `~/.claude.json` `oauthAccount.billingType` +
   `organizationRateLimitTier` (read-only, local, no credentials touched). Subscription →
   capacity mode with tier-derived plan price; API/credit billingType or an
   `ANTHROPIC_API_KEY`/`apiKeyHelper` setup with no oauth account → dollars mode.
3. Unknown/absent → dollars mode (the conservative default: dollars are always true,
   capacity framing is only *better* when the plan is confirmed).

Detection runs in the sidecar (daemon or hooks installer) at session start, and the
resulting `billing_mode` (+ tier when known) rides the config/session record into the
dashboard payload, which switches its primary denomination accordingly:

- **credits** → today's dashboard: dollars primary, tokens secondary.
- **plan** → Phase 1 capacity view: multiplier/tokens primary, API-equivalent dollars as
  the anchor, tier-derived plan price powering "$100 → feels like $131" automatically
  (no onboarding question needed when the tier is readable).

**Hybrid caveat:** `hasExtraUsageEnabled: true` means a plan user can spill into
pay-per-use overage. When detected, show capacity as primary AND keep the dollar figure
for overage-window usage — "you stayed inside plan limits" vs "overage you avoided" is
actually the sharpest version of the whole pitch.

**Risks:** `~/.claude.json` is an undocumented internal file — schema can change with any
Claude Code release. Treat every read as optional (missing key → rung 3 fallback), never
crash on it, and cover with a fixture test per known shape. Never read or store tokens,
keys, or `emailAddress` from that file — only the four billing fields above.

## Phase 3 — pitch and docs alignment

- PILOT_DESIGN_OVERVIEW / PILOT_SETUP: reword the savings sections to capacity language;
  the measurement design section is unchanged (arms still decide whether the help helps).
- Operator report (the automatic push) already carries per-arm token totals — the weekly
  comparison naturally becomes tokens-per-task across arms. No payload change needed.
- Elevator pitch variant: "Agent Sidecar helps engineers on Claude Pro/Max plans stop
  burning their usage limits on wasted agent loops, enabling them to fit more real work
  into the plan they already pay for."

## What NOT to do

- Don't show a dollars-saved headline to subscription users — it implies a refund that
  will never appear on any bill and invites "where's my money" skepticism.
- Don't estimate or display Anthropic's actual quota numbers unless Phase 0 finds a real
  signal. "You have 34% of your window left" must come from ground truth or not at all.
- Don't drop the arm comparison — "feels like a $200 plan" is marketing denomination;
  the control group in tokens is still the only proof, and keeping it visible is what
  separates this from every vendor hand-wave in the category.

## Sequencing and effort

Phase 1 is ~1-2 days (payload fields + dashboard reframe + copy). Phase 2 is hours.
Phase 0 is a half-day investigation that can run first or in parallel; Phase 3 is a
docs pass before the next pilot onboarding. Ship 1+2 together so the multiplier headline
lands with plan context.
