#!/usr/bin/env bash
# Build the agent-sidecar wheel and serve it over the tailnet so pilot
# clients can `pip install` it from a URL. See docs/LAPTOP_PILOT_PLAN.md.
#
# Usage:
#   ./scripts/pilot_distribute.sh              # build + serve on the tailnet address
#   ./scripts/pilot_distribute.sh --build-only # build + print checksum, do not serve
#   ./scripts/pilot_distribute.sh --port 8000  # override serve port (default 8000)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$REPO_ROOT/dist/pilot"
PORT=8000
BUILD_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build-only) BUILD_ONLY=1; shift ;;
    --port) PORT="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

PYTHON="$REPO_ROOT/.venv/bin/python"
[[ -x "$PYTHON" ]] || PYTHON="$(command -v python3)"

echo "Building wheel into $DIST_DIR"
rm -f "$DIST_DIR"/agent_sidecar-*.whl
"$PYTHON" -m pip wheel "$REPO_ROOT" --no-deps -w "$DIST_DIR" --quiet
WHEEL="$(ls "$DIST_DIR"/agent_sidecar-*.whl)"
WHEEL_NAME="$(basename "$WHEEL")"
shasum -a 256 "$WHEEL"

tailnet_address() {
  local ts_cli
  for ts_cli in tailscale /Applications/Tailscale.app/Contents/MacOS/Tailscale; do
    if command -v "$ts_cli" >/dev/null 2>&1 || [[ -x "$ts_cli" ]]; then
      "$ts_cli" ip -4 2>/dev/null | head -1 && return 0
    fi
  done
  return 1
}

if [[ "$BUILD_ONLY" -eq 1 ]]; then
  echo "Build complete: $WHEEL"
  exit 0
fi

if ADDRESS="$(tailnet_address)" && [[ -n "$ADDRESS" ]]; then
  SOURCE="tailnet"
else
  ADDRESS="$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')"
  SOURCE="LAN (WARNING: not a tailnet address — anyone on this network can download)"
fi
[[ -n "$ADDRESS" ]] || { echo "could not determine a serve address" >&2; exit 1; }

echo
echo "Serving on $SOURCE address. Client install command:"
echo
echo "  pip install http://$ADDRESS:$PORT/$WHEEL_NAME"
echo
echo "Ctrl-C to stop serving."
exec "$PYTHON" -m http.server "$PORT" --bind "$ADDRESS" --directory "$DIST_DIR"
