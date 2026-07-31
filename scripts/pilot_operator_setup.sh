#!/usr/bin/env bash
# Hardened operator setup for the laptop pilot (docs/LAPTOP_PILOT_PLAN.md Phase 1).
#
# Security model: Ollama stays bound to 127.0.0.1 (never 0.0.0.0, never the LAN).
# `tailscale serve` proxies tailnet TCP :11434 -> localhost:11434, so the model
# endpoint is reachable from the tailnet only, and only for nodes the ACL allows
# (docs/examples/tailscale-acl.hujson).
#
# Usage:
#   ./scripts/pilot_operator_setup.sh          # configure + verify
#   ./scripts/pilot_operator_setup.sh --check  # verify only, change nothing
set -euo pipefail

CHECK_ONLY=0
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=1

fail=0
say() { printf '%s\n' "$*"; }
ok()  { say "  [ok] $*"; }
bad() { say "  [!!] $*"; fail=1; }

ts_cli() {
  local candidate
  for candidate in tailscale /Applications/Tailscale.app/Contents/MacOS/Tailscale; do
    if command -v "$candidate" >/dev/null 2>&1 || [[ -x "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

say "== Tailscale =="
if ! TS="$(ts_cli)"; then
  bad "Tailscale is not installed. Install it (https://tailscale.com/download), sign in, then re-run."
  exit 1
fi
if ! TS_IP="$("$TS" ip -4 2>/dev/null | head -1)" || [[ -z "$TS_IP" ]]; then
  bad "Tailscale is installed but not connected. Run: $TS up"
  exit 1
fi
TS_NAME="$("$TS" status --json 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))' 2>/dev/null || echo "$TS_IP")"
ok "connected as $TS_NAME ($TS_IP)"

say
say "== Ollama binding (must stay loopback-only) =="
if curl -s -m 2 "http://127.0.0.1:11434/api/tags" >/dev/null; then
  ok "Ollama answers on 127.0.0.1:11434"
else
  bad "Ollama is not running on 127.0.0.1:11434 — start Ollama first."
fi
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
if [[ -n "$LAN_IP" ]] && curl -s -m 2 "http://$LAN_IP:11434/api/tags" >/dev/null; then
  bad "Ollama is exposed on the LAN ($LAN_IP:11434). Unset OLLAMA_HOST (launchctl unsetenv OLLAMA_HOST), restart Ollama, re-run. Do NOT use OLLAMA_HOST=0.0.0.0."
else
  ok "Ollama is not reachable on the LAN interface"
fi

say
say "== Model residency (avoid cold starts for the pilot) =="
if [[ "$(launchctl getenv OLLAMA_KEEP_ALIVE 2>/dev/null)" == "-1" ]]; then
  ok "OLLAMA_KEEP_ALIVE=-1 already set"
elif [[ "$CHECK_ONLY" -eq 1 ]]; then
  bad "OLLAMA_KEEP_ALIVE is not -1 (would set it; restart Ollama afterwards)"
else
  launchctl setenv OLLAMA_KEEP_ALIVE -1
  ok "set OLLAMA_KEEP_ALIVE=-1 (quit and reopen the Ollama app to pick it up)"
fi

say
say "== tailscale serve: tailnet :11434 -> localhost:11434 =="
if "$TS" serve status 2>/dev/null | grep -q "11434"; then
  ok "serve rule for 11434 already present"
elif [[ "$CHECK_ONLY" -eq 1 ]]; then
  bad "no serve rule for 11434 (would run: $TS serve --bg --tcp=11434 tcp://localhost:11434)"
else
  "$TS" serve --bg --tcp=11434 tcp://localhost:11434
  ok "serve rule added"
fi

say
say "== Verify the tailnet path =="
if curl -s -m 3 "http://$TS_IP:11434/api/tags" >/dev/null; then
  ok "Ollama reachable via tailnet at http://$TS_NAME:11434"
else
  bad "Ollama is NOT reachable via the tailnet address. Check '$TS serve status'."
fi

say
say "== Remaining manual steps (cannot be automated from this machine) =="
say "  1. ACL: paste docs/examples/tailscale-acl.hujson into the Tailscale admin console"
say "     (https://login.tailscale.com/admin/acls) after filling in the pilot's Tailscale"
say "     identity (GitHub sign-in: username@github; other providers: their email)."
say "     This restricts the pilot to ports 11434/8000 on this machine only."
say "  2. Invite the pilot (or use node sharing) from the admin console."
say "  3. Client endpoint for pilot-config.json: http://$TS_IP:11434"
say "     (use the tailnet IP, not the DNS name: Ollama's DNS-rebinding protection"
say "     returns 403 for hostnames it does not recognize, but accepts IPs)"

exit "$fail"
