#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="$ROOT_DIR/.venv"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
ARTIFACT_ROOT="${AGENT_SIDECAR_SWEBENCH_WORKDIR:-$ROOT_DIR/.agent-sidecar/swebench-lite/$RUN_ID}"
TASKS_JSONL="$ARTIFACT_ROOT/tasks.jsonl"
RESULTS_JSONL="$ARTIFACT_ROOT/results.jsonl"
RESULTS_CSV="$ARTIFACT_ROOT/results.csv"
SUMMARY_JSON="$ARTIFACT_ROOT/summary.json"
SUMMARY_TXT="$ARTIFACT_ROOT/summary.txt"
PREDICTIONS_DIR="$ARTIFACT_ROOT/predictions"
BASELINE_PREDICTIONS_JSONL="$PREDICTIONS_DIR/baseline.predictions.jsonl"
SIDECAR_PREDICTIONS_JSONL="$PREDICTIONS_DIR/sidecar.predictions.jsonl"
GRADER_DIR="$ARTIFACT_ROOT/grader"
GRADING_JSON="$ARTIFACT_ROOT/grading.json"
REPO_CACHE_DIR="${AGENT_SIDECAR_SWEBENCH_REPO_CACHE:-$ROOT_DIR/.agent-sidecar/swebench-lite/repo-cache}"

DATASET="${SWEBENCH_DATASET:-princeton-nlp/SWE-bench_Lite}"
SPLIT="${SWEBENCH_SPLIT:-test}"
LIMIT="${SWEBENCH_COUNT:-${SWEBENCH_LIMIT:-3}}"
OFFSET="${SWEBENCH_OFFSET:-0}"
INSTANCE_IDS="${SWEBENCH_INSTANCE_IDS:-}"
INSTANCE_FILE="${SWEBENCH_INSTANCE_FILE:-}"
LIMIT_EXPLICIT=0
OFFSET_EXPLICIT=0
INSTANCE_SELECTION_EXPLICIT=0
if [[ -n "${SWEBENCH_COUNT:-}${SWEBENCH_LIMIT:-}" ]]; then
  LIMIT_EXPLICIT=1
fi
if [[ -n "${SWEBENCH_OFFSET:-}" ]]; then
  OFFSET_EXPLICIT=1
fi
if [[ -n "$INSTANCE_IDS$INSTANCE_FILE" ]]; then
  INSTANCE_SELECTION_EXPLICIT=1
fi
CLAUDE_MODEL="${CLAUDE_MODEL:-opus}"
CLAUDE_PERMISSION_MODE="${CLAUDE_PERMISSION_MODE:-bypassPermissions}"
CLAUDE_EXTRA_ARGS="${CLAUDE_EXTRA_ARGS:-}"
CLAUDE_DEBUG="${CLAUDE_DEBUG:-0}"
BASE_API_PORT="${AGENT_SIDECAR_SWEBENCH_API_PORT:-17433}"
BASE_OTLP_PORT="${AGENT_SIDECAR_SWEBENCH_OTLP_PORT:-14318}"
BASE_CLAUDE_SSE_PORT="${AGENT_SIDECAR_SWEBENCH_CLAUDE_SSE_PORT:-19500}"
AGENT_SIDECAR_MODEL_TIMEOUT_MS="${AGENT_SIDECAR_MODEL_TIMEOUT_MS:-60000}"
AGENT_SIDECAR_REFINE_TIMEOUT_SECONDS="${AGENT_SIDECAR_REFINE_TIMEOUT_SECONDS:-75}"
AGENT_SIDECAR_MODEL_MAX_TOKENS="${AGENT_SIDECAR_MODEL_MAX_TOKENS:-768}"
RUN_GRADER="${SWEBENCH_RUN_GRADER:-1}"
GRADER_MAX_WORKERS="${SWEBENCH_GRADER_MAX_WORKERS:-2}"
GRADER_TIMEOUT="${SWEBENCH_GRADER_TIMEOUT:-1800}"
GRADER_CACHE_LEVEL="${SWEBENCH_GRADER_CACHE_LEVEL:-env}"
GRADER_CLEAN="${SWEBENCH_GRADER_CLEAN:-false}"
BASELINE_GRADER_MODEL="agent-sidecar-baseline"
SIDECAR_GRADER_MODEL="agent-sidecar-sidecar"
BASELINE_GRADER_RUN_ID="${RUN_ID}-baseline"
SIDECAR_GRADER_RUN_ID="${RUN_ID}-sidecar"

SKIP_INSTALL=0
REQUIRE_CODING=1
ALLOW_REFINEMENT_FALLBACK="${SWEBENCH_ALLOW_REFINEMENT_FALLBACK:-1}"
FAIL_FAST=0
INCLUDE_HINTS=0
DRY_RUN=0
PARALLEL_TASKS="${SWEBENCH_PARALLEL_TASKS:-4}"

append_instance_ids() {
  local value="$1"
  if [[ -z "$INSTANCE_IDS" ]]; then
    INSTANCE_IDS="$value"
  else
    INSTANCE_IDS="$INSTANCE_IDS,$value"
  fi
  INSTANCE_SELECTION_EXPLICIT=1
}

usage() {
  cat <<'EOF'
Run paired Claude Code baseline vs Agent Sidecar runs on SWE-bench Lite tasks and report token savings.

The script creates fresh task checkouts under .agent-sidecar/swebench-lite/<timestamp>/,
runs Claude Code once with prompt interception disabled and once with Sidecar interception enabled
in parallel for each task, runs multiple tasks concurrently (see --parallel), grades both
prediction sets concurrently, then computes average token savings from Claude telemetry
captured by Agent Sidecar.

Usage:
  scripts/swebench_lite_token_savings.sh [options]

Options:
  --count N             Number of SWE-bench Lite tasks to run. Default: 3
  --limit N             Alias for --count.
  --offset N            Dataset offset before applying --count. Default: 0
  --test ID             SWE-bench instance id to run. Repeatable.
  --tests CSV           Comma-separated SWE-bench instance ids to run, in order.
  --instances CSV       Alias for --tests.
  --test-file PATH      File containing one SWE-bench instance id per line.
  --instance-file PATH  Alias for --test-file.
  --dataset NAME        Hugging Face dataset name. Default: princeton-nlp/SWE-bench_Lite
  --split NAME          Dataset split. Default: test
  --claude-model NAME   Claude Code model. Default: $CLAUDE_MODEL or opus
  --permission-mode MODE
                        Claude Code permission mode. Default: bypassPermissions.
                        SWE-bench runs happen in disposable checkouts, so this avoids
                        non-interactive tool approval denials. Use acceptEdits/manual
                        for safer debugging runs.
  --require-kimi-coding
                        Deprecated alias for --require-coding-refinement.
  --require-coding-refinement
                        Use the configured local coding-model refinement path for Sidecar runs.
                        Default: on, with deterministic fallback if the coding model is unavailable.
  --require-kimi        Deprecated alias for --require-coding-refinement.
  --require-deepseek-coding
                        Deprecated alias for --require-coding-refinement.
  --skip-model-refinement | --no-model-refinement
                        Use deterministic Sidecar refinement only.
  --strict-model-refinement
                        Stop Sidecar runs if required coding-model refinement fails.
  --include-hints       Include SWE-bench hints_text in prompts. Default: off
  --claude-debug        Write Claude Code debug logs for each phase.
  --skip-grading        Do not run the SWE-bench Docker grader. Default: grading on.
  --grading-max-workers N
                        Max SWE-bench evaluation workers per phase. Default: 2.
  --grading-timeout S   Per-instance SWE-bench grader timeout in seconds. Default: 1800.
  --grading-cache-level LEVEL
                        SWE-bench Docker cache level: none, base, env, or instance. Default: env.
  --grading-clean BOOL  Pass through to SWE-bench --clean. Default: false.
  --skip-install        Reuse the existing Python environment.
  --dry-run             Download/select tasks and write prompts, but do not run Claude.
  --fail-fast           Stop launching new tasks on the first failed Claude/session run;
                        tasks already in flight are allowed to finish before exiting.
  --parallel N          Max SWE-bench tasks to run concurrently. Each task already runs its
                        baseline and Sidecar Claude Code processes in parallel, so this is a
                        multiplier of 2 on concurrent live Claude Code sessions, Sidecar
                        daemons, and SWE-bench grader containers. Default: 4
  -h, --help            Show this help.

Environment:
  CLAUDE_MODEL                       Claude Code model. Default: opus
  CLAUDE_PERMISSION_MODE             Claude Code permission mode. Default: bypassPermissions
  CLAUDE_EXTRA_ARGS                  Extra args passed to `claude -p`.
  CLAUDE_DEBUG                       Set to 1 to write Claude debug logs.
  SWEBENCH_RUN_GRADER                Set to 0 to skip SWE-bench grading. Default: 1
  SWEBENCH_GRADER_MAX_WORKERS        SWE-bench grader workers per phase. Default: 2
  SWEBENCH_GRADER_TIMEOUT            Grader timeout per instance in seconds. Default: 1800
  SWEBENCH_GRADER_CACHE_LEVEL        Grader cache level. Default: env
  SWEBENCH_GRADER_CLEAN              Grader clean flag. Default: false
  SWEBENCH_ALLOW_REFINEMENT_FALLBACK Set to 0 to make coding-model refinement failure stop Sidecar runs.
                                      Default: 1
  SWEBENCH_PARALLEL_TASKS            Max concurrent SWE-bench tasks. Default: 4
  AGENT_SIDECAR_SWEBENCH_WORKDIR     Artifact directory override.
  AGENT_SIDECAR_SWEBENCH_REPO_CACHE  Bare git mirror cache directory override.
  AGENT_SIDECAR_SWEBENCH_API_PORT    Starting Sidecar API port. The harness probes upward from per-phase offsets.
  AGENT_SIDECAR_SWEBENCH_OTLP_PORT   Starting Sidecar OTLP port. The harness probes upward from per-phase offsets.
  AGENT_SIDECAR_SWEBENCH_CLAUDE_SSE_PORT
                                      Starting Claude Code SSE port. The harness probes upward from per-phase offsets.
  SWEBENCH_COUNT / SWEBENCH_LIMIT / SWEBENCH_OFFSET / SWEBENCH_INSTANCE_IDS / SWEBENCH_INSTANCE_FILE
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --count|--limit)
      LIMIT="${2:?missing value for $1}"
      LIMIT_EXPLICIT=1
      shift
      ;;
    --offset)
      OFFSET="${2:?missing value for --offset}"
      OFFSET_EXPLICIT=1
      shift
      ;;
    --test|--instance)
      append_instance_ids "${2:?missing value for $1}"
      shift
      ;;
    --tests|--instances)
      append_instance_ids "${2:?missing value for $1}"
      shift
      ;;
    --test-file|--instance-file)
      INSTANCE_FILE="${2:?missing value for $1}"
      INSTANCE_SELECTION_EXPLICIT=1
      shift
      ;;
    --dataset)
      DATASET="${2:?missing value for --dataset}"
      shift
      ;;
    --split)
      SPLIT="${2:?missing value for --split}"
      shift
      ;;
    --claude-model)
      CLAUDE_MODEL="${2:?missing value for --claude-model}"
      shift
      ;;
    --permission-mode)
      CLAUDE_PERMISSION_MODE="${2:?missing value for --permission-mode}"
      shift
      ;;
    --require-coding-refinement|--require-kimi-coding|--require-kimi|--require-deepseek-coding)
      REQUIRE_CODING=1
      ;;
    --skip-model-refinement|--no-model-refinement)
      REQUIRE_CODING=0
      ;;
    --strict-model-refinement)
      ALLOW_REFINEMENT_FALLBACK=0
      ;;
    --include-hints)
      INCLUDE_HINTS=1
      ;;
    --claude-debug)
      CLAUDE_DEBUG=1
      ;;
    --skip-grading)
      RUN_GRADER=0
      ;;
    --grading-max-workers)
      GRADER_MAX_WORKERS="${2:?missing value for --grading-max-workers}"
      shift
      ;;
    --grading-timeout)
      GRADER_TIMEOUT="${2:?missing value for --grading-timeout}"
      shift
      ;;
    --grading-cache-level)
      GRADER_CACHE_LEVEL="${2:?missing value for --grading-cache-level}"
      shift
      ;;
    --grading-clean)
      GRADER_CLEAN="${2:?missing value for --grading-clean}"
      shift
      ;;
    --skip-install)
      SKIP_INSTALL=1
      ;;
    --dry-run)
      DRY_RUN=1
      ;;
    --fail-fast)
      FAIL_FAST=1
      ;;
    --parallel|--parallel-tasks)
      PARALLEL_TASKS="${2:?missing value for $1}"
      shift
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

