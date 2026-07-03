#!/usr/bin/env bash
set -euo pipefail

DEMO_RUN="${AGENT_SIDECAR_DEMO_RUN:-vc-demo}"
DEEPSEEK_MODEL="${AGENT_SIDECAR_LOCAL_MODEL:-deepseek-r1:7b}"
PROMPT_RESPONSE="${AGENT_SIDECAR_DEMO_PROMPT_RESPONSE:-/tmp/agent-sidecar-vc-prompt-response.json}"
SESSION_START_RESPONSE="${AGENT_SIDECAR_DEMO_SESSION_RESPONSE:-/tmp/agent-sidecar-vc-session-start.txt}"
DEMO_STATE_DIR="${AGENT_SIDECAR_DEMO_STATE_DIR:-/tmp/agent-sidecar-vc-state}"
DEMO_DB_PATH="${AGENT_SIDECAR_DEMO_DB_PATH:-/tmp/agent-sidecar-vc.sqlite}"
DEMO_VALIDATED_TRACE_COUNT="${AGENT_SIDECAR_DEMO_VALIDATED_TRACE_COUNT:-500}"
DEMO_MIN_TOKEN_SAVINGS_USD="${AGENT_SIDECAR_DEMO_MIN_TOKEN_SAVINGS_USD:-1.20}"
DEMO_MODEL_COST_PER_TOKEN_USD="${AGENT_SIDECAR_MODEL_COST_PER_TOKEN_USD:-${NEXT_PUBLIC_AGENT_SIDECAR_MODEL_COST_PER_TOKEN_USD:-0.00001}}"

UNFOCUSED_PROMPT="$(cat <<'PROMPT'
Can you look into the invoice CSV export issue? Finance says exports for larger accounts are unreliable, but the reports are fuzzy. Sometimes the export has duplicate invoice rows. Sometimes the final day in the selected date range is missing. Sometimes retrying the export fixes it. Sometimes the row count differs between the UI total and the downloaded CSV. I am not sure if this is pagination, timezone filtering, cursor handling, retry logic, streaming, sorting, or a test fixture problem, and I do not want to send all of that indecision to Codex as-is.

Here is the messy version of what I think might be happening. Maybe the export query is using createdAt with local dates while the UI count uses UTC. Maybe the cursor pagination includes the boundary row twice. Maybe a retry starts from the wrong cursor. Maybe the export code sorts by invoice number while the API sorts by createdAt. Maybe the CSV writer flushes early and drops the last page. Maybe paid and void invoices are being filtered differently in two places. Maybe the mock data has duplicate ids. Maybe this only happens when a customer has more than one page of invoices. I am listing these because they are all possible, not because I want every path rewritten.

Please narrow this into a small, safe fix. Start by inspecting the likely export entry points and the nearest tests. Do not redesign billing, add a new CSV library, change package versions, change visual UI, modify unrelated docs, or do broad cleanup. If the answer is just a focused cursor/date-window fix, keep it there. If there is already a helper for paginated invoice reads or date range normalization, prefer using it consistently over adding another helper.

The behavior I care about is: exporting invoices for a selected inclusive date range should return each matching invoice exactly once, should include invoices on the final selected day, should produce the same count as the server-side query used by the UI, and should not loop forever or skip rows when a page fetch retries. Preserve existing behavior for small accounts, empty exports, canceled invoices, void invoices, permissions, and CSV column order.

There are also a few red herrings I do not want Codex to chase unless the code points there. Do not start by optimizing memory usage, changing download button styling, replacing the CSV formatter, moving export work to a background job, changing account permissions, or rewriting all billing queries. Those might be related later, but the first pass should prove the narrowest duplicate-or-missing-row path and stop.

A useful implementation would probably include one narrow code change and one narrow test, but use judgment after reading the repo. Possible areas to inspect are invoice export routes, billing services, pagination helpers, date range normalization, CSV serialization, retry wrappers, invoice list tests, and export fixtures. If the test suite already has a clear place for this, add coverage there. If not, run the smallest existing validation that proves the changed path.

Validation matters for the demo. Do not repeatedly run the same failing command without reading the first error. If validation fails, summarize the first concrete failure, inspect the relevant file or test, then make the smallest follow-up. If validation cannot run locally, explain why and provide the command that should be run.

For the demo, show a short plan before editing and wait. The plan should identify likely files, the intended minimal fix, what will not be touched, and the validation command. This task is intentionally scattered so Agent Sidecar can compress it into a focused task contract before Codex starts.
PROMPT
)"

