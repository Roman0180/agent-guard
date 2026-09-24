#!/usr/bin/env bash
#
# Run the baseline-vs-sidecar e2e N times and print one summary of all runs.
#
# A single paired run is noisy (a creative task swings ±500 output tokens between two
# Opus runs), so its cost/latency sign is not trustworthy. This runs the e2e repeatedly
# and reports medians over the runs.
#
#   scripts/e2e_repeat.sh 5                      # 5 runs
#   scripts/e2e_repeat.sh 5 --skip-install       # pass-through flags go to the e2e
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="$REPO/.venv/bin/python"

N="${1:-3}"
if ! [[ "$N" =~ ^[0-9]+$ ]] || [[ "$N" -lt 1 ]]; then
  echo "usage: scripts/e2e_repeat.sh <N> [e2e flags...]   (N must be a positive integer)" >&2
  exit 2
fi
shift || true
E2E_FLAGS=("$@")

ARTIFACT_DIRS=()
FAILED=0
for i in $(seq 1 "$N"); do
  echo ""
  echo "############################################################"
  echo "# e2e run $i / $N"
  echo "############################################################"
  LOG="$(mktemp)"
  # Stream the run to the console while capturing it so we can recover its artifact dir.
  if "$REPO/scripts/e2e_claude_code.sh" "${E2E_FLAGS[@]}" 2>&1 | tee "$LOG"; then
    :
  else
    echo "run $i failed (continuing so the summary still reflects the runs that completed)" >&2
    FAILED=$((FAILED + 1))
  fi
  # The e2e prints "Artifacts: <dir>" near the top; take the first match.
  DIR="$(grep -oE 'Artifacts: .+' "$LOG" | head -1 | sed 's/^Artifacts: //')"
  rm -f "$LOG"
  if [[ -n "$DIR" && -d "$DIR" ]]; then
    ARTIFACT_DIRS+=("$DIR")
  else
    echo "run $i: could not locate an artifact directory; excluded from the summary" >&2
  fi
done

if [[ "${#ARTIFACT_DIRS[@]}" -eq 0 ]]; then
  echo "No completed runs to summarize." >&2
  exit 1
fi

echo ""
echo "############################################################"
echo "# All runs complete ($((N - FAILED))/$N succeeded) — summary"
echo "############################################################"
"$PY" "$REPO/scripts/e2e_aggregate.py" "${ARTIFACT_DIRS[@]}"