validate_selection() {
  if ! [[ "$LIMIT" =~ ^[0-9]+$ ]] || [[ "$LIMIT" -lt 1 ]]; then
    echo "--count/--limit must be a positive integer; got: $LIMIT" >&2
    exit 2
  fi
  if ! [[ "$OFFSET" =~ ^[0-9]+$ ]]; then
    echo "--offset must be a non-negative integer; got: $OFFSET" >&2
    exit 2
  fi
  if [[ "$INSTANCE_SELECTION_EXPLICIT" -eq 1 && ( "$LIMIT_EXPLICIT" -eq 1 || "$OFFSET_EXPLICIT" -eq 1 ) ]]; then
    echo "Choose either exact tests (--test/--tests/--test-file) or a count (--count/--limit with optional --offset), not both." >&2
    exit 2
  fi
  if [[ "$RUN_GRADER" != "0" && "$RUN_GRADER" != "1" ]]; then
    echo "SWEBENCH_RUN_GRADER must be 0 or 1; got: $RUN_GRADER" >&2
    exit 2
  fi
  if ! [[ "$GRADER_MAX_WORKERS" =~ ^[0-9]+$ ]] || [[ "$GRADER_MAX_WORKERS" -lt 1 ]]; then
    echo "--grading-max-workers must be a positive integer; got: $GRADER_MAX_WORKERS" >&2
    exit 2
  fi
  if ! [[ "$GRADER_TIMEOUT" =~ ^[0-9]+$ ]] || [[ "$GRADER_TIMEOUT" -lt 1 ]]; then
    echo "--grading-timeout must be a positive integer; got: $GRADER_TIMEOUT" >&2
    exit 2
  fi
  case "$GRADER_CACHE_LEVEL" in
    none|base|env|instance) ;;
    *)
      echo "--grading-cache-level must be one of: none, base, env, instance; got: $GRADER_CACHE_LEVEL" >&2
      exit 2
      ;;
  esac
  case "$GRADER_CLEAN" in
    true|false|True|False|1|0) ;;
    *)
      echo "--grading-clean must be a SWE-bench boolean value; got: $GRADER_CLEAN" >&2
      exit 2
      ;;
  esac
  if ! [[ "$PARALLEL_TASKS" =~ ^[0-9]+$ ]] || [[ "$PARALLEL_TASKS" -lt 1 ]]; then
    echo "--parallel must be a positive integer; got: $PARALLEL_TASKS" >&2
    exit 2
  fi
}

validate_selection

cd "$ROOT_DIR"

section() {
  printf '\n== %s ==\n' "$1"
}

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