echo "== Build and install Agent Sidecar CLI =="
pnpm install
pnpm build
python -m venv .venv
source .venv/bin/activate
python -m pip install --force-reinstall .
agent-sidecar --help >/dev/null

echo "== Ensure local DeepSeek is available through Ollama =="
if ! curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  ollama serve >/tmp/agent-sidecar-ollama.log 2>&1 &
  echo "Started Ollama in the background. Logs: /tmp/agent-sidecar-ollama.log"
  for _ in {1..30}; do
    curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && break
    sleep 1
  done
fi
curl -fsS http://127.0.0.1:11434/api/tags >/dev/null
ollama pull "$DEEPSEEK_MODEL"
ollama list | grep -i "deepseek-r1"

echo "== Start Agent Sidecar daemon with DeepSeek enabled =="
if [ -f "$DEMO_STATE_DIR/daemon.json" ]; then
  PREVIOUS_DAEMON_PID="$(
    python - "$DEMO_STATE_DIR/daemon.json" <<'PY'
import json
import sys

try:
    with open(sys.argv[1], encoding="utf-8") as handle:
        pid = json.load(handle).get("pid")
    print(pid if isinstance(pid, int) else "")
except OSError:
    print("")
PY
  )"
  if [ -n "$PREVIOUS_DAEMON_PID" ] && kill -0 "$PREVIOUS_DAEMON_PID" >/dev/null 2>&1; then
    kill "$PREVIOUS_DAEMON_PID" >/dev/null 2>&1 || true
    for _ in {1..20}; do
      kill -0 "$PREVIOUS_DAEMON_PID" >/dev/null 2>&1 || break
      sleep 0.25
    done
  fi
fi

rm -rf "$DEMO_STATE_DIR"
rm -f "$DEMO_DB_PATH" "$DEMO_DB_PATH-shm" "$DEMO_DB_PATH-wal"
mkdir -p "$DEMO_STATE_DIR"

export AGENT_SIDECAR_STATE_DIR="$DEMO_STATE_DIR"
export AGENT_SIDECAR_DB_PATH="$DEMO_DB_PATH"
export AGENT_SIDECAR_LOCAL_MODEL_URL="http://127.0.0.1:11434"
export AGENT_SIDECAR_LOCAL_MODEL="$DEEPSEEK_MODEL"
export AGENT_SIDECAR_LOCAL_PROMPT_OPTIMIZER=on
export AGENT_SIDECAR_LOCAL_STEERING=on
export AGENT_SIDECAR_MODEL_COST_PER_TOKEN_USD="$DEMO_MODEL_COST_PER_TOKEN_USD"
agent-sidecar start
DAEMON_STATE_FILE="$AGENT_SIDECAR_STATE_DIR/daemon.json"
DAEMON_URL=""
for _ in {1..30}; do
  if [ -f "$DAEMON_STATE_FILE" ]; then
    DAEMON_URL="$(
      python - "$DAEMON_STATE_FILE" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    print(json.load(handle)["url"].rstrip("/"))
PY
    )"
    if curl -fsS "$DAEMON_URL/health" >/tmp/agent-sidecar-status.txt 2>&1; then
      cat /tmp/agent-sidecar-status.txt
      break
    fi
  fi
  sleep 0.5
done
if [ -z "$DAEMON_URL" ]; then
  echo "Agent Sidecar daemon did not write $DAEMON_STATE_FILE." >&2
  exit 1
fi
if ! curl -fsS "$DAEMON_URL/health" >/dev/null; then
  echo "Agent Sidecar daemon did not become healthy at $DAEMON_URL." >&2
  exit 1
fi

export AGENT_SIDECAR_DAEMON_URL="$DAEMON_URL"
agent-sidecar status
export NEXT_PUBLIC_AGENT_SIDECAR_DAEMON_URL="$AGENT_SIDECAR_DAEMON_URL"
export NEXT_PUBLIC_AGENT_SIDECAR_MODEL_COST_PER_TOKEN_USD="$DEMO_MODEL_COST_PER_TOKEN_USD"

echo "== Create the named VC demo run =="
agent-sidecar session start --agent codex --repo . --name "$DEMO_RUN" --task "VC demo billing export task" >"$SESSION_START_RESPONSE"
echo "Created demo run $DEMO_RUN."

