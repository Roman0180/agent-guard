# Agent Sidecar Pilot Setup

One-time setup takes about ten minutes. You need macOS or Linux, and Claude Code already installed.

Values your operator gives you:
- `<OPERATOR-TAILSCALE-IP>` — the tailnet IP of the operator's machine (looks like `100.x.y.z`)
- `<WHEEL-URL>` — the install URL, e.g. `http://<OPERATOR-TAILSCALE-IP>:8000/agent_sidecar-0.1.0-py3-none-any.whl`
- a Tailscale invite
- `pilot-config.json` — a config file with the operator's address already filled in

## 1. Join the tailnet

Install Tailscale (https://tailscale.com/download), sign in via the invite, then verify you can reach the operator:

```bash
curl http://<OPERATOR-TAILSCALE-IP>:11434/api/tags
```

You should see a JSON list of models. If this fails, stop here and tell the operator.

## 2. Install Agent Sidecar

Requires Python 3.11+ (`brew install python@3.12` if needed):

```bash
python3 -m venv ~/agent-sidecar
~/agent-sidecar/bin/pip install <WHEEL-URL>
echo 'export PATH="$HOME/agent-sidecar/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
agent-sidecar --version
```

## 3. Set up each project you'll use it in

From the repo root:

```bash
mkdir -p .agent-sidecar
cp /path/to/pilot-config.json .agent-sidecar/config.json
agent-sidecar start
agent-sidecar hooks install
agent-sidecar models list     # both roles should show available: true
```

Then start Claude Code with cost telemetry enabled:

```bash
eval "$(agent-sidecar telemetry print-env)"
claude
```

Use Claude Code exactly as you normally would. That's the whole point.

## What to expect

- After you submit a prompt there is a short pause (a few seconds) while the sidecar refines it. The refined task contract is added to Claude's context automatically.
- When the operator's machine is unreachable (asleep, offline), everything keeps working — refinement just falls back to a local deterministic mode. You may notice the pause disappears. No action needed.
- Your code and session traces stay on your machine. Your prompts (the text you type) are sent to the operator's machine for refinement.

## If something breaks

- `agent-sidecar status` — is the local daemon up?
- `agent-sidecar models list` — do the roles resolve and show available?
- `curl http://<OPERATOR-TAILSCALE-IP>:11434/api/tags` — is the operator reachable?
- Worst case: `agent-sidecar hooks uninstall` returns Claude Code to completely stock behavior.

## Updating

When the operator ships a new version:

```bash
~/agent-sidecar/bin/pip install --force-reinstall <NEW-WHEEL-URL>
```

Then re-run `agent-sidecar hooks install` in each project if the operator says the hook command changed.
