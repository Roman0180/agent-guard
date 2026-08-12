#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="$ROOT_DIR/.venv"
TARGET_HTML="$ROOT_DIR/boilerplate.html"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
ARTIFACT_DIR="$ROOT_DIR/.agent-sidecar/e2e/$RUN_ID"
START_HTML="$ARTIFACT_DIR/boilerplate.start.html"
BASELINE_HTML="$ARTIFACT_DIR/boilerplate.baseline.html"
SIDECAR_HTML="$ARTIFACT_DIR/boilerplate.sidecar.html"
BASELINE_WORKDIR="$ARTIFACT_DIR/workspaces/baseline"
SIDECAR_WORKDIR="$ARTIFACT_DIR/workspaces/sidecar"
BASELINE_META_JSON="$ARTIFACT_DIR/baseline.meta.json"
SIDECAR_META_JSON="$ARTIFACT_DIR/sidecar.meta.json"
RAW_TELEMETRY_COMPARE_JSON="$ARTIFACT_DIR/raw-telemetry-compare.json"
DEEPSEEK_EVAL_JSON="$ARTIFACT_DIR/deepseek.implementation-eval.json"
DEEPSEEK_EVAL_RAW_TXT="$ARTIFACT_DIR/deepseek.implementation-eval.raw.txt"
BASELINE_CLAUDE_LOG="$ARTIFACT_DIR/claude.baseline.log"
SIDECAR_CLAUDE_LOG="$ARTIFACT_DIR/claude.sidecar.log"
BASELINE_DURATION_TXT="$ARTIFACT_DIR/claude.baseline.duration.txt"
SIDECAR_DURATION_TXT="$ARTIFACT_DIR/claude.sidecar.duration.txt"
BASELINE_API_PORT="${AGENT_SIDECAR_E2E_BASELINE_API_PORT:-17453}"
BASELINE_OTLP_PORT="${AGENT_SIDECAR_E2E_BASELINE_OTLP_PORT:-14338}"
SIDECAR_API_PORT="${AGENT_SIDECAR_E2E_SIDECAR_API_PORT:-17454}"
SIDECAR_OTLP_PORT="${AGENT_SIDECAR_E2E_SIDECAR_OTLP_PORT:-14339}"
CLAUDE_MODEL="${CLAUDE_MODEL:-opus}"
CLAUDE_PERMISSION_MODE="${CLAUDE_PERMISSION_MODE:-acceptEdits}"
AGENT_SIDECAR_MODEL_TIMEOUT_MS="${AGENT_SIDECAR_MODEL_TIMEOUT_MS:-60000}"
AGENT_SIDECAR_REFINE_TIMEOUT_SECONDS="${AGENT_SIDECAR_REFINE_TIMEOUT_SECONDS:-75}"
AGENT_SIDECAR_MODEL_MAX_TOKENS="${AGENT_SIDECAR_MODEL_MAX_TOKENS:-768}"
AGENT_SIDECAR_E2E_BASELINE_COST_USD="${AGENT_SIDECAR_BASELINE_COST_USD:-}"
SKIP_INSTALL=0
SINGLE_RUN=0
AUTO_SUBMIT=1
HTML_OUTPUTS_OPENED=0

DEFAULT_EXAMPLE_PROMPT='Replace boilerplate.html with a single-file dynamic Agent Sidecar demo page. Keep it dependency-free: one HTML file with semantic HTML, inline CSS, and inline JavaScript only — no external assets, fonts, or libraries. Include a header with an inline-SVG or emoji logo icon, a grid of at least six feature cards each with a distinct icon and label, and at least four working buttons: a light/dark theme toggle, a counter with increment and reset, a show/hide toggle for a details panel, and a button that cycles a status pill through Idle, Running, and Done. Wire every button with plain JavaScript and make the current state visibly change on the page. Keep the HTML under 250 lines. No tests, extra files, or final file reread. Briefly summarize the change.'
EXAMPLE_PROMPT="${AGENT_SIDECAR_E2E_PROMPT:-$DEFAULT_EXAMPLE_PROMPT}"

usage() {
  cat <<'EOF'
Run the Agent Sidecar + Claude Code end-to-end flow.

This demo requires the configured local coding route for the implementation-focused prompt
follow-up and the local reasoning model for post-run implementation evaluation.
In paired auto-submit mode, the baseline and Sidecar Claude Code runs execute in parallel in
separate artifact workspaces.

Prepare local models first with:
  brew install llama.cpp
  llama-server -hf bartowski/Meta-Llama-3-8B-Instruct-GGUF:Q4_0 --host 127.0.0.1 --port 8080 --alias llama3:latest
  ./scripts/start_local_models.sh

Usage:
  scripts/e2e_claude_code.sh [--skip-install] [--single] [--manual]

Options:
  --skip-install  Do not create/update .venv or pip install the package.
  --single        Run only one intercepted Claude Code session, no baseline compare.
  --manual        Open Claude Code interactively instead of auto-submitting the prompt.
  -h, --help      Show this help.

Environment:
  CLAUDE_MODEL            Claude Code model for auto/manual runs.
                          Default: opus
  CLAUDE_PERMISSION_MODE  Permission mode for auto-submitted Claude runs.
                          Default: acceptEdits
  AGENT_SIDECAR_E2E_BASELINE_API_PORT / AGENT_SIDECAR_E2E_BASELINE_OTLP_PORT
                         Ports for the baseline workspace daemon.
                         Defaults: 17453 / 14338
  AGENT_SIDECAR_E2E_SIDECAR_API_PORT / AGENT_SIDECAR_E2E_SIDECAR_OTLP_PORT
                         Ports for the Sidecar workspace daemon.
                         Defaults: 17454 / 14339
  AGENT_SIDECAR_MODEL_TIMEOUT_MS
                         Local model call timeout. Default: 60000
  AGENT_SIDECAR_MODEL_MAX_TOKENS
                         Local model output cap. Default: 768
  AGENT_SIDECAR_BASELINE_COST_USD
                         Optional explicit baseline cost for testing Sidecar budget context
                         in parallel mode. Same-run baseline cost is compared after both runs.
  AGENT_SIDECAR_E2E_OPEN_HTML
                         Open saved HTML artifacts before exit. Default: 1
  AGENT_SIDECAR_E2E_PROMPT
                         Override the default prompt. The built-in prompt asks for a
                         dynamic single-file page with icons, buttons, and JavaScript
                         interactivity, so expect a longer Claude phase than the old
                         static-card smoke prompt.
  AGENT_SIDECAR_REQUIRE_CODING_REFINEMENT
                         Set by this script; requires coding-model focus after deterministic refinement.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-install)
      SKIP_INSTALL=1
      ;;
    --single)
      SINGLE_RUN=1
      ;;
    --manual)
      AUTO_SUBMIT=0
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if [[ "$AUTO_SUBMIT" -eq 0 && (! -t 0 || ! -t 1) ]]; then
  echo "Run manual mode from an interactive terminal; it launches Claude Code." >&2
  exit 1
fi

if [[ "$AUTO_SUBMIT" -eq 0 && "$SINGLE_RUN" -eq 0 ]]; then
  echo "Manual paired runs cannot run in parallel. Use auto-submit mode, or combine --manual with --single." >&2
  exit 2