echo "== Prove DeepSeek prompt interception before Codex starts =="
UNFOCUSED_PROMPT="$UNFOCUSED_PROMPT" DEMO_RUN="$DEMO_RUN" python - <<'PY' | agent-sidecar hook --provider codex >"$PROMPT_RESPONSE"
import json
import os

print(json.dumps({
    "id": "vc-demo-unfocused-prompt",
    "runId": os.environ["DEMO_RUN"],
    "hook_event_name": "UserPromptSubmit",
    "providerEventType": "UserPromptSubmit",
    "prompt": os.environ["UNFOCUSED_PROMPT"]
}))
PY

if ! grep -q '"deterministicOrModel":"model_assisted"' "$PROMPT_RESPONSE"; then
  echo "Expected DeepSeek model_assisted prompt optimization. Fix Ollama/DeepSeek before continuing." >&2
  echo "Full hook response saved at $PROMPT_RESPONSE" >&2
  exit 1
fi

DEMO_VALIDATED_TRACE_COUNT="$DEMO_VALIDATED_TRACE_COUNT" \
DEMO_MIN_TOKEN_SAVINGS_USD="$DEMO_MIN_TOKEN_SAVINGS_USD" \
DEMO_MODEL_COST_PER_TOKEN_USD="$DEMO_MODEL_COST_PER_TOKEN_USD" \
python - "$PROMPT_RESPONSE" <<'PY'
import json
import math
import os
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    response = json.load(handle)
optimization = response.get("promptOptimization", {})
delta = optimization.get("estimatedTokenDelta")
if not isinstance(delta, (int, float)):
    raise SystemExit("Prompt optimization response did not include estimatedTokenDelta.")
optimized_tokens = optimization.get("estimatedOptimizedTokens")
if not isinstance(optimized_tokens, (int, float)):
    raise SystemExit("Prompt optimization response did not include estimatedOptimizedTokens.")
validated_trace_count = int(os.environ["DEMO_VALIDATED_TRACE_COUNT"])
cost_per_token = float(os.environ["DEMO_MODEL_COST_PER_TOKEN_USD"])
minimum_savings = float(os.environ["DEMO_MIN_TOKEN_SAVINGS_USD"])
original_tokens = int(math.ceil(optimized_tokens - delta))
tokens_saved_per_trace = max(0, int(math.ceil(-delta)))
avg_cost_delta_per_validated_trace = tokens_saved_per_trace * cost_per_token
estimated_task_cost_delta = validated_trace_count * avg_cost_delta_per_validated_trace
mode = optimization.get("deterministicOrModel", "unknown")
print(f"DeepSeek optimization confirmed ({mode}).")
print(f"Estimated original prompt tokens: {original_tokens}")
print(f"Estimated optimized prompt tokens: {int(math.ceil(optimized_tokens))}")
print(f"Estimated tokens saved per validated trace: {tokens_saved_per_trace}")
print(
    "README cost formula: "
    f"{validated_trace_count} validated traces x "
    f"${avg_cost_delta_per_validated_trace:.4f}/trace = "
    f"${estimated_task_cost_delta:.2f}"
)
if delta >= 0:
    raise SystemExit("Expected the optimized prompt to use fewer estimated tokens than the unfocused input.")
if estimated_task_cost_delta < minimum_savings:
    raise SystemExit(
        f"Expected at least ${minimum_savings:.2f} in token-cost savings, "
        f"but calculated ${estimated_task_cost_delta:.2f}."
    )
PY

echo "== End Codex path after prompt optimization =="
echo "Skipping interactive Codex launch; optimization proof is complete."

echo "== Record representative runtime signals after the Codex demo =="
agent-sidecar event command --session "$DEMO_RUN" --command "pnpm test"
agent-sidecar event validation --session "$DEMO_RUN" --command "pnpm test" --status failed --summary "invoice export pagination test failed"
agent-sidecar event command --session "$DEMO_RUN" --command "pnpm test"
agent-sidecar event validation --session "$DEMO_RUN" --command "pnpm test" --status failed --summary "invoice export pagination test failed"
agent-sidecar event edit --session "$DEMO_RUN" --path "src/billing/export.ts" --summary "Codex narrowed the fix to invoice export pagination"
agent-sidecar steer --session "$DEMO_RUN"

echo "== Show replay, summary, and dashboard evidence =="
agent-sidecar replay "$DEMO_RUN"
agent-sidecar summary export "$DEMO_RUN" --format markdown
agent-sidecar dashboard

echo "== Cleanly stop the named run =="
agent-sidecar session stop --session "$DEMO_RUN"
