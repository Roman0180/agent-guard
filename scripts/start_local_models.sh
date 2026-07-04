#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEEPSEEK_MODEL="${DEEPSEEK_MODEL:-deepseek-r1:8b}"
KIMI_MODEL="${KIMI_MODEL:-kimi-linear-48b-a3b}"
KIMI_MODEL_DIR="${KIMI_MODEL_DIR:-$ROOT_DIR/.agent-sidecar/models/$KIMI_MODEL}"
KIMI_GGUF_PATH="${KIMI_GGUF_PATH:-}"
KIMI_HOST="${KIMI_HOST:-127.0.0.1}"
KIMI_PORT="${KIMI_PORT:-8080}"
KIMI_CTX_SIZE="${KIMI_CTX_SIZE:-512}"
OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
KIMI_BASE_URL="${KIMI_BASE_URL:-http://$KIMI_HOST:$KIMI_PORT/v1}"
AGENT_SIDECAR_MODEL_TIMEOUT_MS="${AGENT_SIDECAR_MODEL_TIMEOUT_MS:-60000}"
AGENT_SIDECAR_MODEL_MAX_TOKENS="${AGENT_SIDECAR_MODEL_MAX_TOKENS:-768}"
REFINEMENT_SMOKE_PROMPT="${REFINEMENT_SMOKE_PROMPT:-Update boilerplate.html into a small accessible static demo. Do not touch other files.}"
START_DEEPSEEK="${START_DEEPSEEK:-0}"