now_ms() {
  python3 - <<'PY'
from __future__ import annotations

import time

print(time.monotonic_ns() // 1_000_000)
PY
}

find_available_port() {
  local start_port="$1"
  python3 - "$start_port" <<'PY'
from __future__ import annotations

import socket
import sys

start = int(sys.argv[1])
for port in range(start, 65535):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            continue
        print(port)
        raise SystemExit(0)
raise SystemExit(f"No available TCP port found at or above {start}")
PY
}

ensure_python_env() {
  if [[ "$SKIP_INSTALL" -eq 1 ]]; then
    if [[ -f "$VENV_DIR/bin/activate" ]]; then
      # shellcheck disable=SC1091
      source "$VENV_DIR/bin/activate"
    fi
  else
    if [[ ! -x "$VENV_DIR/bin/python" ]]; then
      section "Create Python venv"
      python3 -m venv "$VENV_DIR"
    fi

    # shellcheck disable=SC1091
    source "$VENV_DIR/bin/activate"

    section "Install/Refresh Agent Sidecar"
    python -m pip install ".[dev]"
    python -m pip install "datasets>=2.19"
    if [[ "$RUN_GRADER" -eq 1 && "$DRY_RUN" -eq 0 ]]; then
      python -m pip install "swebench"
    fi
    python -m pip uninstall -y agent-sidecar >/dev/null 2>&1 || true
    rm -rf "$VENV_DIR"/lib/python*/site-packages/agent_sidecar
    rm -rf "$VENV_DIR"/lib/python*/site-packages/agent_sidecar-*.dist-info
    rm -f "$VENV_DIR/bin/agent-sidecar"
    python -m pip install --no-deps --no-cache-dir --force-reinstall .
  fi

  local require_swebench="$RUN_GRADER"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    require_swebench=0
  fi
  SWEBENCH_RUN_GRADER="$require_swebench" python - <<'PY'
from __future__ import annotations

import os

try:
    import datasets  # noqa: F401
except ModuleNotFoundError as error:
    raise SystemExit("Missing Python package `datasets`; rerun without --skip-install or install it in the active env.") from error

if os.environ.get("SWEBENCH_RUN_GRADER") == "1":
    try:
        import swebench  # noqa: F401
    except ModuleNotFoundError as error:
        raise SystemExit("Missing Python package `swebench`; rerun without --skip-install, install swebench in the active env, or pass --skip-grading.") from error
PY
}

ensure_grader_available() {
  if [[ "$RUN_GRADER" -ne 1 || "$DRY_RUN" -eq 1 ]]; then
    return
  fi
  require_command docker
  if ! docker info >/dev/null 2>&1; then
    echo "Docker is required for SWE-bench grading, but the Docker daemon is unavailable." >&2
    echo "Start Docker or pass --skip-grading." >&2
    exit 1
  fi
}

export_tasks() {
  section "Load SWE-bench Lite Tasks"
  mkdir -p "$ARTIFACT_ROOT"
  SWEBENCH_DATASET="$DATASET" \
  SWEBENCH_SPLIT="$SPLIT" \
  SWEBENCH_LIMIT="$LIMIT" \
  SWEBENCH_OFFSET="$OFFSET" \
  SWEBENCH_INSTANCE_IDS="$INSTANCE_IDS" \
  SWEBENCH_INSTANCE_FILE="$INSTANCE_FILE" \
  python - "$TASKS_JSONL" <<'PY'
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from datasets import load_dataset

output = Path(sys.argv[1])
dataset_name = os.environ["SWEBENCH_DATASET"]
split = os.environ["SWEBENCH_SPLIT"]
limit = int(os.environ["SWEBENCH_LIMIT"])
offset = int(os.environ["SWEBENCH_OFFSET"])
instance_ids: list[str] = []
seen_instance_ids: set[str] = set()


def add_instance_id(raw: str) -> None:
    value = raw.strip()
    if not value or value in seen_instance_ids:
        return
    seen_instance_ids.add(value)
    instance_ids.append(value)


for value in os.environ.get("SWEBENCH_INSTANCE_IDS", "").split(","):
    add_instance_id(value)

instance_file = os.environ.get("SWEBENCH_INSTANCE_FILE", "").strip()
if instance_file:
    for line in Path(instance_file).read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        add_instance_id(line)

dataset = load_dataset(dataset_name, split=split)
if instance_ids:
    requested = set(instance_ids)
    rows_by_id = {}
    for row in dataset:
        instance_id = str(row.get("instance_id") or "")
        if instance_id in requested and instance_id not in rows_by_id:
            rows_by_id[instance_id] = dict(row)
    missing = [instance_id for instance_id in instance_ids if instance_id not in rows_by_id]
    if missing:
        raise SystemExit(
            f"Requested SWE-bench instance ids were not found in {dataset_name}:{split}: "
            + ", ".join(missing)
        )
    rows = [rows_by_id[instance_id] for instance_id in instance_ids]
else:
    rows = []
    for row_index, row in enumerate(dataset):
        if row_index < offset:
            continue
        if len(rows) >= limit:
            break
        rows.append(dict(row))

if not rows:
    raise SystemExit("No SWE-bench tasks selected.")

output.parent.mkdir(parents=True, exist_ok=True)
with output.open("w", encoding="utf-8") as handle:
    for row in rows:
        handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")

print(f"Selected {len(rows)} tasks from {dataset_name}:{split}")
for row in rows:
    print(f"- {row.get('instance_id')}  {row.get('repo')}  {row.get('base_commit')}")
PY
}

json_field() {
  local task_json="$1"
  local field="$2"
  python - "$task_json" "$field" <<'PY'
from __future__ import annotations

import json
import sys

row = json.loads(sys.argv[1])
value = row.get(sys.argv[2], "")
print("" if value is None else value)
PY
}

safe_name() {
  python - "$1" <<'PY'
from __future__ import annotations

import re
import sys

print(re.sub(r"[^A-Za-z0-9_.-]+", "_", sys.argv[1]).strip("_") or "task")
PY
}

write_prompt() {
  local task_json="$1"
  local prompt_path="$2"
  SWEBENCH_INCLUDE_HINTS="$INCLUDE_HINTS" python - "$task_json" "$prompt_path" <<'PY'
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

row = json.loads(sys.argv[1])
prompt_path = Path(sys.argv[2])
include_hints = os.environ.get("SWEBENCH_INCLUDE_HINTS") == "1"

parts = [
    f"You are solving SWE-bench Lite instance {row.get('instance_id')} in repository {row.get('repo')}.",
    f"The checkout is reset to base commit {row.get('base_commit')}.",
    "",
    "Implement the minimal code change that resolves the GitHub issue below.",
    "Preserve unrelated behavior. Avoid broad refactors. Do not use oracle patches or modify tests unless the issue explicitly requires it.",
    "Run the most relevant existing validation you can within the time budget. If full validation is too expensive, run a targeted check and report exactly what was and was not run.",
    "",
    "GitHub issue:",
    str(row.get("problem_statement") or "").strip(),
]
if include_hints and row.get("hints_text"):
    parts.extend(["", "SWE-bench hints:", str(row.get("hints_text") or "").strip()])

prompt_path.parent.mkdir(parents=True, exist_ok=True)
prompt_path.write_text("\n".join(parts).strip() + "\n", encoding="utf-8")
PY
}

ensure_repo_cache() {
  # Guarded by a mkdir-based spinlock (portable to bash 3.2 / no flock(1) on macOS) because
  # parallel tasks can select multiple SWE-bench instances from the same repo; without this,
  # two tasks racing to `git clone --mirror` the same not-yet-cached repo would corrupt it.
  local repo="$1"
  local cache="$REPO_CACHE_DIR/${repo//\//__}.git"
  local lock_dir="$REPO_CACHE_DIR/.lock.${repo//\//__}"
  local waited=0 clone_status

  mkdir -p "$REPO_CACHE_DIR"
  while ! mkdir "$lock_dir" 2>/dev/null; do
    sleep 0.2
    waited=$((waited + 1))
    if [[ "$waited" -gt 1500 ]]; then
      echo "Timed out waiting for repo cache lock: $repo" >&2
      return 1
    fi
  done

  set +e
  (
    if [[ -d "$cache" ]]; then
      git -C "$cache" fetch --all --tags --prune
    else
      git clone --mirror "https://github.com/$repo.git" "$cache"
    fi
  )
  clone_status=$?
  set -e

  rmdir "$lock_dir" 2>/dev/null || true

  if [[ "$clone_status" -ne 0 ]]; then
    return "$clone_status"
  fi
  printf '%s\n' "$cache"
}

prepare_checkout() {
  local repo="$1"
  local base_commit="$2"
  local destination="$3"
  local cache="$4"
  rm -rf "$destination"
  git clone "$cache" "$destination"
  git -C "$destination" remote set-url origin "https://github.com/$repo.git"
  git -C "$destination" checkout --detach "$base_commit"
  git -C "$destination" reset --hard "$base_commit"
  git -C "$destination" clean -fdx
  if [[ -f "$ROOT_DIR/.agent-sidecar/config.json" ]]; then
    mkdir -p "$destination/.agent-sidecar"
    cp "$ROOT_DIR/.agent-sidecar/config.json" "$destination/.agent-sidecar/config.json"
  fi
}

capture_model_patch() {
  local repo_dir="$1"
  local patch_path="$2"
  mkdir -p "$(dirname "$patch_path")"
  (
    cd "$repo_dir"
    git add -N -- . ':(exclude).agent-sidecar/**' ':(exclude).claude/**' >/dev/null 2>&1 || true
    git -c core.fileMode=false diff --binary -- . ':(exclude).agent-sidecar/**' ':(exclude).claude/**'
  ) > "$patch_path"
}

append_prediction() {
  local predictions_path="$1"
  local instance_id="$2"
  local model_name="$3"
  local patch_path="$4"
  mkdir -p "$(dirname "$predictions_path")"
  python - "$predictions_path" "$instance_id" "$model_name" "$patch_path" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path

predictions_path = Path(sys.argv[1])
patch_path = Path(sys.argv[4])
payload = {
    "instance_id": sys.argv[2],
    "model_name_or_path": sys.argv[3],
    "model_patch": patch_path.read_text(encoding="utf-8") if patch_path.exists() else "",
}
with predictions_path.open("a", encoding="utf-8") as handle:
    handle.write(json.dumps(payload, sort_keys=True) + "\n")
PY
}

append_prediction_if_phase_succeeded() {
  local predictions_path="$1"
  local instance_id="$2"
  local model_name="$3"
  local patch_path="$4"
  local meta_path="$5"

  if meta_phase_failed "$meta_path"; then
    echo "Skipping $model_name prediction for $instance_id because phase failed." >&2
    return
  fi
  if [[ ! -s "$patch_path" ]]; then
    echo "Skipping $model_name prediction for $instance_id because patch is empty." >&2
    return
  fi
  append_prediction "$predictions_path" "$instance_id" "$model_name" "$patch_path"
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

cleanup_daemons() {
  if [[ -d "$ARTIFACT_ROOT" ]]; then
    while IFS= read -r state_path; do
      stop_sidecar_daemon "$(dirname "$(dirname "$state_path")")" || true
    done < <(find "$ARTIFACT_ROOT" -path "*/.agent-sidecar/daemon.json" -type f 2>/dev/null || true)
  fi
}

latest_stopped_session() {
  local repo_dir="$1"
  (cd "$repo_dir" && agent-sidecar session list 2>/dev/null | awk '$2 == "stopped" { id = $1 } END { if (id) print id }')
}

stop_active_session() {
  local repo_dir="$1"
  local output status session_id
  set +e
  output="$(cd "$repo_dir" && agent-sidecar session stop 2>&1)"
  status=$?
  set -e
  if [[ "$status" -ne 0 ]]; then
    printf '%s\n' "$output" >&2
    latest_stopped_session "$repo_dir"
    return 0
  fi
  session_id="$(printf '%s\n' "$output" | awk '/^Stopped / { print $2; exit }')"
  if [[ -z "$session_id" ]]; then
    session_id="$(latest_stopped_session "$repo_dir")"
  fi
  printf '%s\n' "$session_id"
}

write_run_meta() {
  local path="$1"
  local phase="$2"
  local session_id="$3"
  local exit_code="$4"
  local duration_ms="$5"
  local repo_dir="$6"
  local log_path="$7"
  local api_port="$8"
  local otlp_port="$9"
  local claude_sse_port="${10}"
  local diagnostic_log_path="${11}"
  local claude_debug_log_path="${12}"
  python - "$path" "$phase" "$session_id" "$exit_code" "$duration_ms" "$repo_dir" "$log_path" "$api_port" "$otlp_port" "$claude_sse_port" "$diagnostic_log_path" "$claude_debug_log_path" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
payload = {
    "phase": sys.argv[2],
    "session_id": sys.argv[3],
    "exit_code": int(sys.argv[4]),
    "duration_ms": int(sys.argv[5]),
    "repo_dir": sys.argv[6],
    "log_path": sys.argv[7],
    "api_port": int(sys.argv[8]),
    "otlp_port": int(sys.argv[9]),
    "claude_sse_port": int(sys.argv[10]),
    "diagnostic_log_path": sys.argv[11],
    "claude_debug_log_path": sys.argv[12],
}
path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
PY
}

mark_run_failure() {
  local meta_path="$1"
  local reason="$2"
  python - "$meta_path" "$reason" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
reason = sys.argv[2]
try:
    payload = json.loads(path.read_text(encoding="utf-8"))
except (OSError, json.JSONDecodeError):
    payload = {}
payload["phase_failed"] = True
payload["failure_reason"] = reason
path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
PY
}

log_contains_hook_stop() {
  local log_path="$1"
  [[ -f "$log_path" ]] && grep -q 'Operation stopped by hook' "$log_path"
}

claude_log_failure_reason() {
  local log_path="$1"
  [[ -f "$log_path" ]] || return 1
  if grep -Fqi "You've hit your session limit" "$log_path"; then
    printf '%s\n' "claude_session_limit"
    return 0
  fi
  if grep -Eiq '(usage|rate)[ -]*limit|too many requests|insufficient[_ -]quota|credit balance|payment required' "$log_path"; then
    printf '%s\n' "claude_provider_limit"
    return 0
  fi
  if grep -Eiq 'invalid api key|authentication failed|not authenticated|login required' "$log_path"; then
    printf '%s\n' "claude_authentication_failed"
    return 0
  fi
  return 1
}

meta_phase_failed() {
  local meta_path="$1"
  python - "$meta_path" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
except (OSError, json.JSONDecodeError):
    raise SystemExit(1)
raise SystemExit(0 if payload.get("phase_failed") is True else 1)
PY
}

meta_has_nonrecoverable_claude_failure() {
  local meta_path="$1"
  python - "$meta_path" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
except (OSError, json.JSONDecodeError):
    raise SystemExit(1)
reason = str(payload.get("failure_reason") or "")
raise SystemExit(0 if reason in {"claude_session_limit", "claude_provider_limit", "claude_authentication_failed"} else 1)
PY
}

run_claude_phase() {
  local phase="$1"
  local repo_dir="$2"
  local prompt_path="$3"
  local task_dir="$4"
  local sequence="$5"
  local api_port
  local otlp_port
  local claude_sse_port
  api_port="$(find_available_port $((BASE_API_PORT + sequence * 100)))"
  otlp_port="$(find_available_port $((BASE_OTLP_PORT + sequence * 100)))"
  claude_sse_port="$(find_available_port $((BASE_CLAUDE_SSE_PORT + sequence * 100)))"
  local log_path="$task_dir/claude.$phase.log"
  local diag_path="$task_dir/sidecar.$phase.log"
  local debug_path="$task_dir/claude.$phase.debug.log"
  local meta_path="$task_dir/$phase.meta.json"
  local started ended duration_ms status session_id prompt telemetry_exports prompt_bytes
  local -a extra_args claude_cmd

  section "Run $phase in $(basename "$task_dir")"
  stop_sidecar_daemon "$repo_dir" || true
  (
    cd "$repo_dir"
    export AGENT_SIDECAR_API_URL="http://127.0.0.1:$api_port"
    export CLAUDE_CODE_SSE_PORT="$claude_sse_port"
    export AGENT_SIDECAR_MODEL_TIMEOUT_MS
    export AGENT_SIDECAR_REFINE_TIMEOUT_SECONDS
    export AGENT_SIDECAR_MODEL_MAX_TOKENS
    : > "$diag_path"
    {
      printf 'phase=%s\n' "$phase"
      printf 'repo_dir=%s\n' "$repo_dir"
      printf 'api_port=%s\n' "$api_port"
      printf 'otlp_port=%s\n' "$otlp_port"
      printf 'claude_sse_port=%s\n' "$claude_sse_port"
      printf 'agent_sidecar_api_url=%s\n' "$AGENT_SIDECAR_API_URL"
      printf 'claude_bin=%s\n' "$CLAUDE_BIN"
      printf 'claude_model=%s\n' "$CLAUDE_MODEL"
      printf 'claude_permission_mode=%s\n' "$CLAUDE_PERMISSION_MODE"
      printf 'claude_extra_args=%s\n' "$CLAUDE_EXTRA_ARGS"
      "$CLAUDE_BIN" --version || true
    } >> "$diag_path" 2>&1

    {
      printf '\n== agent-sidecar start ==\n'
      agent-sidecar start --api-port "$api_port" --otlp-port "$otlp_port"
      printf '\n== hooks install ==\n'
      agent-sidecar hooks install
      printf '\n== hooks status ==\n'
      agent-sidecar hooks status
    } >> "$diag_path" 2>&1

    telemetry_exports="$(agent-sidecar telemetry print-env 2>> "$diag_path")"
    {
      printf '\n== telemetry env ==\n'
      printf '%s\n' "$telemetry_exports"
    } >> "$diag_path"
    eval "$telemetry_exports"
    if [[ "$phase" == "baseline" ]]; then
      export AGENT_SIDECAR_PROMPT_INTERCEPT=off
      unset AGENT_SIDECAR_REQUIRE_CODING_REFINEMENT || true
      unset AGENT_SIDECAR_REQUIRE_DEEPSEEK_REFINEMENT || true
      unset AGENT_SIDECAR_REQUIRE_DEEPSEEK_CODING || true
      unset AGENT_SIDECAR_REQUIRE_KIMI_CODING || true
      unset AGENT_SIDECAR_ALLOW_REFINEMENT_FALLBACK || true
    else
      unset AGENT_SIDECAR_PROMPT_INTERCEPT || true
      if [[ "$REQUIRE_CODING" -eq 1 ]]; then
        export AGENT_SIDECAR_REQUIRE_CODING_REFINEMENT=1
        unset AGENT_SIDECAR_REQUIRE_DEEPSEEK_REFINEMENT || true
        unset AGENT_SIDECAR_REQUIRE_DEEPSEEK_CODING || true
        if [[ "$ALLOW_REFINEMENT_FALLBACK" -eq 1 ]]; then
          export AGENT_SIDECAR_ALLOW_REFINEMENT_FALLBACK=1
        else
          unset AGENT_SIDECAR_ALLOW_REFINEMENT_FALLBACK || true
        fi
      else
        unset AGENT_SIDECAR_REQUIRE_CODING_REFINEMENT || true
        unset AGENT_SIDECAR_REQUIRE_DEEPSEEK_REFINEMENT || true
        unset AGENT_SIDECAR_REQUIRE_DEEPSEEK_CODING || true
        unset AGENT_SIDECAR_REQUIRE_KIMI_CODING || true
        unset AGENT_SIDECAR_ALLOW_REFINEMENT_FALLBACK || true
      fi
    fi
    prompt="$(cat "$prompt_path")"
    prompt_bytes="$(wc -c < "$prompt_path" | tr -d ' ')"
    claude_cmd=("$CLAUDE_BIN" -p --model "$CLAUDE_MODEL" --permission-mode "$CLAUDE_PERMISSION_MODE")
    if [[ "$CLAUDE_DEBUG" -eq 1 ]]; then
      claude_cmd+=(--debug-file "$debug_path")
    else
      : > "$debug_path"
    fi
    if [[ -n "$CLAUDE_EXTRA_ARGS" ]]; then
      read -r -a extra_args <<< "$CLAUDE_EXTRA_ARGS"
      claude_cmd+=("${extra_args[@]}")
    fi
    claude_cmd+=("$prompt")
    {
      printf '\n== claude invocation ==\n'
      printf 'prompt_bytes=%s\n' "$prompt_bytes"
      printf 'debug_enabled=%s\n' "$CLAUDE_DEBUG"
      printf 'AGENT_SIDECAR_API_URL=%s\n' "${AGENT_SIDECAR_API_URL:-}"
      printf 'OTEL_EXPORTER_OTLP_ENDPOINT=%s\n' "${OTEL_EXPORTER_OTLP_ENDPOINT:-}"
      printf 'CLAUDE_CODE_SSE_PORT=%s\n' "${CLAUDE_CODE_SSE_PORT:-}"
      env | sort | grep -E '^(AGENT_SIDECAR|CLAUDE_CODE|OTEL_)' || true
    } >> "$diag_path" 2>&1
    started="$(now_ms)"
    set +e
    "${claude_cmd[@]}" 2>&1 | tee "$log_path"
    status=${PIPESTATUS[0]}
    set -e
    ended="$(now_ms)"
    duration_ms=$((ended - started))
    {
      printf '\n== claude result ==\n'
      printf 'exit_code=%s\n' "$status"
      printf 'duration_ms=%s\n' "$duration_ms"
      printf 'claude_log_bytes=%s\n' "$(wc -c < "$log_path" | tr -d ' ')"
    } >> "$diag_path" 2>&1
    session_id="$(stop_active_session "$repo_dir" 2>> "$diag_path")"
    {
      printf '\n== session stop ==\n'
      printf 'session_id=%s\n' "$session_id"
      printf '\n== hooks uninstall ==\n'
      agent-sidecar hooks uninstall
    } >> "$diag_path" 2>&1 || true
    write_run_meta "$meta_path" "$phase" "$session_id" "$status" "$duration_ms" "$repo_dir" "$log_path" "$api_port" "$otlp_port" "$claude_sse_port" "$diag_path" "$debug_path"
  )
  stop_sidecar_daemon "$repo_dir" || true
}

append_pair_result() {
  local task_json="$1"
  local task_dir="$2"
  python - "$task_json" "$task_dir/baseline.meta.json" "$task_dir/sidecar.meta.json" "$RESULTS_JSONL" "$RESULTS_CSV" <<'PY'
from __future__ import annotations

import csv
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

task = json.loads(sys.argv[1])
baseline_meta = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
sidecar_meta = json.loads(Path(sys.argv[3]).read_text(encoding="utf-8"))
jsonl_path = Path(sys.argv[4])
csv_path = Path(sys.argv[5])


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


def iter_api_requests(meta: dict[str, Any]) -> list[dict[str, Any]]:
    session_id = str(meta.get("session_id") or "")
    trace_path = Path(str(meta.get("repo_dir") or "")) / ".agent-sidecar" / "sessions" / f"{session_id}.jsonl"
    rows: dict[str, dict[str, Any]] = {}
    fallback_rows: list[dict[str, Any]] = []
    if not trace_path.exists():
        return []
    for line in trace_path.read_text(encoding="utf-8").splitlines():
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


def summarize(meta: dict[str, Any]) -> dict[str, Any]:
    rows = iter_api_requests(meta)
    by_source: dict[str, dict[str, Any]] = defaultdict(lambda: {"requests": 0, "input": 0, "output": 0, "cache_read": 0, "cache_create": 0, "cost": 0.0})
    for row in rows:
        key = f"{row['model']} / {row['source']}"
        group = by_source[key]
        group["requests"] += 1
        group["input"] += row["input"]
        group["output"] += row["output"]
        group["cache_read"] += row["cache_read"]
        group["cache_create"] += row["cache_create"]
        group["cost"] += row["cost"]
    input_tokens = sum(row["input"] for row in rows)
    output_tokens = sum(row["output"] for row in rows)
    cache_read = sum(row["cache_read"] for row in rows)
    cache_create = sum(row["cache_create"] for row in rows)
    return {
        "session_id": meta.get("session_id"),
        "exit_code": meta.get("exit_code"),
        "duration_ms": meta.get("duration_ms"),
        "requests": len(rows),
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cache_read_tokens": cache_read,
        "cache_creation_tokens": cache_create,
        "total_tokens": input_tokens + output_tokens + cache_read + cache_create,
        "tokens_excluding_cache_creation": input_tokens + output_tokens + cache_read,
        "cost_usd": round(sum(row["cost"] for row in rows), 6),
        "by_source": dict(by_source),
        "phase_failed": bool(meta.get("phase_failed")),
        "failure_reason": meta.get("failure_reason"),
    }


baseline = summarize(baseline_meta)
sidecar = summarize(sidecar_meta)
baseline_patch_path = Path(sys.argv[2]).with_name("baseline.patch")
sidecar_patch_path = Path(sys.argv[3]).with_name("sidecar.patch")
baseline["patch_bytes"] = baseline_patch_path.stat().st_size if baseline_patch_path.exists() else None
sidecar["patch_bytes"] = sidecar_patch_path.stat().st_size if sidecar_patch_path.exists() else None
baseline_tokens = int(baseline["total_tokens"])
sidecar_tokens = int(sidecar["total_tokens"])
baseline_tokens_no_cache_create = int(baseline["tokens_excluding_cache_creation"])
sidecar_tokens_no_cache_create = int(sidecar["tokens_excluding_cache_creation"])
baseline_cost = float(baseline["cost_usd"])
sidecar_cost = float(sidecar["cost_usd"])
token_delta = baseline_tokens - sidecar_tokens
token_savings_pct = (token_delta / baseline_tokens * 100) if baseline_tokens > 0 else 0.0
token_delta_no_cache_create = baseline_tokens_no_cache_create - sidecar_tokens_no_cache_create
token_savings_pct_no_cache_create = (
    token_delta_no_cache_create / baseline_tokens_no_cache_create * 100
    if baseline_tokens_no_cache_create > 0
    else 0.0
)
cost_delta = baseline_cost - sidecar_cost
cost_savings_pct = (cost_delta / baseline_cost * 100) if baseline_cost > 0 else 0.0

row = {
    "instance_id": task.get("instance_id"),
    "repo": task.get("repo"),
    "base_commit": task.get("base_commit"),
    "baseline": baseline,
    "sidecar": sidecar,
    "token_delta": token_delta,
    "token_savings_pct": round(token_savings_pct, 3),
    "token_delta_excluding_cache_creation": token_delta_no_cache_create,
    "token_savings_pct_excluding_cache_creation": round(token_savings_pct_no_cache_create, 3),
    "cost_delta_usd": round(cost_delta, 6),
    "cost_savings_pct": round(cost_savings_pct, 3),
}

jsonl_path.parent.mkdir(parents=True, exist_ok=True)
with jsonl_path.open("a", encoding="utf-8") as handle:
    handle.write(json.dumps(row, sort_keys=True) + "\n")

with csv_path.open("a", newline="", encoding="utf-8") as handle:
    writer = csv.DictWriter(
        handle,
        fieldnames=[
            "instance_id",
            "repo",
            "baseline_session",
            "sidecar_session",
            "baseline_exit",
            "sidecar_exit",
            "baseline_failed",
            "sidecar_failed",
            "baseline_failure_reason",
            "sidecar_failure_reason",
            "baseline_patch_bytes",
            "sidecar_patch_bytes",
            "baseline_total_tokens",
            "sidecar_total_tokens",
            "token_delta",
            "token_savings_pct",
            "baseline_cost_usd",
            "sidecar_cost_usd",
            "cost_delta_usd",
            "cost_savings_pct",
        ],
    )
    writer.writerow({
        "instance_id": row["instance_id"],
        "repo": row["repo"],
        "baseline_session": baseline["session_id"],
        "sidecar_session": sidecar["session_id"],
        "baseline_exit": baseline["exit_code"],
        "sidecar_exit": sidecar["exit_code"],
        "baseline_failed": baseline["phase_failed"],
        "sidecar_failed": sidecar["phase_failed"],
        "baseline_failure_reason": baseline["failure_reason"],
        "sidecar_failure_reason": sidecar["failure_reason"],
        "baseline_patch_bytes": baseline["patch_bytes"],
        "sidecar_patch_bytes": sidecar["patch_bytes"],
        "baseline_total_tokens": baseline_tokens,
        "sidecar_total_tokens": sidecar_tokens,
        "token_delta": token_delta,
        "token_savings_pct": round(token_savings_pct, 3),
        "baseline_cost_usd": baseline_cost,
        "sidecar_cost_usd": sidecar_cost,
        "cost_delta_usd": round(cost_delta, 6),
        "cost_savings_pct": round(cost_savings_pct, 3),
    })

print(
    f"{row['instance_id']}: baseline={baseline_tokens} sidecar={sidecar_tokens} "
    f"delta={token_delta} savings={token_savings_pct:.1f}%"
)
PY
}

prepare_output_files() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    return
  fi
  mkdir -p "$PREDICTIONS_DIR" "$GRADER_DIR"
  : > "$RESULTS_JSONL"
  : > "$BASELINE_PREDICTIONS_JSONL"
  : > "$SIDECAR_PREDICTIONS_JSONL"
  rm -f "$SUMMARY_JSON" "$SUMMARY_TXT" "$GRADING_JSON"
  # Pre-write the CSV header once, up front, instead of having append_pair_result check
  # "does the file exist yet" and conditionally write it — that check-then-write was a race
  # when multiple tasks' append_pair_result calls run concurrently near the start of a batch.
  printf '%s\n' "instance_id,repo,baseline_session,sidecar_session,baseline_exit,sidecar_exit,baseline_failed,sidecar_failed,baseline_failure_reason,sidecar_failure_reason,baseline_patch_bytes,sidecar_patch_bytes,baseline_total_tokens,sidecar_total_tokens,token_delta,token_savings_pct,baseline_cost_usd,sidecar_cost_usd,cost_delta_usd,cost_savings_pct" > "$RESULTS_CSV"
}

run_grader_phase() {
  local phase="$1"
  local predictions_path="$2"
  local run_id="$3"
  local log_path="$4"

  if [[ ! -s "$predictions_path" ]]; then
    echo "No $phase predictions to grade: $predictions_path. Skipping $phase grader."
    return 0
  fi

  section "Run SWE-bench grader: $phase"
  mkdir -p "$GRADER_DIR"
  (
    cd "$GRADER_DIR"
    python -m swebench.harness.run_evaluation \
      --dataset_name "$DATASET" \
      --split "$SPLIT" \
      --predictions_path "$predictions_path" \
      --max_workers "$GRADER_MAX_WORKERS" \
      --run_id "$run_id" \
      --timeout "$GRADER_TIMEOUT" \
      --cache_level "$GRADER_CACHE_LEVEL" \
      --clean "$GRADER_CLEAN" \
      --report_dir "$GRADER_DIR"
  ) 2>&1 | tee "$log_path"
}

merge_grading_results() {
  python - "$RESULTS_JSONL" "$RESULTS_CSV" "$GRADING_JSON" "$GRADER_DIR" "$BASELINE_GRADER_MODEL" "$BASELINE_GRADER_RUN_ID" "$SIDECAR_GRADER_MODEL" "$SIDECAR_GRADER_RUN_ID" <<'PY'
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path
from typing import Any

results_path = Path(sys.argv[1])
csv_path = Path(sys.argv[2])
grading_json = Path(sys.argv[3])
grader_dir = Path(sys.argv[4])
baseline_model = sys.argv[5]
baseline_run_id = sys.argv[6]
sidecar_model = sys.argv[7]
sidecar_run_id = sys.argv[8]

rows = [
    json.loads(line)
    for line in results_path.read_text(encoding="utf-8").splitlines()
    if line.strip()
] if results_path.exists() else []


def load_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def final_report_path(model: str, run_id: str) -> Path:
    return grader_dir / f"{model.replace('/', '__')}.{run_id}.json"


def phase_report(model: str, run_id: str) -> dict[str, Any]:
    report = load_json(final_report_path(model, run_id))
    report["_report_path"] = str(final_report_path(model, run_id))
    return report


baseline_report = phase_report(baseline_model, baseline_run_id)
sidecar_report = phase_report(sidecar_model, sidecar_run_id)


def grade_for_instance(instance_id: str, model: str, run_id: str, report: dict[str, Any]) -> dict[str, Any]:
    resolved_ids = set(report.get("resolved_ids") or [])
    unresolved_ids = set(report.get("unresolved_ids") or [])
    empty_patch_ids = set(report.get("empty_patch_ids") or [])
    error_ids = set(report.get("error_ids") or [])
    completed_ids = set(report.get("completed_ids") or [])
    submitted_ids = set(report.get("submitted_ids") or [])
    model_dir = model.replace("/", "__")
    instance_report_path = grader_dir / "logs" / "run_evaluation" / run_id / model_dir / instance_id / "report.json"
    instance_report = load_json(instance_report_path)

    if instance_id in resolved_ids:
        status = "resolved"
        resolved = True
        score = 1
    elif instance_id in unresolved_ids:
        status = "unresolved"
        resolved = False
        score = 0
    elif instance_id in empty_patch_ids:
        status = "empty_patch"
        resolved = False
        score = 0
    elif instance_id in error_ids:
        status = "error"
        resolved = False
        score = 0
    elif instance_id in completed_ids:
        status = "completed_unresolved"
        resolved = False
        score = 0
    elif instance_id in submitted_ids:
        status = "not_completed"
        resolved = False
        score = 0
    else:
        status = "not_submitted"
        resolved = None
        score = None

    grade: dict[str, Any] = {
        "model_name_or_path": model,
        "run_id": run_id,
        "status": status,
        "resolved": resolved,
        "score": score,
        "report_path": str(instance_report_path) if instance_report_path.exists() else "",
    }
    if instance_report and instance_id in instance_report:
        detail = instance_report[instance_id]
        if isinstance(detail, dict):
            grade["tests_status"] = detail.get("tests_status")
            grade["resolved_status"] = detail.get("resolved_status")
    return grade


def score(value: Any) -> int | None:
    return value if isinstance(value, int) else None


for row in rows:
    instance_id = str(row.get("instance_id") or "")
    baseline_grade = grade_for_instance(instance_id, baseline_model, baseline_run_id, baseline_report)
    sidecar_grade = grade_for_instance(instance_id, sidecar_model, sidecar_run_id, sidecar_report)
    row.setdefault("baseline", {})["grade"] = baseline_grade
    row.setdefault("sidecar", {})["grade"] = sidecar_grade
    baseline_score = score(baseline_grade.get("score"))
    sidecar_score = score(sidecar_grade.get("score"))
    row["baseline_score"] = baseline_score
    row["sidecar_score"] = sidecar_score
    row["score_delta"] = sidecar_score - baseline_score if baseline_score is not None and sidecar_score is not None else None
    row["quality_preserved"] = sidecar_score >= baseline_score if baseline_score is not None and sidecar_score is not None else None

results_path.write_text(
    "".join(json.dumps(row, sort_keys=True) + "\n" for row in rows),
    encoding="utf-8",
)

fieldnames = [
    "instance_id",
    "repo",
    "baseline_session",
    "sidecar_session",
    "baseline_exit",
    "sidecar_exit",
    "baseline_total_tokens",
    "sidecar_total_tokens",
    "token_delta",
    "token_savings_pct",
    "baseline_cost_usd",
    "sidecar_cost_usd",
    "cost_delta_usd",
    "cost_savings_pct",
    "baseline_score",
    "sidecar_score",
    "score_delta",
    "quality_preserved",
    "baseline_grade_status",
    "sidecar_grade_status",
]
with csv_path.open("w", newline="", encoding="utf-8") as handle:
    writer = csv.DictWriter(handle, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        baseline = row.get("baseline") or {}
        sidecar = row.get("sidecar") or {}
        writer.writerow({
            "instance_id": row.get("instance_id"),
            "repo": row.get("repo"),
            "baseline_session": baseline.get("session_id"),
            "sidecar_session": sidecar.get("session_id"),
            "baseline_exit": baseline.get("exit_code"),
            "sidecar_exit": sidecar.get("exit_code"),
            "baseline_total_tokens": baseline.get("total_tokens"),
            "sidecar_total_tokens": sidecar.get("total_tokens"),
            "token_delta": row.get("token_delta"),
            "token_savings_pct": row.get("token_savings_pct"),
            "baseline_cost_usd": baseline.get("cost_usd"),
            "sidecar_cost_usd": sidecar.get("cost_usd"),
            "cost_delta_usd": row.get("cost_delta_usd"),
            "cost_savings_pct": row.get("cost_savings_pct"),
            "baseline_score": row.get("baseline_score"),
            "sidecar_score": row.get("sidecar_score"),
            "score_delta": row.get("score_delta"),
            "quality_preserved": row.get("quality_preserved"),
            "baseline_grade_status": (baseline.get("grade") or {}).get("status"),
            "sidecar_grade_status": (sidecar.get("grade") or {}).get("status"),
        })

graded = [
    row for row in rows
    if row.get("baseline_score") is not None and row.get("sidecar_score") is not None
]
summary = {
    "baseline_report": baseline_report,
    "sidecar_report": sidecar_report,
    "graded_instances": len(graded),
    "baseline_score": sum(int(row.get("baseline_score") or 0) for row in graded),
    "sidecar_score": sum(int(row.get("sidecar_score") or 0) for row in graded),
    "sidecar_improvements": [
        row.get("instance_id") for row in graded if int(row.get("score_delta") or 0) > 0
    ],
    "sidecar_regressions": [
        row.get("instance_id") for row in graded if int(row.get("score_delta") or 0) < 0
    ],
    "quality_preserved_instances": [
        row.get("instance_id") for row in graded if row.get("quality_preserved") is True
    ],
}
summary["score_delta"] = summary["sidecar_score"] - summary["baseline_score"]
grading_json.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(
    f"Grading: baseline={summary['baseline_score']}/{len(graded)} "
    f"sidecar={summary['sidecar_score']}/{len(graded)} "
    f"delta={summary['score_delta']:+d}"
)
PY
}

run_grading() {
  if [[ "$RUN_GRADER" -ne 1 ]]; then
    echo "Skipping SWE-bench grading (--skip-grading)."
    return
  fi
  # Baseline and sidecar predictions grade independent instance sets under distinct run_ids,
  # so the two SWE-bench harness invocations don't share mutable state; run them in parallel
  # instead of back to back. (Log output for both phases interleaves in the terminal since
  # they print concurrently; each still writes its own complete, non-interleaved log file.)
  local baseline_pid sidecar_pid baseline_status sidecar_status
  run_grader_phase "baseline" "$BASELINE_PREDICTIONS_JSONL" "$BASELINE_GRADER_RUN_ID" "$GRADER_DIR/baseline.grader.log" &
  baseline_pid=$!
  run_grader_phase "sidecar" "$SIDECAR_PREDICTIONS_JSONL" "$SIDECAR_GRADER_RUN_ID" "$GRADER_DIR/sidecar.grader.log" &
  sidecar_pid=$!

  set +e
  wait "$baseline_pid"
  baseline_status=$?
  wait "$sidecar_pid"
  sidecar_status=$?
  set -e

  if [[ "$baseline_status" -ne 0 ]]; then
    echo "Baseline SWE-bench grading failed (exit $baseline_status)." >&2
  fi
  if [[ "$sidecar_status" -ne 0 ]]; then
    echo "Sidecar SWE-bench grading failed (exit $sidecar_status)." >&2
  fi
  merge_grading_results
}

write_summary() {
  python - "$RESULTS_JSONL" "$SUMMARY_JSON" "$SUMMARY_TXT" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path

results_path = Path(sys.argv[1])
summary_json = Path(sys.argv[2])
summary_txt = Path(sys.argv[3])
rows = [
    json.loads(line)
    for line in results_path.read_text(encoding="utf-8").splitlines()
    if line.strip()
] if results_path.exists() else []

complete = [
    row for row in rows
    if row.get("baseline", {}).get("total_tokens", 0) > 0 and row.get("sidecar", {}).get("total_tokens", 0) > 0
    and not row.get("baseline", {}).get("phase_failed")
    and not row.get("sidecar", {}).get("phase_failed")
]
failed = [
    row for row in rows
    if int(row.get("baseline", {}).get("exit_code", 0) or 0) != 0
    or int(row.get("sidecar", {}).get("exit_code", 0) or 0) != 0
    or row.get("baseline", {}).get("phase_failed")
    or row.get("sidecar", {}).get("phase_failed")
]
baseline_tokens = sum(int(row["baseline"]["total_tokens"]) for row in complete)
sidecar_tokens = sum(int(row["sidecar"]["total_tokens"]) for row in complete)
token_delta = baseline_tokens - sidecar_tokens
aggregate_pct = (token_delta / baseline_tokens * 100) if baseline_tokens > 0 else 0.0
avg_pct = sum(float(row.get("token_savings_pct") or 0.0) for row in complete) / len(complete) if complete else 0.0
baseline_cost = sum(float(row["baseline"]["cost_usd"]) for row in complete)
sidecar_cost = sum(float(row["sidecar"]["cost_usd"]) for row in complete)
cost_delta = baseline_cost - sidecar_cost
cost_pct = (cost_delta / baseline_cost * 100) if baseline_cost > 0 else 0.0
graded = [
    row for row in rows
    if row.get("baseline_score") is not None and row.get("sidecar_score") is not None
]
baseline_score = sum(int(row.get("baseline_score") or 0) for row in graded)
sidecar_score = sum(int(row.get("sidecar_score") or 0) for row in graded)
score_delta = sidecar_score - baseline_score
quality_preserved = [row for row in graded if row.get("quality_preserved") is True]
score_regressions = [row for row in graded if int(row.get("score_delta") or 0) < 0]
score_improvements = [row for row in graded if int(row.get("score_delta") or 0) > 0]

summary = {
    "total_tasks": len(rows),
    "tasks_with_measured_tokens": len(complete),
    "tasks_with_failed_phase": len(failed),
    "tasks_with_grades": len(graded),
    "failed_instances": [
        {
            "instance_id": row.get("instance_id"),
            "baseline_exit": int(row.get("baseline", {}).get("exit_code", 0) or 0),
            "sidecar_exit": int(row.get("sidecar", {}).get("exit_code", 0) or 0),
            "baseline_failure_reason": row.get("baseline", {}).get("failure_reason"),
            "sidecar_failure_reason": row.get("sidecar", {}).get("failure_reason"),
        }
        for row in failed
    ],
    "baseline_total_tokens": baseline_tokens,
    "sidecar_total_tokens": sidecar_tokens,
    "aggregate_token_delta": token_delta,
    "aggregate_token_savings_pct": round(aggregate_pct, 3),
    "average_instance_token_savings_pct": round(avg_pct, 3),
    "baseline_cost_usd": round(baseline_cost, 6),
    "sidecar_cost_usd": round(sidecar_cost, 6),
    "cost_delta_usd": round(cost_delta, 6),
    "aggregate_cost_savings_pct": round(cost_pct, 3),
    "baseline_score": baseline_score,
    "sidecar_score": sidecar_score,
    "score_delta": score_delta,
    "quality_preserved_count": len(quality_preserved),
    "quality_preserved_pct": round((len(quality_preserved) / len(graded) * 100) if graded else 0.0, 3),
    "sidecar_improvement_count": len(score_improvements),
    "sidecar_regression_count": len(score_regressions),
    "sidecar_regressions": [row.get("instance_id") for row in score_regressions],
    "sidecar_improvements": [row.get("instance_id") for row in score_improvements],
}
summary_json.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
lines = [
    "SWE-bench Lite Agent Sidecar token savings",
    f"Tasks run: {len(rows)}",
    f"Tasks with measured tokens: {len(complete)}",
    f"Tasks with failed phase: {len(failed)}",
    f"Tasks with SWE-bench grades: {len(graded)}",
    f"Baseline total tokens: {baseline_tokens}",
    f"Sidecar total tokens:  {sidecar_tokens}",
    f"Aggregate token delta: {token_delta}",
    f"Aggregate token savings: {aggregate_pct:.1f}%",
    f"Average per-instance token savings: {avg_pct:.1f}%",
    f"Baseline cost: ${baseline_cost:.6f}",
    f"Sidecar cost:  ${sidecar_cost:.6f}",
    f"Aggregate cost savings: ${cost_delta:.6f} ({cost_pct:.1f}%)",
]
if graded:
    lines.extend([
        f"Baseline SWE-bench score: {baseline_score}/{len(graded)}",
        f"Sidecar SWE-bench score:  {sidecar_score}/{len(graded)}",
        f"SWE-bench score delta: {score_delta:+d}",
        f"Quality preserved: {len(quality_preserved)}/{len(graded)} ({(len(quality_preserved) / len(graded) * 100):.1f}%)",
        f"Sidecar improvements: {len(score_improvements)}",
        f"Sidecar regressions: {len(score_regressions)}",
    ])
if failed:
    lines.append("Failed instances:")
    for row in failed[:20]:
        baseline_reason = row.get("baseline", {}).get("failure_reason") or "none"
        sidecar_reason = row.get("sidecar", {}).get("failure_reason") or "none"
        lines.append(
            f"- {row.get('instance_id')} "
            f"(baseline_exit={int(row.get('baseline', {}).get('exit_code', 0) or 0)}, "
            f"sidecar_exit={int(row.get('sidecar', {}).get('exit_code', 0) or 0)}, "
            f"baseline_reason={baseline_reason}, sidecar_reason={sidecar_reason})"
        )
    if len(failed) > 20:
        lines.append(f"- ... {len(failed) - 20} more")
if score_regressions:
    lines.append("Sidecar score regressions:")
    for row in score_regressions[:20]:
        lines.append(
            f"- {row.get('instance_id')} "
            f"(baseline_score={row.get('baseline_score')}, sidecar_score={row.get('sidecar_score')})"
        )
    if len(score_regressions) > 20:
        lines.append(f"- ... {len(score_regressions) - 20} more")
summary_txt.write_text("\n".join(lines) + "\n", encoding="utf-8")
print("\n".join(lines))
PY
}

# Bounded-concurrency task pool. Written as a same-process PID-tracking loop rather than
# `wait -n` (bash >= 4.3 only; macOS ships bash 3.2 and this script must run there) or
# `xargs -P` (would require `export -f` for every helper function `run_task` transitively
# calls, which is fragile for a script this size). RUNNING_PIDS/RUNNING_INSTANCE_IDS track
# in-flight `run_task` background jobs; reap_finished_tasks() polls and reaps them.
declare -a RUNNING_PIDS=()
declare -a RUNNING_INSTANCE_IDS=()
STOP_LAUNCHING_NEW_TASKS=0
TASK_LOOP_STATUS=0

reap_finished_tasks() {
  local still_pids=() still_ids=()
  local i pid instance_id status
  for i in "${!RUNNING_PIDS[@]}"; do
    pid="${RUNNING_PIDS[$i]}"
    instance_id="${RUNNING_INSTANCE_IDS[$i]}"
    if kill -0 "$pid" 2>/dev/null; then
      still_pids+=("$pid")
      still_ids+=("$instance_id")
      continue
    fi
    set +e
    wait "$pid"
    status=$?
    set -e
    if [[ "$status" -ne 0 ]]; then
      echo "Task failed: $instance_id (exit $status)" >&2
      if [[ "$status" -eq 2 ]]; then
        echo "Nonrecoverable Claude failure for $instance_id; no new tasks will be launched." >&2
        STOP_LAUNCHING_NEW_TASKS=1
      fi
      if [[ "$FAIL_FAST" -eq 1 ]]; then
        STOP_LAUNCHING_NEW_TASKS=1
        TASK_LOOP_STATUS=1
      fi
    fi
  done
  # Bash 3.2 (macOS default) treats bare "${arr[@]}" expansion of a zero-element array as an
  # unbound variable under `set -u`; guard with an explicit length check instead of relying on
  # that expansion directly.
  if [[ ${#still_pids[@]} -gt 0 ]]; then
    RUNNING_PIDS=("${still_pids[@]}")
  else
    RUNNING_PIDS=()
  fi
  if [[ ${#still_ids[@]} -gt 0 ]]; then
    RUNNING_INSTANCE_IDS=("${still_ids[@]}")
  else
    RUNNING_INSTANCE_IDS=()
  fi
}

wait_for_task_slot() {
  reap_finished_tasks
  while [[ ${#RUNNING_PIDS[@]} -ge "$PARALLEL_TASKS" ]]; do
    sleep 0.5
    reap_finished_tasks
  done
}

wait_for_all_tasks() {
  while [[ ${#RUNNING_PIDS[@]} -gt 0 ]]; do
    sleep 0.5
    reap_finished_tasks
  done
}

run_task() {
  local index="$1"
  local task_json="$2"
  local instance_id repo base_commit safe task_dir prompt_path cache baseline_dir sidecar_dir
  local baseline_patch sidecar_patch
  local baseline_pid sidecar_pid baseline_status sidecar_status
  instance_id="$(json_field "$task_json" "instance_id")"
  repo="$(json_field "$task_json" "repo")"
  base_commit="$(json_field "$task_json" "base_commit")"
  safe="$(safe_name "$instance_id")"
  task_dir="$ARTIFACT_ROOT/tasks/$(printf '%03d' "$index")_$safe"
  prompt_path="$task_dir/prompt.txt"
  baseline_dir="$task_dir/baseline"
  sidecar_dir="$task_dir/sidecar"

  section "Prepare $instance_id"
  mkdir -p "$task_dir"
  printf '%s\n' "$task_json" > "$task_dir/task.json"
  write_prompt "$task_json" "$prompt_path"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "Dry run wrote prompt: $prompt_path"
    return
  fi

  cache="$(ensure_repo_cache "$repo")"
  prepare_checkout "$repo" "$base_commit" "$baseline_dir" "$cache"
  prepare_checkout "$repo" "$base_commit" "$sidecar_dir" "$cache"

  section "Run baseline and sidecar in parallel for $instance_id"
  run_claude_phase "baseline" "$baseline_dir" "$prompt_path" "$task_dir" $((index * 2)) &
  baseline_pid=$!
  run_claude_phase "sidecar" "$sidecar_dir" "$prompt_path" "$task_dir" $((index * 2 + 1)) &
  sidecar_pid=$!

  set +e
  wait "$baseline_pid"
  baseline_status=$?
  wait "$sidecar_pid"
  sidecar_status=$?
  set -e

  if [[ "$baseline_status" -ne 0 || "$sidecar_status" -ne 0 ]]; then
    echo "Claude phase orchestration failed for $instance_id (baseline=$baseline_status, sidecar=$sidecar_status)" >&2
    return 1
  fi
  baseline_patch="$task_dir/baseline.patch"
  sidecar_patch="$task_dir/sidecar.patch"
  local baseline_failure_reason sidecar_failure_reason
  capture_model_patch "$baseline_dir" "$baseline_patch"
  capture_model_patch "$sidecar_dir" "$sidecar_patch"
  if baseline_failure_reason="$(claude_log_failure_reason "$task_dir/claude.baseline.log")"; then
    mark_run_failure "$task_dir/baseline.meta.json" "$baseline_failure_reason"
  elif log_contains_hook_stop "$task_dir/claude.baseline.log"; then
    mark_run_failure "$task_dir/baseline.meta.json" "operation_stopped_by_hook"
  elif [[ ! -s "$baseline_patch" ]]; then
    mark_run_failure "$task_dir/baseline.meta.json" "empty_baseline_patch"
  fi
  if sidecar_failure_reason="$(claude_log_failure_reason "$task_dir/claude.sidecar.log")"; then
    mark_run_failure "$task_dir/sidecar.meta.json" "$sidecar_failure_reason"
  elif log_contains_hook_stop "$task_dir/claude.sidecar.log"; then
    mark_run_failure "$task_dir/sidecar.meta.json" "operation_stopped_by_hook"
  elif [[ ! -s "$sidecar_patch" ]]; then
    mark_run_failure "$task_dir/sidecar.meta.json" "empty_sidecar_patch"
  fi
  append_prediction_if_phase_succeeded "$BASELINE_PREDICTIONS_JSONL" "$instance_id" "$BASELINE_GRADER_MODEL" "$baseline_patch" "$task_dir/baseline.meta.json"
  append_prediction_if_phase_succeeded "$SIDECAR_PREDICTIONS_JSONL" "$instance_id" "$SIDECAR_GRADER_MODEL" "$sidecar_patch" "$task_dir/sidecar.meta.json"
  append_pair_result "$task_json" "$task_dir"
  if meta_has_nonrecoverable_claude_failure "$task_dir/baseline.meta.json" || meta_has_nonrecoverable_claude_failure "$task_dir/sidecar.meta.json"; then
    echo "Nonrecoverable Claude failure for $instance_id; stopping benchmark after summary is written." >&2
    return 2
  fi
}

require_command python3
require_command git
ensure_python_env
require_command agent-sidecar
if [[ "$DRY_RUN" -eq 0 ]]; then
  if ! CLAUDE_BIN="$(find_claude_bin)"; then
    echo "Missing required command: claude" >&2
    echo "Install Claude Code or add it to PATH. Checked PATH and $HOME/.local/bin/claude." >&2
    exit 1
  fi
fi
ensure_grader_available

trap cleanup_daemons EXIT
export_tasks
prepare_output_files

section "Benchmark Configuration"
SELECTION_MODE="count"
if [[ "$INSTANCE_SELECTION_EXPLICIT" -eq 1 ]]; then
  SELECTION_MODE="exact tests"
fi
cat <<EOF
Artifacts: $ARTIFACT_ROOT
Dataset: $DATASET
Split: $SPLIT
Selection mode: $SELECTION_MODE
Count: $LIMIT
Offset: $OFFSET
Requested tests: ${INSTANCE_IDS:-<none>}
Test file: ${INSTANCE_FILE:-<none>}
Claude model: $CLAUDE_MODEL
Permission mode: $CLAUDE_PERMISSION_MODE
Require coding-model focus: $REQUIRE_CODING
Allow deterministic refinement fallback: $ALLOW_REFINEMENT_FALLBACK
Include hints: $INCLUDE_HINTS
Dry run: $DRY_RUN
Parallel tasks: $PARALLEL_TASKS (each task runs baseline+Sidecar concurrently, so up to $((PARALLEL_TASKS * 2)) concurrent Claude Code sessions)
Run SWE-bench grader: $RUN_GRADER
Grader max workers: $GRADER_MAX_WORKERS
Grader timeout: $GRADER_TIMEOUT
Grader cache level: $GRADER_CACHE_LEVEL
Grader clean: $GRADER_CLEAN
EOF

index=0
while IFS= read -r task_json; do
  [[ -z "$task_json" ]] && continue
  index=$((index + 1))
  if [[ "$STOP_LAUNCHING_NEW_TASKS" -eq 1 ]]; then
    break
  fi
  wait_for_task_slot
  if [[ "$STOP_LAUNCHING_NEW_TASKS" -eq 1 ]]; then
    break
  fi
  instance_id="$(json_field "$task_json" "instance_id")"
  run_task "$index" "$task_json" &
  RUNNING_PIDS+=("$!")
  RUNNING_INSTANCE_IDS+=("$instance_id")
done < "$TASKS_JSONL"

wait_for_all_tasks

if [[ "$STOP_LAUNCHING_NEW_TASKS" -eq 1 ]]; then
  echo "Stopped launching new tasks because Claude returned a nonrecoverable account/session failure, or --fail-fast was set. Tasks already in flight ran to completion."
fi

if [[ "$TASK_LOOP_STATUS" -ne 0 ]]; then
  exit 1
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Dry run complete. Tasks: $TASKS_JSONL"
  exit 0
fi

section "SWE-bench Grading"
run_grading

section "Summary"
write_summary

cat <<EOF

Artifacts:
  $ARTIFACT_ROOT

Results:
  $RESULTS_JSONL
  $RESULTS_CSV
  $GRADING_JSON
  $SUMMARY_JSON
  $SUMMARY_TXT

Predictions:
  $BASELINE_PREDICTIONS_JSONL
  $SIDECAR_PREDICTIONS_JSONL

Grader artifacts:
  $GRADER_DIR
EOF
