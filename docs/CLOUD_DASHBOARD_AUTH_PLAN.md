# Cloud Dashboard + Google Sign-In — Design (data-minimal)

Status: implementing (slice 1). Written 2026-08-11.

## Goal

Let a pilot user **sign in with their Google (Gmail) account** at a hosted URL and see
**their own savings dashboard**. The local Agent Sidecar stays exactly as it is — a
local-first tool where prompts and code never leave the machine. The cloud tier receives
**only aggregate numbers**, and stores the **least data that still makes the feature work**.

One sentence: the cloud dashboard is an authenticated, per-user view over the same
aggregate measurement report the sidecar already knows how to push — nothing more.

## Non-negotiable: the privacy boundary already exists

`push_measurement_report()` (`src/agent_sidecar/intel/measurement.py`) already sends
aggregates only — token counts, costs, arm totals, intervention counts — and by
construction **never** prompt text, code, or per-event traces. The cloud tier is just a
better, authenticated receiver for that push plus a Google-authed frontend over the result.

## Two independent auth planes

| Plane | Who | Mechanism | Can read/write |
|---|---|---|---|
| **Browser / read** | a person in a browser | Google OAuth via Auth.js, **JWT session** (no server session storage) | reads their own snapshot |
| **Ingest / write** | a headless sidecar process | opaque per-device **Bearer token** | upserts that account's snapshot |

Keeping these separate is what lets a headless background process authenticate its pushes
without ever holding a Google token, and lets "revoke a lost laptop" be a one-row delete
that never touches the Google identity.

## What we store (and, deliberately, what we don't)

**Persisted — exactly two tables:**

```
devices(   token_hash TEXT PRIMARY KEY,   -- sha256(device token); raw token never stored
           sub_hash   TEXT NOT NULL,       -- sha256(google sub); raw Google id never stored
           last_seen_at TIMESTAMPTZ )

snapshots( sub_hash   TEXT PRIMARY KEY,    -- one row PER USER, upserted every push
           data       JSONB NOT NULL,      -- a small fixed set of numeric aggregates
           updated_at TIMESTAMPTZ )
```

**Never stored:**

- Email, name, avatar, or any Google profile field. We key everything off `sub_hash` — a
  one-way hash of Google's stable opaque `sub`. The database cannot be reversed to a Gmail
  address, and we hold no PII.
- OAuth access/refresh tokens (JWT session strategy → Google tokens live only in the
  encrypted session cookie in the user's browser, never in our DB).
- Login sessions (JWT strategy → **no** `sessions` table).
- Pairing/claim codes (they are **stateless signed tokens** — see below — so there is
  nothing to store or expire server-side).
- Prompt text, code, per-session traces, per-prompt rows, k-values, IP logs, or push
  history. The snapshot is **latest-only**: each push upserts the single row, so we keep
  the current numbers, not a time series.

**Snapshot `data`** is a strict numeric allowlist (`app/(cloud)/lib/snapshot.ts`). The
ingest endpoint reduces any incoming report to these keys and drops everything else, so a
future client bug cannot cause prompt text to be persisted:

```
tokensUsed, avoidedTokens, measuredCostUsd, apiEquivalentUsd,
savingsUsd, savingsPercent, planMultiplier, effectivePlanValueUsd,
avoidedTokensPlanPercent, planMonthlyUsd, planAssumed,
sessions, refinementsDelivered, steeringRecommendations, shadowDetections,
generatedAt
```

## Flows

**Sign in.** Google → Auth.js issues a JWT session carrying `sub`. No DB write.

**Link a device (pairing).**
1. Signed-in dashboard mints a **claim token**: `base64url(payload).hmac`, where payload =
   `{sub_hash, exp}` signed with `CLOUD_TOKEN_SECRET`. Short TTL (10 min). **Not stored.**
2. User runs `agent-sidecar link --code <claim token>` (copy-paste).
3. Sidecar POSTs the claim token to `/api/link/claim`. Server verifies the HMAC + expiry,
   extracts `sub_hash`, generates a random device token, stores
   `sha256(token) → sub_hash`, and returns `{ ingest_url, device_token }`.
4. Sidecar writes `{ ingest_url, device_token }` to `~/.agent-sidecar/credentials.json`
   (mode 0600) and starts sending pushes there.

**Push (on session stop).** Sidecar POSTs the sanitized snapshot to `/api/ingest` with
`Authorization: Bearer <device token>`. Server hashes the token, looks up `sub_hash`,
upserts the snapshot, bumps `last_seen_at`. No browser auth involved.

**View.** Dashboard `auth()` → `sub_hash` → read the one snapshot row → render savings with
the existing card components. No time series to render; latest numbers only.

## Components

- **Sidecar (Python, this repo):** `agent_sidecar/cloud/credentials.py` (0600 credential
  store), `agent-sidecar link` / `link --status` / `unlink` CLI, and a credential-aware
  push (Bearer + credential ingest URL; falls back to the existing unauthenticated
  `report_push_url` operator path when no credentials are present — non-breaking).
- **Cloud pure logic (TS, dependency-free, unit-tested):** `lib/tokens.ts` (HMAC claim
  sign/verify, device-token mint, sha256, constant-time compare — all `node:crypto`),
  `lib/snapshot.ts` (the allowlist sanitizer), `lib/store.ts` (`CloudStore` interface +
  in-memory impl for tests + a thin Postgres impl for prod).
- **Cloud edges (Next.js):** `auth.ts` (Auth.js v5, Google provider, JWT session, `sub` in
  the token), `/api/auth/[...nextauth]`, `/api/link/claim`, `/api/ingest`, `/cloud`
  (dashboard), `/cloud/link` (shows the claim token + CLI instructions).

## Deploy-time inputs (not needed to run the tests)

`AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` (Google OAuth client),
`CLOUD_TOKEN_SECRET` (HMAC key for claim/device tokens), `DATABASE_URL` (Postgres —
Neon/Supabase), and a `pg` driver at the ingest/claim edges. The Postgres store is a thin
adapter; all logic is validated against the in-memory store.

## Explicitly out of scope for slice 1 (documented follow-ups)

- Per-prompt **avoided-tokens / dollar-savings** enrichment in the push. Slice 1 sends the
  `measurement_report` totals (tokens, cost, intervention counts); the richer avoided-tokens
  figure lives in the daemon's per-prompt row logic and needs a small extraction before it
  can be pushed. The snapshot allowlist already includes those keys so no cloud change is
  needed when we add them.
- Time-series history (deliberately omitted — latest-only is the data-minimal choice).
- Multiple accounts per device / team roll-ups.
