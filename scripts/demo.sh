#!/usr/bin/env bash
#
# Agent Sidecar — investor demo, one command.
#
#   scripts/demo.sh            # start daemon, seed realistic sessions, open dashboard
#   scripts/demo.sh --e2e      # additionally run the real baseline-vs-sidecar e2e first
#   scripts/demo.sh --stop     # stop the demo daemon + dashboard
#
# Everything runs in an isolated workspace under .agent-sidecar/ (gitignored), so it
# never touches your real sessions. Deck: docs/AgentSidecar_Investor_Demo.pptx
# (regenerate with scripts/build_demo_deck.py).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="$REPO/.venv/bin/python"
WS="$REPO/.agent-sidecar/demo"
API_PORT="${AGENT_SIDECAR_DEMO_API_PORT:-7455}"
# Own OTLP port so the demo daemon never collides with the machine's real sidecar
# daemon (which holds the default 4318).
OTLP_PORT="${AGENT_SIDECAR_DEMO_OTLP_PORT:-4788}"
DASH_PORT="${AGENT_SIDECAR_DEMO_DASH_PORT:-4757}"
API_URL="http://127.0.0.1:$API_PORT"
PIDS="$WS/demo.pids"
DASH_LOG="$WS/dashboard.log"

# Run the CLI and seeder from current source (the installed copy can lag behind).
export PYTHONPATH="$REPO/src${PYTHONPATH:+:$PYTHONPATH}"
as() { "$PY" -c "from agent_sidecar.cli.main import app; app()" "$@"; }
open_url() { command -v open >/dev/null && open "$1" || command -v xdg-open >/dev/null && xdg-open "$1" || echo "Open $1"; }

stop_demo() {
  echo "Stopping demo…"
  if [[ -f "$PIDS" ]]; then while read -r pid; do kill "$pid" 2>/dev/null || true; done < "$PIDS"; rm -f "$PIDS"; fi
  local state="$WS/.agent-sidecar/daemon.json"
  [[ -f "$state" ]] && kill "$("$PY" -c "import json,sys;print(json.load(open('$state')).get('pid',''))" 2>/dev/null)" 2>/dev/null || true
  echo "Stopped."
}

if [[ "${1:-}" == "--stop" ]]; then stop_demo; exit 0; fi

echo "== Agent Sidecar demo =="
mkdir -p "$WS/.agent-sidecar"
# Isolated config with a control arm so the assist-vs-control comparison has both sides.
"$PY" - "$WS" <<'PY'
import sys
from pathlib import Path
from agent_sidecar.schema.config import SidecarConfig, config_path
config = SidecarConfig()
config.measurement.control_fraction = 0.34
path = config_path(Path(sys.argv[1]))
path.write_text(config.model_dump_json(indent=2) + "\n", encoding="utf-8")
print(f"config: {path}")
PY

echo "== Starting daemon on $API_URL =="
( cd "$WS" && as start --api-port "$API_PORT" --otlp-port "$OTLP_PORT" >/dev/null )
for _ in $(seq 1 40); do
  curl -s -o /dev/null "$API_URL/health" && break || sleep 0.25
done

if [[ "${1:-}" == "--e2e" ]]; then
  echo "== Running the real baseline-vs-sidecar e2e (this is the 'it's real' proof) =="
  "$REPO/scripts/e2e_claude_code.sh" || echo "(e2e needs Claude Code + local models; continuing to the seeded dashboard.)"
fi

echo "== Resetting + seeding demo sessions =="
curl -s -X POST "$API_URL/api/dashboard/pilot/reset" >/dev/null || true
"$PY" "$REPO/scripts/demo_seed.py" --api-url "$API_URL" --control-fraction 0.34

echo "== Starting dashboard =="
: > "$DASH_LOG"
(
  cd "$REPO/apps/dashboard"
  NEXT_PUBLIC_AGENT_SIDECAR_DAEMON_URL="$API_URL" AGENT_SIDECAR_DASHBOARD_PORT="$DASH_PORT" \
    npm run dev:dashboard > "$DASH_LOG" 2>&1 &
  echo $! > "$PIDS"
)
DASH_URL=""
for _ in $(seq 1 80); do
  DASH_URL="$(grep -oE 'http://(127\.0\.0\.1|localhost):[0-9]+/dashboard' "$DASH_LOG" | head -1 || true)"
  [[ -n "$DASH_URL" ]] && break || sleep 0.5
done
DASH_URL="${DASH_URL:-http://127.0.0.1:$DASH_PORT/dashboard}"
open_url "$DASH_URL"

cat <<EOF

== Demo ready ==
Dashboard:  $DASH_URL
Daemon:     $API_URL   (isolated workspace: $WS)

Three acts (deck: docs/AgentSidecar_Investor_Demo.pptx):
  1. Architecture — walk the deck (slides 2-5).
  2. Dashboard   — the tab that just opened: plan multiplier, tokens saved, assist-vs-control.
  3. Live        — in THIS VS Code chat, type a vague prompt (e.g. "fix the tests").
                   The UserPromptSubmit hook intercepts it, the sidecar refines it into a
                   task contract, and a new Prompt row appears on the dashboard within ~2s.

Stop when done:  scripts/demo.sh --stop
EOF
