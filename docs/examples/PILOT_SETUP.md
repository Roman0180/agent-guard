# Agent Sidecar Pilot Setup

One-time setup takes about ten minutes. You need macOS or Linux, and Claude Code already installed.

Along with this document, your operator sends you exactly one thing: a Tailscale invite.
Everything else (the software and its config file) downloads from the operator's machine in
the steps below. All addresses are already filled in — copy-paste as-is. Do steps 1 and 2 in
one sitting while your operator's download server is up; after that, nothing else needs it.

## 1. Join the tailnet

Install Tailscale (https://tailscale.com/download), sign in via the invite, then verify you can reach the operator:

```bash
curl http://100.98.101.5:11434/api/tags
```

You should see a JSON list of models. If this fails, stop here and tell the operator.

## 2. Install Agent Sidecar

Requires Python 3.11+ (`brew install python@3.12` if needed):

```bash
python3 -m venv ~/agent-sidecar
~/agent-sidecar/bin/pip install http://100.98.101.5:8000/agent_sidecar-0.1.0-py3-none-any.whl
curl -o ~/agent-sidecar/pilot-config.json http://100.98.101.5:8000/pilot-config.json
echo 'export PATH="$HOME/agent-sidecar/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
agent-sidecar --version
```

This also saves the config file to `~/agent-sidecar/pilot-config.json` — you'll copy it into
each project in the next step, with no further downloads needed.

## 3. Set up each project you'll use it in

From the repo root:

```bash
mkdir -p .agent-sidecar
cp ~/agent-sidecar/pilot-config.json .agent-sidecar/config.json
agent-sidecar start
agent-sidecar hooks install
agent-sidecar models list     # both roles should show available: true
```

No separate terminal is needed: `agent-sidecar start` launches a background process and
returns immediately, so you keep working in the same terminal. It keeps running quietly in the background; after a reboot, just
run `agent-sidecar start` again from the project (running it twice is harmless — it notices
an existing daemon and does nothing).

Then start Claude Code with cost telemetry enabled:

```bash
eval "$(agent-sidecar telemetry print-env)"
claude
```

Use Claude Code exactly as you normally would. That's the whole point.

## What stays on your machine, and what leaves it

```text
 YOUR MACHINE                                      OPERATOR'S MACHINE
┌────────────────────────────────────┐            ┌──────────────────────────┐
│  Claude Code (unchanged)           │            │                          │
│  Agent Sidecar (background)        │  prompt    │   refinement model       │
│                                    │  text ───► │                          │
│  stays here, never sent            │            │   sends back: a refined  │
│  automatically:                    │ ◄── task   │   "task contract" (text) │
│   • your code and files            │  contract  │                          │
│   • your session traces            │            │                          │
│   • everything Claude does         │            │                          │
└────────────────────────────────────┘            └──────────────────────────┘
         └── private encrypted tunnel (Tailscale) — not on the public internet ──┘
```

Two kinds of data leave your machine automatically, both over the encrypted tailnet: the
prompt text you type into Claude Code, sent to the operator's machine for refinement; and,
when a session ends, an aggregate usage summary — token counts, costs, and session tallies
per measurement arm; no code, no prompts, no file names. Your code, files, session traces,
and everything Claude Code reads or writes stay local. If the operator's machine is
unreachable, nothing is sent at all and refinement runs in local deterministic mode.

You can see exactly what the automatic summary contains, any time, by running
`agent-sidecar measurement report --json` — the push is that payload and nothing more.
That aggregate comparison is the data the pilot exists to collect.

One more thing to know: to measure honestly, a random ~30% of sessions run in "control mode"
where the sidecar only observes and does not assist (no refinement pause, no steering).
You won't be told which sessions are which, and everything else works normally — comparing
the two groups is how real savings get measured instead of guessed.

For transparency: the operator's machine keeps its own receipt log of the refinement requests
it serves — timestamps, sizes, and token counts, not your prompt text (only a hash of it).
This is how your pushed summaries are cross-checked, in both directions.

## What to expect

- After you submit a prompt there is a short pause (a few seconds) while the sidecar refines it. The refined task contract is added to Claude's context automatically.
- When the operator's machine is unreachable (asleep, offline), everything keeps working — refinement just falls back to a local deterministic mode. You may notice the pause disappears. No action needed.
- Your code and session traces stay on your machine. Your prompts (the text you type) are sent to the operator's machine for refinement.

## If something breaks

- `agent-sidecar status` — is the local daemon up?
- `agent-sidecar models list` — do the roles resolve and show available?
- `curl http://100.98.101.5:11434/api/tags` — is the operator reachable?
- Worst case: `agent-sidecar hooks uninstall` returns Claude Code to completely stock behavior.

## Updating

When the operator tells you a new version is up (same URL unless they say otherwise):

```bash
~/agent-sidecar/bin/pip install --force-reinstall --no-cache-dir http://100.98.101.5:8000/agent_sidecar-0.1.0-py3-none-any.whl
```

If the version number changed, the operator sends the new filename to use instead. Then re-run
`agent-sidecar hooks install` in each project if the operator says the hook command changed.
