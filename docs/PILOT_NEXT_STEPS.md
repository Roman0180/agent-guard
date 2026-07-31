# Pilot Launch Checklist

Operator working file — fill in the blanks as you go. Infrastructure state as of 2026-07-30:
tailnet live (`100.98.101.5`), Ollama loopback-only behind `tailscale serve`, client kit built
in `dist/pilot/`, remote refine calls verified at ~1.5 s. Audit any time with
`./scripts/pilot_operator_setup.sh --check`.

## Fill in

| Field | Value |
| --- | --- |
| Pilot name | ____________ |
| Pilot GitHub username (Tailscale identity: `<username>@github`) | ____________ |
| Identity string shown on Tailscale Users page after they accept | ____________ |
| Pilot's machine/OS | ____________ |
| Onboarding date | ____________ |
| Pilot hours (when to keep the laptop awake) | ____________ |

Known values (already decided/verified — do not change casually):

- Model endpoint for the pilot: `http://100.98.101.5:11434` (tailnet IP, never the `.ts.net` name — Ollama 403s hostnames)
- Wheel + filled config: `dist/pilot/` (`agent_sidecar-0.1.0-py3-none-any.whl`, `pilot-config.json`)
- Wheel SHA-256: `fb091729e54257d654ab4d6b5436f263af01e6d965a27e67a07039320227fc16`

## Steps, in order

- [ ] **1. Commit the checkpoint.** Everything is uncommitted on `feature/laptop-pilot`. Commit so
      the shipped wheel maps to a known commit when the pilot reports bugs.
- [ ] **1b. Send the intro message.** `dist/pilot/PILOT_INVITE_MESSAGE.md` is a ready-to-edit
      draft: what the pilot is, the data disclosure, what you're asking of them. Their reply
      gives you the GitHub username needed for the ACL in step 2.
- [ ] **2. ACL before invite.** Put the pilot's `<username>@github` into
      `docs/examples/tailscale-acl.hujson`, paste the file at
      https://login.tailscale.com/admin/acls. (Until an ACL exists, invited nodes can reach
      everything on this laptop.)
- [ ] **3. Invite the pilot** from the admin console (or node-share this machine). After they
      accept, verify on the Users page that their identity matches the ACL string exactly;
      fix the ACL if they signed in with a different provider.
      - [ ] Enable **device approval** (Settings → Device management) so any new device —
            including extra devices under the pilot's identity — needs your approval before
            it can touch the tailnet. This is the guard against shared logins.
- [ ] **4. Dry-run on yourself.** Drop `dist/pilot/pilot-config.json` into a test repo, install
      hooks, run a live Claude Code session: confirm a model-assisted task contract appears,
      then quit Ollama and confirm the next prompt silently degrades to deterministic.
- [ ] **5. Onboarding day.**
      - [ ] Run `./scripts/pilot_distribute.sh` and leave it serving — the setup doc has the
            pilot download both the wheel and `pilot-config.json` from it during steps 1–2
      - [ ] Send `dist/pilot/PILOT_SETUP.md` (the only file you send)
      - [ ] Joint smoke test: their `curl http://100.98.101.5:11434/api/tags`;
            `agent-sidecar models list` shows both roles available; one live prompt;
            one fallback drill (quit Ollama, prompt again, restart)
      - [ ] Ctrl-C the wheel server when they're installed
      - [ ] Disclosure said out loud: their prompts transit to this laptop; code and traces stay on theirs
- [ ] **6. During the pilot.** Laptop plugged in + `caffeinate -s` during pilot hours; no 30B
      models loaded while they're active; keep Ollama updated; clear `~/.ollama/logs` weekly.
      After any reboot, re-run `./scripts/pilot_operator_setup.sh` — it restarts the receipt
      proxy and re-verifies the serving chain (tailnet :11434 → proxy :11435 → Ollama).
- [ ] **7. Weekly measurement.** The pilot runs an export command, reviews the output
      (aggregate numbers only), and sends it over; compare model-assisted vs deterministic
      sessions on cost-per-successful-task and steps. Success bar: model-assisted
      non-inferior on quality, better on cost.
      The pilot's weekly command is `agent-sidecar measurement report --json`: per-arm
      (assist vs control) sessions, tokens, measured cost, refinements delivered/suppressed,
      steering recommendations, shadow detections, and current k calibration.
      Cross-check against your receipts: `python3 scripts/receipt_proxy.py --summary` shows
      per-day refinement calls and token counts recorded on YOUR side (the pilot cannot edit
      these). Control sessions must show no refine traffic in your receipts — arm assignment
      is a deterministic hash of the session id, so you can verify any claimed arm yourself.
      Claude-token costs remain pilot-reported only — they never transit your machine.
      - [ ] Every week or two, have the pilot run `agent-sidecar dev calibrate-k` so
            per-event avoided-waste estimates move from seed values to measured medians
            from their own shadow (control) sessions.

## Optional hardening (cheap, anytime)

- [ ] Pin the wheel hash in the install command (`#sha256=<hash>` suffix pip verifies natively)
- [ ] FileVault on; screen lock; OS current (this laptop is now serving infrastructure)