fi

cd "$ROOT_DIR"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

find_claude_bin() {
  if command -v claude >/dev/null 2>&1; then
    command -v claude
    return 0
  fi
  if [[ -x "$HOME/.local/bin/claude" ]]; then
    printf '%s\n' "$HOME/.local/bin/claude"
    return 0
  fi
  return 1
}

section() {
  printf '\n== %s ==\n' "$1"
}

now_ms() {
  python3 - <<'PY'
from __future__ import annotations

import time

print(time.monotonic_ns() // 1_000_000)
PY
}

pause() {
  local message="$1"
  printf '\n%s\n' "$message"
  read -r -p "Press Enter to continue..."
}

prepare_html_fixture() {
  section "Prepare Controlled HTML Fixture"
  mkdir -p "$ARTIFACT_DIR"
  if [[ -f "$TARGET_HTML" ]]; then
    cp "$TARGET_HTML" "$ARTIFACT_DIR/boilerplate.before-script.html"
  fi
  cat > "$START_HTML" <<'EOF'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HTML Boilerplate</title>
</head>
<body>
  <main>
    <h1>HTML Boilerplate</h1>
    <p>This file is intentionally plain so Agent Sidecar can compare two Claude Code runs from the same starting point.</p>
  </main>
</body>
</html>
EOF
  echo "Artifacts: $ARTIFACT_DIR"
}

restore_html_fixture() {
  local label="$1"
  local destination="${2:-$TARGET_HTML}"
  cp "$START_HTML" "$destination"
  echo "Reset $destination for $label from $START_HTML"
}

save_html_output() {
  local label="$1"
  local destination="$2"
  local source="${3:-$TARGET_HTML}"
  if [[ -f "$source" ]]; then
    cp "$source" "$destination"
    echo "Saved $label HTML output: $destination"
  else
    echo "Warning: $source does not exist after $label run." >&2
  fi
}

open_html_output() {
  local label="$1"
  local path="$2"
  if [[ "${AGENT_SIDECAR_E2E_OPEN_HTML:-1}" == "0" ]]; then
    return 0
  fi
  if [[ ! -f "$path" ]]; then
    echo "Warning: cannot open $label HTML; missing file: $path" >&2
    return 0
  fi

  if command -v open >/dev/null 2>&1; then
    if open "$path" >/dev/null 2>&1; then
      echo "Opened $label HTML: $path"
    else
      echo "Warning: failed to open $label HTML: $path" >&2
    fi
    return 0
  fi

  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$path" >/dev/null 2>&1 &
    echo "Opened $label HTML: $path"
    return 0
  fi

  python3 - "$path" <<'PY' || true
from __future__ import annotations

import sys
import webbrowser
from pathlib import Path

webbrowser.open(Path(sys.argv[1]).resolve().as_uri())
PY
  echo "Opened $label HTML: $path"
}

open_saved_html_outputs() {
  if [[ "${AGENT_SIDECAR_E2E_OPEN_HTML:-1}" == "0" || "$HTML_OUTPUTS_OPENED" -eq 1 ]]; then
    return 0
  fi

  local opened=0
  if [[ -f "$BASELINE_HTML" ]]; then
    open_html_output "baseline" "$BASELINE_HTML"
    opened=1
  fi
  if [[ -f "$SIDECAR_HTML" ]]; then
    open_html_output "sidecar" "$SIDECAR_HTML"
    opened=1
  fi
  if [[ "$opened" -eq 1 ]]; then
    HTML_OUTPUTS_OPENED=1
  fi
}

prepare_run_workspace() {
  local label="$1"
  local repo_dir="$2"
  rm -rf "$repo_dir"
  mkdir -p "$repo_dir"
  cp "$START_HTML" "$repo_dir/boilerplate.html"
  if command -v git >/dev/null 2>&1; then
    git -C "$repo_dir" init -q
  fi
  echo "Prepared $label workspace: $repo_dir"
}

reset_html_on_exit() {
  # Only single mode edits the tracked root boilerplate.html; parallel runs
  # stay inside gitignored workspaces, so leave the tracked file alone there.
  if [[ "$SINGLE_RUN" -ne 1 ]]; then
    return 0
  fi
  if [[ -f "$START_HTML" ]]; then
    cp "$START_HTML" "$TARGET_HTML"
    echo "Reset boilerplate.html after script run."
  fi
}

stop_sidecar_daemon() {
  local repo_dir="$1"
  python3 - "$repo_dir" <<'PY'
from __future__ import annotations

import json
import os
import signal
import sys
import time
from pathlib import Path

path = Path(sys.argv[1]) / ".agent-sidecar" / "daemon.json"
try:
    state = json.loads(path.read_text(encoding="utf-8"))
except (OSError, json.JSONDecodeError):
    raise SystemExit(0)

pid = state.get("pid")
if not isinstance(pid, int) or pid <= 0:
    raise SystemExit(0)

try:
    os.kill(pid, 0)
except OSError:
    raise SystemExit(0)

os.kill(pid, signal.SIGTERM)
deadline = time.monotonic() + 5
while time.monotonic() < deadline:
    try:
        os.kill(pid, 0)
    except OSError:
        break
    time.sleep(0.1)
PY
}

cleanup_on_exit() {
  stop_sidecar_daemon "$BASELINE_WORKDIR" || true
  stop_sidecar_daemon "$SIDECAR_WORKDIR" || true
  open_saved_html_outputs
  reset_html_on_exit
}

restart_sidecar_daemon_for_demo() {
  section "Restart Sidecar Daemon For Demo"
  python3 - "$ROOT_DIR" <<'PY'
from __future__ import annotations

import json
import os
import signal
import sys
import time
from pathlib import Path

root = Path(sys.argv[1])
state_path = root / ".agent-sidecar" / "daemon.json"
try:
    state = json.loads(state_path.read_text(encoding="utf-8"))
except (OSError, json.JSONDecodeError):
    print("No existing daemon state found.")
    raise SystemExit(0)

pid = state.get("pid")
if not isinstance(pid, int) or pid <= 0:
    print("No valid daemon pid found.")
    raise SystemExit(0)

try:
    os.kill(pid, 0)
except OSError:
    print(f"Previous daemon pid {pid} is not running.")
    raise SystemExit(0)

print(f"Stopping existing Agent Sidecar daemon pid {pid} so demo env is applied.")
os.kill(pid, signal.SIGTERM)
deadline = time.monotonic() + 5
while time.monotonic() < deadline:
    try:
        os.kill(pid, 0)
    except OSError:
        print("Previous daemon stopped.")
        break
    time.sleep(0.1)
else:
    print(f"Existing daemon pid {pid} did not stop within 5s.", file=sys.stderr)
    raise SystemExit(1)
PY
}

ensure_python_env() {
  if [[ "$SKIP_INSTALL" -eq 1 ]]; then
    if [[ -f "$VENV_DIR/bin/activate" ]]; then
      # shellcheck disable=SC1091
      source "$VENV_DIR/bin/activate"
    fi
    return
  fi

  if [[ ! -x "$VENV_DIR/bin/python" ]]; then
    section "Create Python venv"
    python3 -m venv "$VENV_DIR"
  fi

  # shellcheck disable=SC1091
  source "$VENV_DIR/bin/activate"

  section "Install/Refresh Agent Sidecar"
  python -m pip install ".[dev]"
  # Reinstall the local package even when the version number did not change.
  python -m pip uninstall -y agent-sidecar >/dev/null 2>&1 || true
  rm -rf "$VENV_DIR"/lib/python*/site-packages/agent_sidecar
  rm -rf "$VENV_DIR"/lib/python*/site-packages/agent_sidecar-*.dist-info
  rm -f "$VENV_DIR/bin/agent-sidecar"
  python -m pip install --no-deps --no-cache-dir --force-reinstall .
}

latest_stopped_session() {
  local repo_dir="${1:-$ROOT_DIR}"
  (cd "$repo_dir" && agent-sidecar session list | awk '$2 == "stopped" { id = $1 } END { if (id) print id }')
}

stop_active_session() {
  local repo_dir="${1:-$ROOT_DIR}"
  local output session_id
  set +e
  output="$(cd "$repo_dir" && agent-sidecar session stop 2>&1)"
  local status=$?
  set -e
  if [[ "$status" -ne 0 ]]; then
    echo "$output" >&2
    return "$status"
  fi
  echo "$output"
  session_id="$(printf '%s\n' "$output" | awk '/^Stopped / { print $2; exit }')"
  if [[ -z "$session_id" ]]; then
    session_id="$(latest_stopped_session "$repo_dir")"
  fi
  printf '%s\n' "$session_id"
}

json_file_field() {
  local path="$1"
  local field="$2"
  python3 - "$path" "$field" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
except (OSError, json.JSONDecodeError):
    raise SystemExit(0)
value = payload.get(sys.argv[2], "")
print("" if value is None else value)
PY
}

write_e2e_run_meta() {
  local path="$1"
  local phase="$2"
  local session_id="$3"
  local exit_code="$4"
  local repo_dir="$5"
  local api_port="$6"
  local otlp_port="$7"
  local log_path="$8"
  local duration_path="$9"
  local html_path="${10}"
  local diagnostic_log_path="${11}"
  python3 - "$path" "$phase" "$session_id" "$exit_code" "$repo_dir" "$api_port" "$otlp_port" "$log_path" "$duration_path" "$html_path" "$diagnostic_log_path" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
payload = {
    "phase": sys.argv[2],
    "session_id": sys.argv[3],
    "exit_code": int(sys.argv[4]),
    "repo_dir": sys.argv[5],
    "api_port": int(sys.argv[6]),
    "otlp_port": int(sys.argv[7]),
    "log_path": sys.argv[8],
    "duration_path": sys.argv[9],
    "html_path": sys.argv[10],
    "diagnostic_log_path": sys.argv[11],
}
path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
PY
}

print_example_prompt() {
  cat <<'EOF'

Claude Code prompt:
EOF
  printf '\n%s\n' "$EXAMPLE_PROMPT"
}

run_claude_session() {
  local label="$1"
  local log_path="$2"
  local duration_path="${3:-}"
  local repo_dir="${4:-$ROOT_DIR}"
  local started ended elapsed_ms status
  section "$label"
  print_example_prompt
  started="$(now_ms)"
  if [[ "$AUTO_SUBMIT" -eq 1 ]]; then
    printf '\nSubmitting prompt with: %s -p --model %s --permission-mode %s\n' "$CLAUDE_BIN" "$CLAUDE_MODEL" "$CLAUDE_PERMISSION_MODE"
    set +e
    (cd "$repo_dir" && "$CLAUDE_BIN" -p --model "$CLAUDE_MODEL" --permission-mode "$CLAUDE_PERMISSION_MODE" "$EXAMPLE_PROMPT") | tee "$log_path"
    status=${PIPESTATUS[0]}
    set -e
  else
    pause "Claude Code will open now. Submit the prompt, let it finish, then exit Claude Code."
    set +e
    (cd "$repo_dir" && "$CLAUDE_BIN" --model "$CLAUDE_MODEL")
    status=$?
    set -e
  fi
  ended="$(now_ms)"
  elapsed_ms=$((ended - started))
  if [[ -n "$duration_path" ]]; then
    {
      printf 'label=%s\n' "$label"
      printf 'model=%s\n' "$CLAUDE_MODEL"
      printf 'elapsed_ms=%s\n' "$elapsed_ms"
      python3 - "$elapsed_ms" <<'PY'
from __future__ import annotations

import sys

elapsed_ms = int(sys.argv[1])
print(f"elapsed_seconds={elapsed_ms / 1000:.3f}")
PY
    } > "$duration_path"
  fi
  python3 - "$label" "$elapsed_ms" <<'PY'
from __future__ import annotations

import sys

label = sys.argv[1]
elapsed_ms = int(sys.argv[2])
print(f"{label} elapsed time: {elapsed_ms / 1000:.1f}s")
PY
  return "$status"
}

preflight_coding_route() {
  local api_url="${1:-${AGENT_SIDECAR_API_URL:-http://127.0.0.1:7433}}"
  section "Preflight Local Coding Route"
  python3 - "$api_url" <<'PY'
from __future__ import annotations

import json
import sys
import urllib.request

api_url = sys.argv[1].rstrip("/")
try:
    with urllib.request.urlopen(f"{api_url}/models", timeout=5) as response:
        rows = json.loads(response.read().decode("utf-8")).get("roles", [])
except (OSError, json.JSONDecodeError) as error:
    print(f"Local coding-route preflight failed: {error}", file=sys.stderr)
    print("Start/register the configured local coding model, then rerun this demo.", file=sys.stderr)
    raise SystemExit(1)

coding = next((row for row in rows if row.get("role") == "coding"), None)
if not coding:
    print("Local coding-route preflight failed: no coding role returned by /models.", file=sys.stderr)
    raise SystemExit(1)
if coding.get("served") is not True or coding.get("available") is not True:
    print(f"Local coding route is not ready: {coding}", file=sys.stderr)
    print("Start/register the configured local coding model, then rerun this demo.", file=sys.stderr)
    raise SystemExit(1)

print(f"Local coding route ok: {coding.get('model_id')} via {coding.get('serving')}")
PY
}

preflight_deepseek_reasoning_route() {
  local api_url="${1:-${AGENT_SIDECAR_API_URL:-http://127.0.0.1:7433}}"
  section "Preflight Reasoning Route"
  python3 - "$api_url" <<'PY'
from __future__ import annotations

import json
import sys
import urllib.request

api_url = sys.argv[1].rstrip("/")
try:
    with urllib.request.urlopen(f"{api_url}/models", timeout=5) as response:
        rows = json.loads(response.read().decode("utf-8")).get("roles", [])
except (OSError, json.JSONDecodeError) as error:
    print(f"Reasoning-route preflight failed: {error}", file=sys.stderr)
    print("Start Ollama and pull the configured reasoning model (./scripts/start_local_models.sh), then rerun this demo.", file=sys.stderr)
    raise SystemExit(1)

reasoning = next((row for row in rows if row.get("role") == "reasoning"), None)
if not reasoning:
    print("Reasoning-route preflight failed: no reasoning role returned by /models.", file=sys.stderr)
    raise SystemExit(1)
if reasoning.get("served") is not True or reasoning.get("available") is not True:
    print(f"Reasoning route is not ready: {reasoning}", file=sys.stderr)
    print("Start Ollama and pull the configured reasoning model (./scripts/start_local_models.sh), then rerun this demo.", file=sys.stderr)
    raise SystemExit(1)

print(f"DeepSeek reasoning route ok: {reasoning.get('model_id')} via {reasoning.get('serving')}")
PY
}

assert_deterministic_and_coding_model_used() {
  local session_id="$1"
  local repo_dir="${2:-$ROOT_DIR}"
  python3 - "$repo_dir" "$session_id" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path

repo_dir = Path(sys.argv[1])
session_id = sys.argv[2]
path = repo_dir / ".agent-sidecar" / "sessions" / f"{session_id}.jsonl"
events = []
try:
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            events.append(json.loads(line))
except (OSError, json.JSONDecodeError) as error:
    print(f"Could not inspect sidecar session {session_id}: {error}", file=sys.stderr)
    raise SystemExit(1)

refinements = [event for event in events if event.get("event_type") == "prompt_refined"]
if not refinements:
    print(f"Sidecar session {session_id} did not record a prompt_refined event.", file=sys.stderr)
    raise SystemExit(1)

latest = refinements[-1].get("payload") or {}
if latest.get("source") != "deterministic-then-coding":
    print(f"Sidecar refinement source was {latest.get('source')!r}, expected 'deterministic-then-coding'.", file=sys.stderr)
    calls = [event.get("payload") or {} for event in events if event.get("event_type") == "model_call_completed"]
    for call in calls[-6:]:
        print(
            "  model_call "
            f"role={call.get('role')} model={call.get('model_id')} valid_json={call.get('valid_json')} "
            f"fallback_used={call.get('fallback_used')} failure_reason={call.get('failure_reason')}",
            file=sys.stderr,
        )
    raise SystemExit(1)

calls = [event.get("payload") or {} for event in events if event.get("event_type") == "model_call_completed"]
reasoning_calls = [call for call in calls if call.get("role") == "reasoning"]
if reasoning_calls:
    print("Sidecar prompt refinement used the reasoning model; expected coding-model focus after deterministic refinement.", file=sys.stderr)
    for call in calls[-6:]:
        print(
            "  model_call "
            f"role={call.get('role')} model={call.get('model_id')} valid_json={call.get('valid_json')} "
            f"fallback_used={call.get('fallback_used')} failure_reason={call.get('failure_reason')}",
            file=sys.stderr,
        )
    raise SystemExit(1)

valid_coding = any(
    call.get("role") == "coding" and call.get("valid_json") is True and call.get("fallback_used") is False
    for call in calls
)
if not valid_coding:
    print("Sidecar deterministic refinement was recorded, but no successful coding-model call was found.", file=sys.stderr)
    raise SystemExit(1)

print(f"Verified deterministic prompt refinement and coding-model focus for {session_id}.")
PY
}

evaluate_implementations_with_deepseek() {
  local baseline_html="$1"
  local sidecar_html="$2"
  local output_json="$3"
  section "Reasoning-Model Implementation Evaluation"
  python3 - "$ROOT_DIR" "$baseline_html" "$sidecar_html" "$output_json" "$EXAMPLE_PROMPT" <<'PY'
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

from pydantic import BaseModel

from agent_sidecar.models.local_services import model_is_served
from agent_sidecar.models.provider import LiteLLMModelProvider
from agent_sidecar.models.router import validate_route_allowed
from agent_sidecar.models.validation import validate_json_text
from agent_sidecar.schema.model_io import ModelRole


class ImplementationEvaluation(BaseModel):
    baseline_good: bool
    sidecar_good: bool
    baseline_score: float
    sidecar_score: float
    quality_preserved: bool
    baseline_issues: list[str]
    sidecar_issues: list[str]
    quality_verdict: str


def excerpt(path: Path, limit: int = 9000) -> str:
    text = path.read_text(encoding="utf-8")
    if len(text) <= limit:
        return text
    half = max(1, (limit - 80) // 2)
    return f"{text[:half]}\n\n[...truncated {len(text) - (half * 2)} chars...]\n\n{text[-half:]}"


def write_raw(path: Path, first_response: str, retry_response: str | None = None) -> None:
    parts = ["FIRST RESPONSE", first_response]
    if retry_response is not None:
        parts.extend(["", "RETRY RESPONSE", retry_response])
    path.write_text("\n".join(parts) + "\n", encoding="utf-8")


def complete_evaluation(provider: LiteLLMModelProvider, task: str, prompt: str, raw_path: Path) -> tuple[ImplementationEvaluation | None, str]:
    route = provider.router.resolve(ModelRole.reasoning)
    if not validate_route_allowed(route, provider.config):
        print(f"DeepSeek evaluation route is not allowed: {route}", file=sys.stderr)
        return None, route.model_id

    served, reason = model_is_served(route.model_id, route.serving, route.api_base, timeout_s=2.0)
    if not served:
        print(f"DeepSeek evaluation route is not served: {reason}", file=sys.stderr)
        return None, route.model_id

    os.environ.setdefault("AGENT_SIDECAR_MODEL_MAX_TOKENS", "2048")
    timeout_s = max(provider._timeout_ms(60000) / 1000, 60)
    first_response = provider._completion(route, task, prompt, timeout_s)
    result = validate_json_text(first_response, ImplementationEvaluation)
    if isinstance(result, ImplementationEvaluation):
        write_raw(raw_path, first_response)
        return result, route.model_id

    retry_task = "Convert the previous response into strict JSON for the requested schema. Return one JSON object only."
    retry_prompt = f"""Required JSON keys and types:
{{
  "baseline_good": true,
  "sidecar_good": true,
  "baseline_score": 0.0,
  "sidecar_score": 0.0,
  "quality_preserved": true,
  "baseline_issues": [],
  "sidecar_issues": [],
  "quality_verdict": "one concise sentence"
}}

Previous response:
{first_response}
"""
    retry_response = provider._completion(route, retry_task, retry_prompt, timeout_s)
    write_raw(raw_path, first_response, retry_response)
    result = validate_json_text(retry_response, ImplementationEvaluation)
    return (result if isinstance(result, ImplementationEvaluation) else None), route.model_id


root = Path(sys.argv[1])
baseline_path = Path(sys.argv[2])
sidecar_path = Path(sys.argv[3])
output_path = Path(sys.argv[4])
original_prompt = sys.argv[5]

if not baseline_path.exists() or not sidecar_path.exists():
    print("Cannot evaluate implementations: one or both HTML artifacts are missing.", file=sys.stderr)
    raise SystemExit(1)

task = """Evaluate two independently generated single-file HTML implementations.
Return exactly one strict JSON object with these keys and JSON types:
{
  "baseline_good": true,
  "sidecar_good": true,
  "baseline_score": 0.0,
  "sidecar_score": 0.0,
  "quality_preserved": true,
  "baseline_issues": [],
  "sidecar_issues": [],
  "quality_verdict": "one concise sentence"
}

Judge each implementation independently against the original task. Do not prefer either
run because of its label. Mark good=true only if it satisfies the core request:
a dependency-free single HTML file with inline CSS and inline JavaScript only,
a header with a logo icon, a grid of feature cards with distinct icons and labels,
and working buttons wired with plain JavaScript covering a theme toggle, a counter
with increment and reset, a show/hide details panel, and a cycling status pill,
with no external assets, no unrelated file assumptions, and no obvious syntax problems.
Set quality_preserved=true only when both implementations are good and the Sidecar
implementation is not materially worse than the baseline on the original task.
Do not include markdown fences, comments, prose, analysis, or chain-of-thought."""

prompt = "\n\n".join(
    [
        "Original task:",
        original_prompt,
        "Baseline implementation HTML:",
        excerpt(baseline_path),
        "Sidecar implementation HTML:",
        excerpt(sidecar_path),
    ]
)

provider = LiteLLMModelProvider(root)
raw_path = output_path.with_suffix(".raw.txt")
started = time.monotonic()
try:
    result, model_id = complete_evaluation(provider, task, prompt, raw_path)
except Exception as error:
    print(f"DeepSeek implementation evaluation failed: {error}", file=sys.stderr)
    print(f"Raw DeepSeek response path, if created: {raw_path}", file=sys.stderr)
    raise SystemExit(1) from error
elapsed = time.monotonic() - started
if not isinstance(result, ImplementationEvaluation):
    print("DeepSeek implementation evaluation failed to return valid JSON.", file=sys.stderr)
    print(f"Raw DeepSeek responses saved: {raw_path}", file=sys.stderr)
    raise SystemExit(1)

payload = result.model_dump(mode="json")
payload["model_role"] = "reasoning"
payload["model_id"] = model_id
payload["elapsed_seconds"] = round(elapsed, 3)
payload["baseline_html"] = str(baseline_path)
payload["sidecar_html"] = str(sidecar_path)
payload["raw_response"] = str(raw_path)
output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

print(f"DeepSeek evaluation saved: {output_path}")
print(f"Quality preserved: {'YES' if result.quality_preserved else 'NO'} - {result.quality_verdict}")

if not result.quality_preserved:
    raise SystemExit(1)
PY
}

raw_telemetry_compare() {
  local baseline_session="$1"
  local sidecar_session="$2"
  local baseline_repo_dir="${3:-$ROOT_DIR}"
  local sidecar_repo_dir="${4:-$ROOT_DIR}"
  local output_json="${5:-}"
  python3 - "$baseline_repo_dir" "$baseline_session" "$sidecar_repo_dir" "$sidecar_session" "$output_json" <<'PY'
from __future__ import annotations

import json
import os
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

sessions = [
    ("Baseline", Path(sys.argv[1]), sys.argv[2]),
    ("Sidecar", Path(sys.argv[3]), sys.argv[4]),
]
output_json = Path(sys.argv[5]) if len(sys.argv) > 5 and sys.argv[5] else None


def value(raw: dict[str, Any]) -> Any:
    for key in ("stringValue", "intValue", "doubleValue"):
        if key in raw:
            return raw[key]
    return None


def attrs_to_dict(attrs: list[dict[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for attr in attrs or []:
        key = attr.get("key")
        if isinstance(key, str):
            result[key] = value(attr.get("value") or {})
    return result


def as_int(raw: Any) -> int:
    try:
        return int(float(raw or 0))
    except (TypeError, ValueError):
        return 0


def as_float(raw: Any) -> float:
    try:
        return float(raw or 0.0)
    except (TypeError, ValueError):
        return 0.0


def iter_api_requests(path: Path) -> list[dict[str, Any]]:
    rows: dict[str, dict[str, Any]] = {}
    fallback_rows: list[dict[str, Any]] = []
    if not path.exists():
        return []
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("event_type") != "cost_estimate_updated":
            continue
        payload = event.get("payload") or {}
        raw = payload.get("raw_otel") or {}
        found_raw_request = False
        for resource in raw.get("resourceLogs") or []:
            for scope in resource.get("scopeLogs") or []:
                for record in scope.get("logRecords") or []:
                    if ((record.get("body") or {}).get("stringValue")) != "claude_code.api_request":
                        continue
                    attrs = attrs_to_dict(record.get("attributes") or [])
                    row = {
                        "model": str(attrs.get("model") or ""),
                        "source": str(attrs.get("query_source") or "unknown"),
                        "input": as_int(attrs.get("input_tokens")),
                        "output": as_int(attrs.get("output_tokens")),
                        "cache_read": as_int(attrs.get("cache_read_tokens")),
                        "cache_create": as_int(attrs.get("cache_creation_tokens")),
                        "cost": as_float(attrs.get("cost_usd")),
                    }
                    if row["input"] + row["output"] + row["cache_read"] + row["cache_create"] == 0 and row["cost"] == 0:
                        continue
                    key = str(attrs.get("request_id") or (
                        attrs.get("event.timestamp"),
                        row["model"],
                        row["source"],
                        row["input"],
                        row["output"],
                        row["cache_read"],
                        row["cache_create"],
                        row["cost"],
                    ))
                    rows[key] = row
                    found_raw_request = True
        if not found_raw_request:
            row = {
                "model": str(payload.get("gen_ai.request.model") or ""),
                "source": "top_level_fallback",
                "input": as_int(payload.get("gen_ai.usage.input_tokens")),
                "output": as_int(payload.get("gen_ai.usage.output_tokens")),
                "cache_read": as_int(payload.get("gen_ai.usage.cache_read_tokens")),
                "cache_create": 0,
                "cost": as_float(payload.get("cost_usd")),
            }
            if row["input"] + row["output"] + row["cache_read"] + row["cache_create"] > 0 or row["cost"] > 0:
                fallback_rows.append(row)
    return list(rows.values()) or fallback_rows


def summarize(repo_dir: Path, session_id: str) -> dict[str, Any]:
    path = repo_dir / ".agent-sidecar" / "sessions" / f"{session_id}.jsonl"
    rows = iter_api_requests(path)
    totals = {
        "requests": len(rows),
        "input": sum(row["input"] for row in rows),
        "output": sum(row["output"] for row in rows),
        "cache_read": sum(row["cache_read"] for row in rows),
        "cache_create": sum(row["cache_create"] for row in rows),
        "cost": sum(row["cost"] for row in rows),
        "by_source": defaultdict(lambda: {"requests": 0, "input": 0, "output": 0, "cache_read": 0, "cache_create": 0, "cost": 0.0}),
    }
    for row in rows:
        key = f"{row['model']} / {row['source']}"
        group = totals["by_source"][key]
        group["requests"] += 1
        group["input"] += row["input"]
        group["output"] += row["output"]
        group["cache_read"] += row["cache_read"]
        group["cache_create"] += row["cache_create"]
        group["cost"] += row["cost"]
    return totals


summaries = [(label, repo_dir, session_id, summarize(repo_dir, session_id)) for label, repo_dir, session_id in sessions]

print("Raw Claude API-request comparison")
print("Note: sums unique claude_code.api_request records by request_id and ignores zero-only rollup events.")
print()
print(f"{'Run':<10} {'Session':<42} {'Req':>4} {'Input':>8} {'Output':>8} {'CacheRead':>10} {'CacheNew':>9} {'Cost':>11}")
for label, _repo_dir, session_id, total in summaries:
    print(
        f"{label:<10} {session_id:<42} {total['requests']:>4} "
        f"{total['input']:>8} {total['output']:>8} {total['cache_read']:>10} "
        f"{total['cache_create']:>9} ${total['cost']:>10.6f}"
    )

baseline = summaries[0][3]
sidecar = summaries[1][3]
delta_cost = baseline["cost"] - sidecar["cost"]
delta_tokens = (
    baseline["input"] + baseline["output"] + baseline["cache_read"]
    - sidecar["input"] - sidecar["output"] - sidecar["cache_read"]
)
percent = (delta_cost / baseline["cost"] * 100) if baseline["cost"] > 0 else 0.0
print()
if delta_cost >= 0:
    print(f"Cost savings: ${delta_cost:.6f} ({percent:.1f}%)")
else:
    print(f"Cost increase: ${abs(delta_cost):.6f} ({abs(percent):.1f}%)")

TOKEN_METRICS = ("input", "output", "cache_read", "cache_create")


def token_savings_rows(base: dict[str, Any], side: dict[str, Any]) -> dict[str, dict[str, Any]]:
    rows: dict[str, dict[str, Any]] = {}
    for metric in TOKEN_METRICS:
        rows[metric] = _savings_row(base[metric], side[metric])
    rows["total"] = _savings_row(
        sum(base[metric] for metric in TOKEN_METRICS),
        sum(side[metric] for metric in TOKEN_METRICS),
    )
    return rows


def _savings_row(base_value: int, side_value: int) -> dict[str, Any]:
    saved = base_value - side_value
    return {
        "baseline": base_value,
        "sidecar": side_value,
        "saved": saved,
        "savings_pct": round(saved / base_value * 100, 2) if base_value > 0 else 0.0,
    }


token_savings = token_savings_rows(baseline, sidecar)
print()
print("Token savings (baseline - sidecar; positive = Sidecar used fewer):")
print(f"  {'Metric':<13} {'Baseline':>10} {'Sidecar':>10} {'Saved':>10} {'Savings':>9}")
for metric in (*TOKEN_METRICS, "total"):
    row = token_savings[metric]
    print(
        f"  {metric:<13} {row['baseline']:>10} {row['sidecar']:>10} "
        f"{row['saved']:>+10} {row['savings_pct']:>8.1f}%"
    )
total_row = token_savings["total"]
if total_row["saved"] >= 0:
    print(f"Total token savings: {total_row['saved']} ({total_row['savings_pct']:.1f}%)")
else:
    print(f"Total token increase: {abs(total_row['saved'])} ({abs(total_row['savings_pct']):.1f}%)")

# Plans publish no token quota, so the monthly capacity denominator is estimated
# from plan price at this run's blended API-equivalent $/token. Pro unless overridden.
plan_monthly_usd = float(os.environ.get("SIDECAR_PLAN_MONTHLY_USD", "20"))
plan_label = "Pro" if "SIDECAR_PLAN_MONTHLY_USD" not in os.environ else f"${plan_monthly_usd:.0f}/mo"
run_tokens = baseline["input"] + baseline["output"] + baseline["cache_read"] + baseline["cache_create"] + (
    sidecar["input"] + sidecar["output"] + sidecar["cache_read"] + sidecar["cache_create"]
)
run_cost = baseline["cost"] + sidecar["cost"]
plan_percent = None
estimated_plan_tokens = None
if run_tokens > 0 and run_cost > 0:
    estimated_plan_tokens = int(plan_monthly_usd / (run_cost / run_tokens))
    plan_percent = total_row["saved"] / estimated_plan_tokens * 100
    print(
        f"Plan capacity: saved tokens = {plan_percent:+.3f}% of an estimated {plan_label} plan month "
        f"(~{estimated_plan_tokens} tokens at this run's blended API-equivalent rate; approximate)"
    )

print()
for label, _repo_dir, _session_id, total in summaries:
    print(f"{label} breakdown:")
    for key in sorted(total["by_source"]):
        group = total["by_source"][key]
        print(
            f"  {key}: req={group['requests']} input={group['input']} output={group['output']} "
            f"cache_read={group['cache_read']} cache_new={group['cache_create']} cost=${group['cost']:.6f}"
        )

empty_group = {"requests": 0, "input": 0, "output": 0, "cache_read": 0, "cache_create": 0, "cost": 0.0}
delta_rows = []
for key in set(baseline["by_source"]) | set(sidecar["by_source"]):
    base_group = baseline["by_source"].get(key, empty_group)
    side_group = sidecar["by_source"].get(key, empty_group)
    delta = {
        "requests": side_group["requests"] - base_group["requests"],
        "input": side_group["input"] - base_group["input"],
        "output": side_group["output"] - base_group["output"],
        "cache_read": side_group["cache_read"] - base_group["cache_read"],
        "cache_create": side_group["cache_create"] - base_group["cache_create"],
        "cost": side_group["cost"] - base_group["cost"],
    }
    delta_rows.append((key, delta))

print()
print("Sidecar - baseline deltas:")
for key, delta in sorted(
    delta_rows,
    key=lambda item: (
        abs(item[1]["cost"]),
        abs(item[1]["input"] + item[1]["output"] + item[1]["cache_read"] + item[1]["cache_create"]),
    ),
    reverse=True,
)[:8]:
    print(
        f"  {key}: req={delta['requests']:+d} input={delta['input']:+d} output={delta['output']:+d} "
        f"cache_read={delta['cache_read']:+d} cache_new={delta['cache_create']:+d} cost=${delta['cost']:+.6f}"
    )

metric_deltas = {
    "input": sidecar["input"] - baseline["input"],
    "output": sidecar["output"] - baseline["output"],
    "cache_read": sidecar["cache_read"] - baseline["cache_read"],
    "cache_create": sidecar["cache_create"] - baseline["cache_create"],
}
largest_metric, largest_delta = max(metric_deltas.items(), key=lambda item: abs(item[1]))
request_delta = sidecar["requests"] - baseline["requests"]
print()
print(
    "Likely driver: "
    f"{request_delta:+d} Claude API requests and {largest_metric} changed by {largest_delta:+d} tokens."
)

if output_json is not None:
    output_json.write_text(
        json.dumps(
            {
                "baseline_session": summaries[0][2],
                "sidecar_session": summaries[1][2],
                "baseline_repo_dir": str(summaries[0][1]),
                "sidecar_repo_dir": str(summaries[1][1]),
                "baseline": {
                    key: value for key, value in baseline.items() if key != "by_source"
                },
                "sidecar": {
                    key: value for key, value in sidecar.items() if key != "by_source"
                },
                "delta_cost_usd": round(delta_cost, 6),
                "delta_tokens_excluding_cache_creation": delta_tokens,
                "cost_savings_pct": round(percent, 3),
                "token_savings": token_savings,
                "total_token_savings_pct": token_savings["total"]["savings_pct"],
                "plan_capacity": {
                    "plan_monthly_usd": plan_monthly_usd,
                    "estimated_plan_tokens": estimated_plan_tokens,
                    "saved_plan_percent": round(plan_percent, 4) if plan_percent is not None else None,
                    "precision": "approximate",
                },
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
PY
}

enforce_raw_cost_savings() {
  local compare_json="$1"
  python3 - "$compare_json" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
delta = float(payload.get("delta_cost_usd") or 0.0)
if delta <= 0:
    baseline = float((payload.get("baseline") or {}).get("cost") or 0.0)
    sidecar = float((payload.get("sidecar") or {}).get("cost") or 0.0)
    print(
        f"Measured Sidecar cost is not lower than baseline "
        f"(baseline=${baseline:.6f}, sidecar=${sidecar:.6f}).",
        file=sys.stderr,
    )
    raise SystemExit(1)
print(f"Measured raw telemetry savings: ${delta:.6f}")
PY
}

compare_execution_time() {
  local baseline_duration="$1"
  local sidecar_duration="$2"
  python3 - "$baseline_duration" "$sidecar_duration" <<'PY'
from __future__ import annotations

import sys
from pathlib import Path


def read_duration(path: Path) -> dict[str, str]:
    data: dict[str, str] = {}
    if not path.exists():
        return data
    for line in path.read_text(encoding="utf-8").splitlines():
        key, sep, value = line.partition("=")
        if sep:
            data[key] = value
    return data


baseline = read_duration(Path(sys.argv[1]))
sidecar = read_duration(Path(sys.argv[2]))
baseline_ms = int(baseline.get("elapsed_ms") or 0)
sidecar_ms = int(sidecar.get("elapsed_ms") or 0)

print("Claude execution time comparison")
print(f"{'Run':<10} {'Elapsed':>10}")
print(f"{'Baseline':<10} {baseline_ms / 1000:>9.1f}s")
print(f"{'Sidecar':<10} {sidecar_ms / 1000:>9.1f}s")
delta_ms = sidecar_ms - baseline_ms
percent = (delta_ms / baseline_ms * 100) if baseline_ms > 0 else 0.0
sign = "+" if delta_ms >= 0 else "-"
print(f"Sidecar - baseline: {sign}{abs(delta_ms) / 1000:.1f}s ({sign}{abs(percent):.1f}%)")
PY
}

run_e2e_phase() {
  local phase="$1"
  local label="$2"
  local repo_dir="$3"
  local api_port="$4"
  local otlp_port="$5"
  local claude_log="$6"
  local duration_path="$7"
  local html_output="$8"
  local meta_path="$9"
  local diag_path="$ARTIFACT_DIR/agent-sidecar.$phase.log"
  local telemetry_exports session_output session_id status

  section "Start $phase Sidecar workspace"
  stop_sidecar_daemon "$repo_dir" || true
  (
    cd "$repo_dir"
    export AGENT_SIDECAR_MODEL_TIMEOUT_MS
    export AGENT_SIDECAR_REFINE_TIMEOUT_SECONDS
    export AGENT_SIDECAR_MODEL_MAX_TOKENS
    : > "$diag_path"
    {
      printf 'phase=%s\n' "$phase"
      printf 'repo_dir=%s\n' "$repo_dir"
      printf 'api_port=%s\n' "$api_port"
      printf 'otlp_port=%s\n' "$otlp_port"
      printf 'claude_bin=%s\n' "$CLAUDE_BIN"
      printf 'claude_model=%s\n' "$CLAUDE_MODEL"
      printf 'claude_permission_mode=%s\n' "$CLAUDE_PERMISSION_MODE"
      "$CLAUDE_BIN" --version || true
      printf '\n== agent-sidecar start ==\n'
      agent-sidecar start --api-port "$api_port" --otlp-port "$otlp_port"
      printf '\n== hooks install ==\n'
      agent-sidecar hooks install
      printf '\n== hooks status ==\n'
      agent-sidecar hooks status
      printf '\n== models list ==\n'
      agent-sidecar models list || true
    } >> "$diag_path" 2>&1
    telemetry_exports="$(agent-sidecar telemetry print-env 2>> "$diag_path")"
    {
      printf '\n== telemetry env ==\n'
      printf '%s\n' "$telemetry_exports"
    } >> "$diag_path"
    eval "$telemetry_exports"
    export AGENT_SIDECAR_REQUIRE_CODING_REFINEMENT=1
    unset AGENT_SIDECAR_REQUIRE_DEEPSEEK_REFINEMENT || true
    unset AGENT_SIDECAR_REQUIRE_DEEPSEEK_CODING || true
    if [[ "$phase" == "baseline" ]]; then
      export AGENT_SIDECAR_PROMPT_INTERCEPT=off
      unset AGENT_SIDECAR_REQUIRE_CODING_REFINEMENT || true
      unset AGENT_SIDECAR_REQUIRE_DEEPSEEK_REFINEMENT || true
      unset AGENT_SIDECAR_REQUIRE_KIMI_CODING || true
      unset AGENT_SIDECAR_BASELINE_SESSION || true
      unset AGENT_SIDECAR_BASELINE_COST_USD || true
      unset AGENT_SIDECAR_BUDGET_USD || true
      unset AGENT_SIDECAR_REQUIRE_BUDGET || true
    else
      unset AGENT_SIDECAR_PROMPT_INTERCEPT || true
      unset AGENT_SIDECAR_BASELINE_SESSION || true
      export AGENT_SIDECAR_REQUIRE_BUDGET=0
      export AGENT_SIDECAR_TARGET_SAVINGS_PCT="${AGENT_SIDECAR_TARGET_SAVINGS_PCT:-10}"
      export AGENT_SIDECAR_BUDGET_WARNING_THRESHOLD_PCT="${AGENT_SIDECAR_BUDGET_WARNING_THRESHOLD_PCT:-80}"
      export AGENT_SIDECAR_BUDGET_ENFORCEMENT="${AGENT_SIDECAR_BUDGET_ENFORCEMENT:-block}"
      if [[ -n "$AGENT_SIDECAR_E2E_BASELINE_COST_USD" ]]; then
        export AGENT_SIDECAR_BASELINE_COST_USD="$AGENT_SIDECAR_E2E_BASELINE_COST_USD"
      else
        unset AGENT_SIDECAR_BASELINE_COST_USD || true
      fi
      preflight_coding_route "http://127.0.0.1:$api_port"
      preflight_deepseek_reasoning_route "http://127.0.0.1:$api_port"
    fi
    {
      printf '\n== claude environment ==\n'
      env | sort | grep -E '^(AGENT_SIDECAR|CLAUDE_CODE|OTEL_)' || true
    } >> "$diag_path" 2>&1

    set +e
    run_claude_session "$label" "$claude_log" "$duration_path" "$repo_dir"
    status=$?
    set -e

    {
      printf '\n== claude result ==\n'
      printf 'exit_code=%s\n' "$status"
      printf 'claude_log_bytes=%s\n' "$(wc -c < "$claude_log" | tr -d ' ')"
      printf '\n== session stop ==\n'
    } >> "$diag_path" 2>&1
    session_output="$(stop_active_session "$repo_dir" 2>> "$diag_path" || true)"
    printf '%s\n' "$session_output" >> "$diag_path"
    session_id="$(printf '%s\n' "$session_output" | tail -n 1)"
    {
      printf 'session_id=%s\n' "$session_id"
      printf '\n== hooks uninstall ==\n'
      agent-sidecar hooks uninstall
    } >> "$diag_path" 2>&1 || true
    save_html_output "$phase" "$html_output" "$repo_dir/boilerplate.html"
    write_e2e_run_meta "$meta_path" "$phase" "$session_id" "$status" "$repo_dir" "$api_port" "$otlp_port" "$claude_log" "$duration_path" "$html_output" "$diag_path"
    return "$status"
  )
}

run_parallel_pair() {
  local baseline_pid sidecar_pid baseline_status sidecar_status

  prepare_run_workspace "baseline" "$BASELINE_WORKDIR"
  prepare_run_workspace "sidecar" "$SIDECAR_WORKDIR"

  section "Run baseline and Sidecar in parallel"
  run_e2e_phase "baseline" "Claude Code: Baseline Run" "$BASELINE_WORKDIR" "$BASELINE_API_PORT" "$BASELINE_OTLP_PORT" "$BASELINE_CLAUDE_LOG" "$BASELINE_DURATION_TXT" "$BASELINE_HTML" "$BASELINE_META_JSON" &
  baseline_pid=$!
  run_e2e_phase "sidecar" "Claude Code: Sidecar Intercepted Run" "$SIDECAR_WORKDIR" "$SIDECAR_API_PORT" "$SIDECAR_OTLP_PORT" "$SIDECAR_CLAUDE_LOG" "$SIDECAR_DURATION_TXT" "$SIDECAR_HTML" "$SIDECAR_META_JSON" &
  sidecar_pid=$!

  set +e
  wait "$baseline_pid"
  baseline_status=$?
  wait "$sidecar_pid"
  sidecar_status=$?
  set -e

  BASELINE_SESSION="$(json_file_field "$BASELINE_META_JSON" session_id)"
  SIDECAR_SESSION="$(json_file_field "$SIDECAR_META_JSON" session_id)"

  if [[ "$baseline_status" -ne 0 || "$sidecar_status" -ne 0 ]]; then
    echo "Paired Claude run failed (baseline=$baseline_status, sidecar=$sidecar_status)." >&2
    exit 1
  fi
  if [[ -z "$BASELINE_SESSION" ]]; then
    echo "Could not determine the baseline session id. Did Claude Code submit a prompt?" >&2
    exit 1
  fi
  if [[ -z "$SIDECAR_SESSION" ]]; then
    echo "Could not determine the Sidecar session id. Did Claude Code submit a prompt?" >&2
    exit 1
  fi
}

require_command python3
ensure_python_env
require_command agent-sidecar
if ! CLAUDE_BIN="$(find_claude_bin)"; then
  echo "Missing required command: claude" >&2
  echo "Install Claude Code or add it to PATH. Checked PATH and $HOME/.local/bin/claude." >&2
  exit 1
fi
prepare_html_fixture
trap cleanup_on_exit EXIT
export AGENT_SIDECAR_REQUIRE_CODING_REFINEMENT=1
unset AGENT_SIDECAR_REQUIRE_DEEPSEEK_REFINEMENT || true
unset AGENT_SIDECAR_REQUIRE_DEEPSEEK_CODING || true
export AGENT_SIDECAR_MODEL_TIMEOUT_MS
export AGENT_SIDECAR_REFINE_TIMEOUT_SECONDS
export AGENT_SIDECAR_MODEL_MAX_TOKENS

if [[ "$SINGLE_RUN" -eq 1 ]]; then
  restart_sidecar_daemon_for_demo

  section "Start Sidecar"
  agent-sidecar start
  agent-sidecar hooks install
  eval "$(agent-sidecar telemetry print-env)"
  agent-sidecar hooks status
  agent-sidecar models list || true
  preflight_coding_route

  restore_html_fixture "single intercepted run"
  unset AGENT_SIDECAR_PROMPT_INTERCEPT
  run_claude_session "Claude Code: Sidecar Intercepted Run" "$SIDECAR_CLAUDE_LOG" "$SIDECAR_DURATION_TXT"
  section "Stop Sidecar Session"
  sidecar_output="$(stop_active_session "$ROOT_DIR")"
  printf '%s\n' "$sidecar_output"
  SIDECAR_SESSION="$(printf '%s\n' "$sidecar_output" | tail -n 1)"
  save_html_output "single intercepted" "$SIDECAR_HTML"
  assert_deterministic_and_coding_model_used "$SIDECAR_SESSION" "$ROOT_DIR"
  section "Open HTML Output"
  open_saved_html_outputs
  section "Inspect Sidecar Run"
  agent-sidecar status || true
  agent-sidecar steer --session "$SIDECAR_SESSION" || true
  agent-sidecar cost show --session "$SIDECAR_SESSION" || true
  echo "Artifacts: $ARTIFACT_DIR"
  echo "boilerplate.html will be reset before exit."
  exit 0
fi

run_parallel_pair
assert_deterministic_and_coding_model_used "$SIDECAR_SESSION" "$SIDECAR_WORKDIR"

section "Inspect Sidecar Run"
(cd "$SIDECAR_WORKDIR" && agent-sidecar status) || true
(cd "$SIDECAR_WORKDIR" && agent-sidecar trace show "$SIDECAR_SESSION") || true
(cd "$SIDECAR_WORKDIR" && agent-sidecar steer --session "$SIDECAR_SESSION") || true
(cd "$SIDECAR_WORKDIR" && agent-sidecar cost show --session "$SIDECAR_SESSION") || true

section "Compare Savings From Raw Telemetry"
raw_telemetry_compare "$BASELINE_SESSION" "$SIDECAR_SESSION" "$BASELINE_WORKDIR" "$SIDECAR_WORKDIR" "$RAW_TELEMETRY_COMPARE_JSON"

section "Compare Execution Time"
compare_execution_time "$BASELINE_DURATION_TXT" "$SIDECAR_DURATION_TXT"

evaluate_implementations_with_deepseek "$BASELINE_HTML" "$SIDECAR_HTML" "$DEEPSEEK_EVAL_JSON"

section "Enforce Measured Cost Savings"
enforce_raw_cost_savings "$RAW_TELEMETRY_COMPARE_JSON"

section "Open HTML Outputs"
open_saved_html_outputs

cat <<EOF

Done.

Run artifacts:
  $ARTIFACT_DIR

Workspaces:
  $BASELINE_WORKDIR
  $SIDECAR_WORKDIR

Baseline HTML:
  $BASELINE_HTML

Sidecar HTML:
  $SIDECAR_HTML

DeepSeek implementation evaluation:
  $DEEPSEEK_EVAL_JSON
  $DEEPSEEK_EVAL_RAW_TXT

Claude logs:
  $BASELINE_CLAUDE_LOG
  $SIDECAR_CLAUDE_LOG

Execution timing:
  $BASELINE_DURATION_TXT
  $SIDECAR_DURATION_TXT

Raw telemetry comparison:
  $RAW_TELEMETRY_COMPARE_JSON

Both generated pages were opened in the browser and left on disk for manual
cleanup. They live under .agent-sidecar/, which is gitignored, so git will not
track them. The tracked root boilerplate.html was not modified.
EOF
