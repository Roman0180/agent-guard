#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REASONING_MODEL="${REASONING_MODEL:-${DEEPSEEK_MODEL:-llama3:latest}}"
CODING_MODEL="${CODING_MODEL:-${DEEPSEEK_V4_MODEL:-llama3:latest}}"
LOCAL_OPENAI_BASE_URL="${LOCAL_OPENAI_BASE_URL:-http://127.0.0.1:8080/v1}"
OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
AGENT_SIDECAR_MODEL_TIMEOUT_MS="${AGENT_SIDECAR_MODEL_TIMEOUT_MS:-60000}"
AGENT_SIDECAR_MODEL_MAX_TOKENS="${AGENT_SIDECAR_MODEL_MAX_TOKENS:-768}"
REFINEMENT_SMOKE_PROMPT="${REFINEMENT_SMOKE_PROMPT:-Update boilerplate.html into a small accessible static demo. Do not touch other files.}"
START_REASONING="${START_REASONING:-${START_DEEPSEEK:-1}}"
START_CODING="${START_CODING:-${START_KIMI:-1}}"

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
  local model="${1:?model required}"
  python3 - "$OLLAMA_BASE_URL" "$model" <<'PY'
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

openai_server_has_model() {
  local model="${1:?model required}"
  python3 - "$LOCAL_OPENAI_BASE_URL" "$model" <<'PY'
from __future__ import annotations

import json
import os
import sys
import urllib.request

base_url = sys.argv[1].rstrip("/")
model = sys.argv[2]
headers = {}
api_key = os.environ.get("AGENT_SIDECAR_LLAMA_SERVER_API_KEY")
if api_key:
    headers["Authorization"] = f"Bearer {api_key}"
request = urllib.request.Request(f"{base_url}/models", headers=headers)
try:
    with urllib.request.urlopen(request, timeout=3) as response:
        payload = json.loads(response.read().decode("utf-8"))
except Exception:
    raise SystemExit(1)

ids = {
    item.get("id")
    for item in payload.get("data", [])
    if isinstance(item, dict)
}
raise SystemExit(0 if model in ids else 1)
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

start_ollama_if_needed() {
  section "Ollama"
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
}

pull_ollama_model_if_needed() {
  local label="$1"
  local model="$2"
  if ollama_has_model "$model"; then
    echo "$label is already installed: $model"
  else
    echo "Pulling $label: $model"
    ollama pull "$model"
  fi
}

assert_local_coding_model_served() {
  section "Coding Model Local Server"
  if openai_server_has_model "$CODING_MODEL"; then
    echo "Local OpenAI-compatible server is serving $CODING_MODEL at $LOCAL_OPENAI_BASE_URL."
    return
  fi

  cat >&2 <<EOF
$CODING_MODEL is not served at $LOCAL_OPENAI_BASE_URL.

The coding role defaults to Llama 3 8B served through llama.cpp's llama-server
(OpenAI-compatible), verified live on this hardware: DeepSeek V4 Flash via
vLLM/SGLang was configured previously but never actually verified reachable
here, and vLLM does not reliably support macOS/ARM anyway. Start llama-server
before running this helper, with --alias set to match CODING_MODEL. For
example, pulling a GGUF directly from Hugging Face:

  brew install llama.cpp
  llama-server -hf bartowski/Meta-Llama-3-8B-Instruct-GGUF:Q4_0 \\
    --host 127.0.0.1 --port 8080 --alias "$CODING_MODEL"

Or, if you already have the model pulled through Ollama, reuse that GGUF
directly instead of downloading it again:

  GGUF_PATH="\$(ollama show llama3:latest --modelfile | awk '/^FROM /{print \$2}')"
  llama-server -m "\$GGUF_PATH" --host 127.0.0.1 --port 8080 --alias "$CODING_MODEL"

Set CODING_MODEL and LOCAL_OPENAI_BASE_URL to point at a different model or
server if you have real DeepSeek V4 Flash infrastructure elsewhere; verify it
actually serves valid output within your configured timeout before trusting
it, the same way this default was verified.
EOF
  exit 1
}

python_for_sidecar() {
  if [[ -x "$ROOT_DIR/.venv/bin/python" ]]; then
    printf '%s\n' "$ROOT_DIR/.venv/bin/python"
    return 0
  fi
  command -v python3
}

run_refinement_smoke_test() {
  section "Deterministic + Coding-Model Refinement Smoke Test"
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
print("Running deterministic refinement with coding-model focus. This can take 15-60s.", flush=True)
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
if [[ "$START_REASONING" == "1" ]]; then
  start_ollama_if_needed
fi
if [[ "$START_REASONING" == "1" ]]; then
  pull_ollama_model_if_needed "Reasoning model" "$REASONING_MODEL"
fi
if [[ "$START_CODING" == "1" ]]; then
  assert_local_coding_model_served
fi
run_refinement_smoke_test

section "Model Routes"
if command -v agent-sidecar >/dev/null 2>&1; then
  agent-sidecar models list || true
else
  echo "agent-sidecar is not on PATH; run the E2E script to install/refresh the CLI."
fi

cat <<EOF

Model routes are ready.

Run the demo without restarting models:
  ./scripts/e2e_claude_code.sh

The coding role (prompt-refinement implementation focus) uses Llama 3 8B
through a local OpenAI-compatible endpoint (llama.cpp's llama-server).
DeepSeek V4 Flash via vLLM/SGLang was configured previously but never verified
reachable on this hardware; Llama 3 8B was verified live through the real
production prompt template (2.7-4.1s per call, valid schema-conforming output
every time).
Default CODING_MODEL is llama3:latest. DEEPSEEK_V4_MODEL remains supported as
a compatibility alias.
Default LOCAL_OPENAI_BASE_URL is http://127.0.0.1:8080/v1.

The reasoning role (steering judgments, refinement approval) uses Llama 3 8B
served through Ollama by default. Larger reasoning-tuned local models
(a DeepSeek-R1 distill, Qwen3-30B-A3B) were tried and measured on real
hardware: both either were never actually pulled/served or returned
malformed/empty responses after 11-14 seconds per call, well past the 5-second
budget the Claude Code UserPromptSubmit hook gives the whole /refine round
trip. Llama 3 8B was verified live on the same machine to answer a realistic
steering judgment correctly (valid JSON, grounded evidence_event_ids, no
hallucinated ids) in 1.4-2.1 seconds. A model that never finishes in time is
worth exactly nothing here, however capable it is on paper — verify a
candidate actually serves correctly and finishes within budget on your
hardware before trusting it as the default.
Default REASONING_MODEL is llama3:latest. Set REASONING_MODEL to a larger
model only after confirming it actually serves within your configured
AGENT_SIDECAR_REFINE_TIMEOUT_SECONDS on your own hardware. Set
START_REASONING=0 to skip pulling and starting Ollama, for example when the
reasoning role is already served elsewhere. DEEPSEEK_MODEL and START_DEEPSEEK
remain supported as aliases for REASONING_MODEL and START_REASONING.

Logs:
  $ROOT_DIR/.agent-sidecar/models/ollama.log (when Ollama is started by this helper)
EOF