section() {
  printf '\n== %s ==\n' "$1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

http_ok() {
  python3 - "$1" <<'PY'
from __future__ import annotations

import sys
import urllib.request

try:
    with urllib.request.urlopen(sys.argv[1], timeout=1) as response:
        raise SystemExit(0 if 200 <= response.status < 500 else 1)
except Exception:
    raise SystemExit(1)
PY
}

ollama_has_model() {
  python3 - "$OLLAMA_BASE_URL" "$DEEPSEEK_MODEL" <<'PY'
from __future__ import annotations

import json
import sys
import urllib.request

base_url = sys.argv[1].rstrip("/")
model = sys.argv[2]
try:
    with urllib.request.urlopen(f"{base_url}/api/tags", timeout=3) as response:
        payload = json.loads(response.read().decode("utf-8"))
except Exception:
    raise SystemExit(1)

models = {
    item.get("name") or item.get("model")
    for item in payload.get("models", [])
    if isinstance(item, dict)
}
raise SystemExit(0 if model in models or (":" not in model and f"{model}:latest" in models) else 1)
PY
}

kimi_is_served() {
  python3 - "$KIMI_BASE_URL" "$KIMI_MODEL" <<'PY'
from __future__ import annotations

import json
import sys
import urllib.request

base_url = sys.argv[1].rstrip("/")
model = sys.argv[2]
try:
    with urllib.request.urlopen(f"{base_url}/models", timeout=3) as response:
        payload = json.loads(response.read().decode("utf-8"))
except Exception:
    raise SystemExit(1)

models = {
    item.get("id")
    for item in payload.get("data", [])
    if isinstance(item, dict)
}
raise SystemExit(0 if model in models else 1)
PY
}

wait_for_url() {
  local label="$1"
  local url="$2"
  local timeout_s="${3:-30}"
  local deadline=$((SECONDS + timeout_s))
  while (( SECONDS < deadline )); do
    if http_ok "$url"; then
      echo "$label is reachable."
      return 0
    fi
    sleep 1
  done
  echo "$label did not become reachable at $url within ${timeout_s}s." >&2
  return 1
}

resolve_kimi_gguf() {
  if [[ -n "$KIMI_GGUF_PATH" ]]; then
    printf '%s\n' "$KIMI_GGUF_PATH"
    return 0
  fi
  local found
  found="$(find "$KIMI_MODEL_DIR" -maxdepth 1 -type f -name '*.gguf' 2>/dev/null | head -n 1 || true)"
  if [[ -n "$found" ]]; then
    printf '%s\n' "$found"
    return 0
  fi
  return 1
}

start_ollama_if_needed() {
  section "Ollama / DeepSeek"
  require_command ollama
  if http_ok "$OLLAMA_BASE_URL/api/tags"; then
    echo "Ollama is already reachable at $OLLAMA_BASE_URL."
  else
    mkdir -p "$ROOT_DIR/.agent-sidecar/models"
    echo "Starting Ollama in the background."
    nohup ollama serve > "$ROOT_DIR/.agent-sidecar/models/ollama.log" 2>&1 &
    echo "$!" > "$ROOT_DIR/.agent-sidecar/models/ollama.pid"
    wait_for_url "Ollama" "$OLLAMA_BASE_URL/api/tags" 30
  fi

  if ollama_has_model; then
    echo "DeepSeek is already installed: $DEEPSEEK_MODEL"
  else
    echo "Pulling DeepSeek model: $DEEPSEEK_MODEL"
    ollama pull "$DEEPSEEK_MODEL"
  fi
}

start_kimi_if_needed() {
  section "Kimi llama-server"
  if kimi_is_served; then
    echo "Kimi is already served at $KIMI_BASE_URL as $KIMI_MODEL."
    return 0
  fi

  require_command llama-server
  local gguf_path
  if ! gguf_path="$(resolve_kimi_gguf)"; then
    echo "Could not find a Kimi GGUF file." >&2
    echo "Set KIMI_GGUF_PATH=/path/to/kimi.gguf or place a .gguf under $KIMI_MODEL_DIR." >&2
    exit 1
  fi

  mkdir -p "$KIMI_MODEL_DIR"
  echo "Starting llama-server for $KIMI_MODEL."
  echo "Model: $gguf_path"
  nohup llama-server \
    --model "$gguf_path" \
    --alias "$KIMI_MODEL" \
    --ctx-size "$KIMI_CTX_SIZE" \
    --host "$KIMI_HOST" \
    --port "$KIMI_PORT" \
    > "$KIMI_MODEL_DIR/llama-server.log" 2>&1 &
  echo "$!" > "$KIMI_MODEL_DIR/llama-server.pid"

  wait_for_url "Kimi llama-server" "$KIMI_BASE_URL/models" 45
  if ! kimi_is_served; then
    echo "llama-server is reachable, but $KIMI_MODEL is not listed at $KIMI_BASE_URL/models." >&2
    echo "See $KIMI_MODEL_DIR/llama-server.log" >&2
    exit 1
  fi
  echo "Kimi is served at $KIMI_BASE_URL as $KIMI_MODEL."
}

python_for_sidecar() {
  if [[ -x "$ROOT_DIR/.venv/bin/python" ]]; then
    printf '%s\n' "$ROOT_DIR/.venv/bin/python"
    return 0
  fi
  command -v python3
}

run_refinement_smoke_test() {
  section "Deterministic + Kimi Refinement Smoke Test"
  local python_bin
  python_bin="$(python_for_sidecar)"
  AGENT_SIDECAR_MODEL_TIMEOUT_MS="$AGENT_SIDECAR_MODEL_TIMEOUT_MS" \
    AGENT_SIDECAR_MODEL_MAX_TOKENS="$AGENT_SIDECAR_MODEL_MAX_TOKENS" \
    PYTHONPATH="$ROOT_DIR/src${PYTHONPATH:+:$PYTHONPATH}" \
    "$python_bin" - "$ROOT_DIR" "$REFINEMENT_SMOKE_PROMPT" <<'PY'
from __future__ import annotations

import sys
import time
from pathlib import Path

try:
    from agent_sidecar.intel.refiner import refine_prompt
    from agent_sidecar.models.provider import LiteLLMModelProvider
except ModuleNotFoundError as error:
    print(f"Could not import Agent Sidecar Python modules: {error}", file=sys.stderr)
    print("Run the E2E script once without --skip-install, or install the package into .venv.", file=sys.stderr)
    raise SystemExit(1) from error

root = Path(sys.argv[1])
prompt = sys.argv[2]
provider = LiteLLMModelProvider(root)
started = time.monotonic()
print("Running deterministic refinement with Kimi coding focus. This can take 15-60s.", flush=True)
try:
    result, _events = refine_prompt(
        prompt,
        repo_path=root,
        provider=provider,
        require_coding_refinement=True,
        record_prompt_submitted=False,
    )
except Exception as error:
    print(f"Refinement smoke test failed: {error}", file=sys.stderr)
    raise SystemExit(1) from error

elapsed = time.monotonic() - started
if result.source != "deterministic-then-coding":
    print(f"Refinement smoke test returned source={result.source!r}; expected 'deterministic-then-coding'.", file=sys.stderr)
    raise SystemExit(1)

summary = " ".join(result.refined_prompt.split())
if len(summary) > 180:
    summary = summary[:177].rstrip() + "..."
print(f"Refinement smoke test ok in {elapsed:.1f}s: source={result.source}")
print(f"Prompt contract: {summary}")
PY
}

cd "$ROOT_DIR"
if [[ "$START_DEEPSEEK" == "1" ]]; then
  start_ollama_if_needed
fi
start_kimi_if_needed
run_refinement_smoke_test

section "Model Routes"
if command -v agent-sidecar >/dev/null 2>&1; then
  agent-sidecar models list || true
else
  echo "agent-sidecar is not on PATH; run the E2E script to install/refresh the CLI."
fi

cat <<EOF

Local models are ready.

Run the demo without restarting models:
  ./scripts/e2e_claude_code.sh

DeepSeek prompt refinement is not used by default. The paired e2e script still
requires DeepSeek for post-run implementation evaluation; rerun this helper with
START_DEEPSEEK=1 if you are preparing for that flow.

Logs:
  $ROOT_DIR/.agent-sidecar/models/ollama.log (only when START_DEEPSEEK=1)
  $KIMI_MODEL_DIR/llama-server.log
EOF
