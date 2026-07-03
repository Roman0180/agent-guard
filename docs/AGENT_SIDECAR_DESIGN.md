# Agent Sidecar Design & Implementation Document (v3)

> **How to use this document (read this first, coding agent):**
> Everything you need to start implementing from an empty repository is in this file.
> - **Part A** contains decisions that are already made. Do not reopen them. Do not ask about them.
> - **Part B** contains frozen contracts: schemas, interfaces, ports, file layouts. Implement them exactly as written.
> - **Part C** specifies the two-model local ensemble (DeepSeek = reasoning, Kimi = coding) and the fine-tuning pipeline for specially trained weights.
> - **Part D** contains the three implementation chunks. Work through them **in order**, milestone by milestone. Each milestone has a definition of done. Do not start a milestone until the previous one's definition of done is met.
> - **Part E** contains cross-cutting testing rules, risks, and the demo matrix.
> When a detail is genuinely unspecified, choose the simplest option consistent with the stated principles, record the choice in `docs/decisions.md`, and continue. Do not block.

---

# PART A — Product Definition and Fixed Decisions

## A1. What Agent Sidecar Is

Agent Sidecar is a local runtime layer that runs beside **Claude Code** in a separate process. It is a lightweight control plane that lowers the cost per successful engineering task by:

1. **Capturing Claude Code sessions automatically** via Claude Code's hooks system and native OpenTelemetry telemetry (no manual event registration in the happy path).
2. **Refining prompts before expensive execution** using a small local model ensemble.
3. **Detecting wasteful runtime behavior** (repeated failed tests, thrashing edits, missing validation, task drift) and emitting `continue | suggest | warn` steering with evidence.
4. **Reporting honest cost figures**: measured (from Claude Code telemetry) > priced (tokens × vendored price map) > approximate (labeled).
5. **Making runs replayable and exportable**: CLI replay, Markdown/JSON summaries, optional opt-in Langfuse export.

## A2. Fixed Decisions (do not reopen)

| # | Decision | Value |
| --- | --- | --- |
| D1 | Target agent | **Claude Code only.** No Codex, Cursor, or generic-agent support. The adapter layer keeps normalization generic; only Claude Code adapters ship. |
| D2 | Implementation language | **Python 3.11+** |
| D3 | Web framework | **FastAPI + uvicorn** for the daemon (sidecar API + OTLP receiver in one process) |
| D4 | Schema/validation | **pydantic v2** models for all events, sessions, configs, and model I/O contracts |
| D5 | CLI framework | **typer** |
| D6 | Package name / CLI name | `agent_sidecar` / `agent-sidecar` |
| D7 | Test framework | **pytest**; CI-gating tests run fully offline (no Claude Code, no Ollama, no network) |
| D8 | Model serving | **Ollama** at `http://localhost:11434` as primary; **llama-server (llama.cpp)** OpenAI-compatible endpoint as secondary for models Ollama cannot serve. Both reached through the LiteLLM SDK in-process. No LiteLLM proxy, no extra daemon. |
| D9 | Ensemble roles | **DeepSeek = reasoning role. Kimi = coding role.** See Part C. |
| D10 | Remote models | Disabled by default. Allowlist = local endpoints only. Enabling remote requires explicit config (`remote_fallback: true` + allowlist entry) and every remote call is receipted in the trace. |
| D11 | Steering never blocks | Hook scripts always exit 0. Steering warns/suggests only. |
| D12 | Source of truth | Append-only JSONL traces. SQLite index is derived and rebuildable. |
| D13 | Ports | Sidecar API `127.0.0.1:7433`; OTLP receiver `127.0.0.1:4318`; Ollama `127.0.0.1:11434`; optional llama-server `127.0.0.1:8080`. All configurable, all loopback-only. |
| D14 | Packaging | pip-installable wheel with console entry point (Chunk 3) |
| D15 | Fine-tuning method | **QLoRA adapters** trained offline with **LLaMA-Factory** recipes checked into the repo; merged/exported to **GGUF**; registered into Ollama via Modelfile; promoted only after passing the promptfoo eval gate. Training is offline tooling, never a runtime dependency. |

## A3. Goals

- Lower cost per successful Claude Code task, before and during execution.
- Zero-touch session capture; manual event registration exists only as a degraded fallback.
- Measured cost wherever Claude Code emits telemetry; every figure labeled `measured | priced | approximate`.
- Small, cheap, **locally running** models only in the runtime path: DeepSeek-R1 distills for reasoning, Kimi (Linear-48B-A3B default) for coding, both optionally with project-tuned LoRA weights.
- Deterministic fallback for every model-dependent behavior. Core correctness never depends on a model being up.
- Local-first: traces stay on disk; all exports explicit and receipted.

## A4. Non-Goals

- Supporting any agent other than Claude Code.
- SaaS, multi-user, billing, org admin, cloud sync, web dashboard (CLI replay is the answer for v3).
- PTY/terminal interception.
- Running the LiteLLM proxy or bundling/hosting Langfuse.
- Blocking Claude Code actions.
- Training models in the runtime. The tuning pipeline is offline tooling with checked-in recipes.
- Frequent remote frontier-model calls anywhere in the runtime.

## A5. Open-Source Components Used

| Tool | Role in the system | Runtime dependency? |
| --- | --- | --- |
| Claude Code hooks (pattern from `disler/claude-code-hooks-multi-agent-observability`) | Automatic event capture: prompts, tool calls, edits, tests, failures | Yes (hook executable ships with the package) |
| Claude Code native OTEL telemetry + built-in OTLP/HTTP receiver (pattern from `ColeMurray/claude-code-otel`) | Measured tokens and cost | Yes (receiver in daemon) |
| LiteLLM (SDK only) | ModelProvider implementation; unified calls to Ollama and llama-server; vendored price map for the cost engine | Yes (in-process library) |
| Ollama / llama.cpp | Local serving of DeepSeek and Kimi (base + tuned) | Yes (external local service, user-installed) |
| LLaMA-Factory | Offline QLoRA training of specially trained weights | No (dev tooling) |
| promptfoo | CI evals of refiner/steering prompts; **promotion gate for fine-tuned weights** | No (dev/CI tooling) |
| Langfuse | Optional opt-in trace export target | No (exporter plugin; user runs their own instance) |

---

# PART B — Frozen Contracts

Implement these exactly. They are frozen at the end of Chunk 1 (schemas, API, layout), Chunk 2 (model/evaluator/cost contracts), Chunk 3 (exporter/summary contracts). Changing a frozen contract requires a written entry in `docs/decisions.md` explaining why, and updating every dependent test.

## B1. Repository Layout

```text
agent-sidecar/
├── pyproject.toml                  # package metadata, console entry point
├── README.md
├── docs/
│   ├── decisions.md                # running log of implementation choices
│   ├── fixtures.md                 # how fixtures were captured, Claude Code version tags
│   └── tuning.md                   # how to train/promote specially trained weights
├── src/agent_sidecar/
│   ├── __init__.py                 # __version__
│   ├── cli/                        # typer app; one module per command group
│   │   ├── main.py                 # entry point: agent-sidecar
│   │   ├── daemon_cmds.py          # start, status
│   │   ├── hooks_cmds.py           # hooks install|uninstall|status
│   │   ├── telemetry_cmds.py       # telemetry print-env
│   │   ├── session_cmds.py         # session list|show|stop, trace show, event (fallback)
│   │   ├── intel_cmds.py           # refine, steer, cost show          (Chunk 2)
│   │   ├── replay_cmds.py          # replay, summary export, index      (Chunk 3)
│   │   ├── export_cmds.py          # export langfuse                    (Chunk 3)
│   │   ├── models_cmds.py          # models list|pull|promote|rollback  (Chunk 2)
│   │   └── dev_cmds.py             # dev replay-fixture, dev export-dataset
│   ├── daemon/
│   │   ├── app.py                  # FastAPI app factory; mounts api + otlp routers
│   │   ├── api.py                  # sidecar HTTP API routes
│   │   ├── otlp.py                 # OTLP/HTTP receiver routes (/v1/metrics, /v1/logs)
│   │   └── runner.py               # process management, pidfile, uvicorn boot
│   ├── schema/
│   │   ├── events.py               # SidecarEvent + payload models (B3)
│   │   ├── session.py              # SessionRecord (B4)
│   │   ├── config.py               # SidecarConfig (B7)
│   │   ├── model_io.py             # RefineResult, SteerResult, EvaluatorFinding (B5/B6)
│   │   └── summary.py              # RunSummary (Chunk 3)
│   ├── adapters/
│   │   ├── claude_code/
│   │   │   ├── hooks_adapter.py    # hook JSON -> SidecarEvent(s), derivation rules
│   │   │   ├── hook_script.py      # the installed hook executable (stdlib-only)
│   │   │   ├── installer.py        # .claude/settings.json merge/unmerge
│   │   │   └── otlp_adapter.py     # OTLP payloads -> SidecarEvent(s), correlation
│   │   └── manual.py               # CLI event fallback -> SidecarEvent
│   ├── store/
│   │   ├── jsonl.py                # append-only trace writer/reader
│   │   ├── sessions.py             # SessionManager (auto-create, lifecycle)
│   │   └── index.py                # SQLite index (Chunk 3)
│   ├── models/                     # the ensemble (Part C)
│   │   ├── provider.py             # ModelProvider protocol + LiteLLM implementation
│   │   ├── router.py               # role -> model resolution (reasoning|coding)
│   │   ├── registry.py             # model registry: base + tuned weights, checksums, eval scores
│   │   ├── prompts/                # versioned prompt templates for each role/task
│   │   │   ├── refine_reasoning.txt
│   │   │   ├── refine_coding.txt
│   │   │   └── steer_reasoning.txt
│   │   └── validation.py           # strict-JSON validators, restatement/evidence checks
│   ├── intel/
│   │   ├── refiner.py              # Prompt Refiner (ensemble-first, deterministic fallback)
│   │   ├── refiner_fallback.py     # deterministic scorer + refiner
│   │   ├── cost.py                 # three-tier Cost Engine
│   │   ├── detectors/              # one module per deterministic detector
│   │   │   ├── repeated_command.py
│   │   │   ├── failed_test_loop.py
│   │   │   ├── repeated_edit.py
│   │   │   ├── missing_validation.py
│   │   │   └── task_drift.py
│   │   ├── normalize.py            # command normalization
│   │   ├── rules.py                # repo guardrail rule engine
│   │   ├── ranker.py               # deterministic recommendation ranker (fallback decider)
│   │   └── steering.py             # orchestration: detectors -> ensemble -> decision
│   ├── export/
│   │   ├── base.py                 # Exporter protocol + ExportReceipt
│   │   ├── markdown.py             # summary -> md
│   │   ├── jsonexp.py              # summary -> json
│   │   └── langfuse_exp.py         # Langfuse exporter (Chunk 3)
│   └── replay/
│       ├── reader.py               # ordered timeline from JSONL
│       └── render.py               # CLI timeline rendering
├── tuning/                         # OFFLINE tooling — never imported by src/
│   ├── recipes/
│   │   ├── deepseek_reasoning_qlora.yaml     # LLaMA-Factory config
│   │   └── kimi_coding_qlora.yaml            # LLaMA-Factory config
│   ├── export_gguf.sh              # merge adapter + convert to GGUF (llama.cpp scripts)
│   ├── modelfiles/
│   │   ├── sidecar-deepseek-reasoning.Modelfile
│   │   └── sidecar-kimi-coding.Modelfile
│   └── README.md                   # step-by-step train->export->register->promote
├── evals/
│   ├── refiner.promptfoo.yaml
│   ├── steering.promptfoo.yaml
│   ├── promotion.promptfoo.yaml    # tuned-vs-base gate
│   └── fixtures/
│       ├── hooks/                  # captured hook payloads per event type (JSON)
│       ├── otlp/                   # captured OTLP metric/log payloads (protobuf + JSON)
│       ├── traces/                 # canonical session JSONL files (e.g. auth-refresh-loop.jsonl)
│       └── datasets/               # labeled refinement/steering pairs for tuning + calibration
└── tests/
    ├── unit/                       # mirrors src/ structure
    ├── integration/
    └── golden/                     # golden files: refine output, steering output, summaries
```

## B2. Local Data Layout (per repo using the sidecar)

```text
.agent-sidecar/
  config.json
  sessions/
    cc-<id>.jsonl
    cc-<id>.summary.md
  index.sqlite                # Chunk 3, derived
  cost-map/litellm_prices.json
  models/registry.json        # local model registry state (B8)
```

## B3. Event Schema (pydantic, frozen after Chunk 1)

```python
class EventSource(str, Enum):
    hook = "hook"; otlp = "otlp"; cli = "cli"; manual = "manual"; detector = "detector"

class SidecarEvent(BaseModel):
    event_id: str                # uuid4
    session_id: str              # "cc-" + Claude Code session id
    timestamp: datetime          # UTC
    event_type: str              # one of the registered types below
    source: EventSource
    payload: dict                # type-specific payload model, validated per event_type
    metadata: EventMeta

class EventMeta(BaseModel):
    repo_path: str
    agent: Literal["claude-code"] = "claude-code"
    confidence: float = 1.0
    schema_version: int = 3
    adapter_version: str | None = None
```

Registered `event_type` values and primary source:

| event_type | source | notes |
| --- | --- | --- |
| `session_started` / `session_stopped` | hook | SessionStart / SessionEnd |
| `prompt_submitted` | hook | UserPromptSubmit |
| `prompt_refined` | detector | written by the refiner |
| `agent_tool_observed` | hook | Pre/PostToolUse pair collapsed; payload: tool_name, input summary, exit, duration_ms |
| `agent_tool_failed` | hook | PostToolUseFailure |
| `turn_completed` | hook | Stop |
| `file_edit_observed` | hook (derived) | from Edit/Write/MultiEdit tool events |
| `test_run_observed` / `test_failure_observed` | hook (derived) | Bash matching configured test patterns; failure_signature from output tail |
| `cost_estimate_updated` | otlp or detector | payload uses OTEL GenAI names: `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, plus `cost_usd`, `precision` |
| `loop_detected` / `validation_missing` / `task_drift_detected` | detector | evidence_event_ids required |
| `steering_recommendation` | detector | decision, recommendation, evaluators_fired, evidence_event_ids, confidence, estimated_avoided_waste{cost_usd, precision} |
| `model_call_completed` | detector | every ensemble call: role, model_id, latency_ms, valid_json, fallback_used |
| `summary_exported` | detector | destination, counts, truncation, duration_ms |

Unknown incoming fields from hooks/OTLP are preserved under `payload.raw_hook` / `payload.raw_otel`, never dropped.

## B4. SessionRecord (frozen after Chunk 1)

```python
class Precision(str, Enum):
    measured = "measured"; priced = "priced"; approximate = "approximate"

class SessionRecord(BaseModel):
    session_id: str
    agent: Literal["claude-code"] = "claude-code"
    repo_path: str
    status: Literal["active", "stopped"]
    started_at: datetime
    stopped_at: datetime | None
    trace_path: str
    event_count: int
    observation: dict            # {"hooks": bool, "otlp": bool, "manual": bool}
    tokens: TokenUsage | None    # input/output/cache_read + precision
    cost_usd: Money | None       # value + precision
    model: str | None            # gen_ai.request.model from telemetry
    config_snapshot: dict
```

## B5. ModelProvider and Ensemble Contracts (frozen after Chunk 2)

```python
class ModelRole(str, Enum):
    reasoning = "reasoning"      # DeepSeek: judgments, steering decisions, quality scoring
    coding = "coding"            # Kimi: code-aware prompt drafting, failure analysis, next-step suggestions

class ModelProvider(Protocol):
    def complete_json(self, role: ModelRole, task: str, prompt: str,
                      schema: type[BaseModel], timeout_ms: int | None = None
                      ) -> BaseModel | None:
        """Resolve role->model via the router, call it via LiteLLM, demand strict JSON,
        validate against `schema`. Return None on ANY failure (unreachable, timeout,
        invalid JSON, schema violation, allowlist violation). Emit model_call_completed."""

    def health(self) -> dict:    # per-role: reachable, model_id, tuned|base, registry entry
```

Task-level output schemas:

```python
class RefineDraft(BaseModel):            # produced by the CODING model (Kimi)
    refined_prompt: str
    acceptance_criteria: list[str]
    testing_expectations: str
    do_not_change: list[str]
    files_or_components: list[str]

class RefineJudgment(BaseModel):         # produced by the REASONING model (DeepSeek)
    quality: Literal["low", "medium", "high"]
    issues: list[str]
    approved: bool                        # is the coding model's draft materially better?
    revision_notes: str | None

class RefineResult(BaseModel):           # assembled by the refiner
    quality: str
    issues: list[str]
    refined_prompt: str
    acceptance_criteria: list[str]
    testing_expectations: str
    do_not_change: list[str]
    source: Literal["ensemble", "coding-only", "deterministic"]

class SteerResult(BaseModel):            # produced by the REASONING model (DeepSeek)
    decision: Literal["continue", "suggest", "warn"]
    recommendation: str
    evidence_event_ids: list[str]         # MUST be subset of detector-provided ids
    confidence: float

class NextStepDraft(BaseModel):          # optional, produced by the CODING model (Kimi)
    next_step: str                        # concrete, code-aware suggestion
    rationale: str
```

## B6. EvaluatorFinding and Cost contracts (frozen after Chunk 2)

```python
class EvaluatorFinding(BaseModel):
    evaluator_id: str
    severity: Literal["info", "suggest", "warn"]
    confidence: float
    evidence_event_ids: list[str]
    summary: str
    recommendation: str | None = None
    estimated_waste: WasteEstimate | None = None

class WasteEstimate(BaseModel):
    repeated_actions: int | None = None
    cost_usd: float | None = None
    precision: Precision

class CostEstimate(BaseModel):
    value: float
    precision: Precision          # mandatory everywhere a number appears
```

## B7. Configuration (default `.agent-sidecar/config.json`)

```json
{
  "version": 3,
  "trace_dir": ".agent-sidecar/sessions",
  "daemon": { "api_port": 7433, "otlp_port": 4318 },
  "hooks": {
    "payload_max_bytes": 32768,
    "test_command_patterns": ["pnpm test", "npm test", "pytest", "cargo test", "go test"]
  },
  "models": {
    "roles": {
      "reasoning": { "model": "sidecar-deepseek-reasoning", "fallback_base": "deepseek-r1:8b" },
      "coding":    { "model": "sidecar-kimi-coding",        "fallback_base": "kimi-linear-48b-a3b" }
    },
    "endpoints": {
      "ollama":       { "api_base": "http://localhost:11434", "litellm_prefix": "ollama_chat/" },
      "llama_server": { "api_base": "http://localhost:8080/v1", "litellm_prefix": "openai/" }
    },
    "allowlist": ["ollama_chat/*", "openai/*@http://localhost:8080/v1"],
    "remote_fallback": false,
    "timeout_ms": 12000,
    "hardware_tier": "auto"
  },
  "cost": { "price_map": ".agent-sidecar/cost-map/litellm_prices.json" },
  "steering": {
    "loop_threshold": 0.82,
    "validation_required_after_edits": true,
    "max_warnings_per_turn": 1,
    "coding_next_step": true
  },
  "rules": {
    "warn_on_repeated_failed_tests": true,
    "warn_on_out_of_scope_edits": true
  },
  "exporters": {
    "langfuse": { "enabled": false, "base_url": null, "auto_export": false }
  }
}
```

Allowlist semantics: `openai/*` entries are only valid when pinned to a loopback `api_base` (the `@http://localhost...` suffix); the provider rejects any `openai/*` call whose api_base is not loopback unless `remote_fallback` is true. This keeps the llama-server path local-only by construction.

## B8. Model Registry (`.agent-sidecar/models/registry.json`)

```json
{
  "version": 1,
  "entries": [
    {
      "name": "sidecar-deepseek-reasoning",
      "role": "reasoning",
      "kind": "tuned",
      "base": "deepseek-r1:8b",
      "serving": "ollama",
      "adapter_sha256": "…",
      "trained_at": "iso-8601",
      "recipe": "tuning/recipes/deepseek_reasoning_qlora.yaml",
      "eval": { "suite": "evals/promotion.promptfoo.yaml", "score": 0.91, "base_score": 0.84, "passed": true },
      "status": "active"
    },
    {
      "name": "sidecar-kimi-coding",
      "role": "coding",
      "kind": "tuned",
      "base": "kimi-linear-48b-a3b",
      "serving": "llama_server",
      "gguf_sha256": "…",
      "eval": { "suite": "evals/promotion.promptfoo.yaml", "score": 0.88, "base_score": 0.83, "passed": true },
      "status": "active"
    }
  ]
}
```

Router resolution order per role: registry entry with `status: active` and `eval.passed: true` → configured `fallback_base` → deterministic fallback (no model). `agent-sidecar models list` prints this table; `models promote` / `models rollback` flip `status` (promote refuses unless `eval.passed` is true).

## B9. HTTP API (frozen after Chunk 1; Chunk 2/3 additions marked)

```text
GET  /health
GET  /status
GET  /sessions                    GET  /sessions/:id
POST /sessions                    POST /sessions/:id/stop
POST /sessions/:id/events         GET  /sessions/:id/trace
POST /v1/metrics   (otlp port)    POST /v1/logs   (otlp port)
--- Chunk 2 ---
POST /refine                      POST /sessions/:id/steer
GET  /sessions/:id/recommendations  GET /sessions/:id/cost
GET  /models
--- Chunk 3 ---
GET  /sessions/:id/replay         GET  /sessions/:id/summary
POST /sessions/:id/export
```

## B10. CLI Surface (complete)

```bash
agent-sidecar start [--api-port] [--otlp-port]        # Chunk 1
agent-sidecar status
agent-sidecar hooks install|uninstall|status
agent-sidecar telemetry print-env
agent-sidecar session list|show|stop
agent-sidecar trace show <id>
agent-sidecar event command|edit|test ...             # manual fallback
agent-sidecar refine [--session <id>] "prompt"        # Chunk 2
agent-sidecar steer --session <id>
agent-sidecar cost show --session <id>
agent-sidecar models list|pull|promote|rollback
agent-sidecar dev replay-fixture <path> --session <id>
agent-sidecar dev export-dataset [--kind refine|steer] # tuning data from traces
agent-sidecar replay <id>                             # Chunk 3
agent-sidecar summary export <id> --format markdown|json
agent-sidecar export langfuse <id>
agent-sidecar index rebuild
agent-sidecar --version
```

---

# PART C — The Local Model Ensemble (DeepSeek + Kimi, specially trained weights)

## C1. Roles and Division of Labor

Two small, cheap, locally running models with distinct jobs, both reached through the same `ModelProvider.complete_json(role, ...)` seam:

| Role | Model family | Used for | Why this family |
| --- | --- | --- | --- |
| **reasoning** | DeepSeek-R1 distill (default `deepseek-r1:8b`, minimum `deepseek-r1:7b`) | Steering decisions over detector evidence; prompt-quality judgment; approving/rejecting the coding model's refinement draft; cost-risk rationale; drift assessment | R1 distills are purpose-built small reasoning models, trivially served by Ollama, cheap on 8-16GB machines |
| **coding** | Kimi (default **Kimi-Linear-48B-A3B-Instruct**; high tier **Kimi-Dev-72B**) | Drafting the refined prompt for code tasks (files, scope, acceptance criteria, test expectations); interpreting failure signatures; drafting the concrete "recommended next step" attached to warnings | Kimi-Linear is an MoE with only ~3B **active** parameters — cheap per token despite 48B total; Kimi-Dev-72B is Moonshot's coding-specialized model for machines that can hold it |

**Hardware tiers** (router selects via `hardware_tier: auto` by probing available RAM/VRAM at daemon start; user can pin):

| Tier | reasoning | coding | Approx. memory for coding model |
| --- | --- | --- | --- |
| `small` (≤16GB) | deepseek-r1:7b | **none** — coding role degrades: reasoning model handles both, or deterministic fallback | — |
| `medium` (24-32GB) | deepseek-r1:8b | Kimi-Linear-48B-A3B @ Q2_K–Q3 | ~16-20GB |
| `large` (48GB+) | deepseek-r1:8b or :14b | Kimi-Linear-48B-A3B @ Q4_K_M | ~28GB |
| `max` (96GB+) | deepseek-r1:14b | Kimi-Dev-72B @ Q4 | ~45GB+ |

**Honest constraint, encoded in the design:** there is no 7B-class Kimi. Kimi-Linear-48B-A3B is the smallest sensible Kimi and its GGUF support currently lives in llama.cpp branches rather than guaranteed Ollama mainline. Therefore the coding role supports **two serving backends** (D8): Ollama when the model is in the Ollama library or importable via Modelfile, and `llama-server` (OpenAI-compatible, loopback) otherwise. The provider/router treats both identically through LiteLLM (`ollama_chat/<name>` vs `openai/<name>` pinned to the loopback api_base). If neither backend can serve a Kimi on the user's hardware, the router reports the coding role as unavailable and every coding-role caller uses its deterministic path — the system stays fully functional.

## C2. Ensemble Call Patterns

**Prompt refinement (`refine`):**

1. **coding (Kimi)** → `RefineDraft`: rewrite the raw prompt into a structured coding-agent prompt with files/components, acceptance criteria, testing expectations, do-not-change list. Prompt template: `models/prompts/refine_coding.txt`.
2. **reasoning (DeepSeek)** → `RefineJudgment`: score original quality, enumerate issues, approve or annotate the draft. Template: `refine_reasoning.txt`.
3. Assemble `RefineResult`. `source` field records the path taken:
   - both succeeded → `ensemble`
   - only Kimi succeeded → `coding-only` (judgment from deterministic scorer)
   - only DeepSeek succeeded → DeepSeek judges the deterministic draft
   - neither → `deterministic` (Chunk 2's fallback scorer+refiner)
4. Cost engine prices original vs refined token counts; refiner emits `prompt_submitted` + `prompt_refined` + `model_call_completed` events.

**Runtime steering (`steer` / auto-steer):**

1. Deterministic detectors produce `EvaluatorFinding[]` (never skipped — they are the evidence source and the fallback).
2. **reasoning (DeepSeek)** → `SteerResult` over compact findings + minimal session summary. Evidence-subset validation: any `evidence_event_ids` not supplied by detectors ⇒ response rejected ⇒ deterministic ranker decides.
3. If decision is `suggest`/`warn` and `steering.coding_next_step` is true and the coding role is available: **coding (Kimi)** → `NextStepDraft` given the failure signature + recent file edits, replacing the generic recommendation with a concrete, code-aware next step. Failure here silently keeps the reasoning/deterministic recommendation.
4. Decision engine applies noise controls and emits `steering_recommendation`.

**Budget rule:** at most one reasoning call and one coding call per steering invocation; at most one of each per `refine`. No chains, no retries beyond a single reformat retry on invalid JSON.

## C3. Specially Trained Weights: the Tuning Pipeline

The runtime uses **tuned weights when they exist and have passed the eval gate**, base weights otherwise. The pipeline that produces tuned weights lives in `tuning/` and runs offline. It is a Chunk 2 deliverable as *tooling + recipes + gate*, not as a training run.

**Step 1 — Dataset export (runtime command, ships in Chunk 2).**
`agent-sidecar dev export-dataset --kind refine` walks local traces and emits SFT pairs to `evals/fixtures/datasets/refine.jsonl`:

```json
{"messages": [
  {"role": "system", "content": "<refine_coding.txt template>"},
  {"role": "user", "content": "<original prompt + repo context block>"},
  {"role": "assistant", "content": "<RefineDraft JSON that was accepted/used>"}
]}
```

`--kind steer` does the same for `(findings → accepted SteerResult)` pairs. Only sessions where the refinement was actually used (subsequent `prompt_submitted` matches the refined prompt) or the warning was followed by behavior change are labeled positive; the exporter marks provenance so users can curate. The checked-in seed datasets in `evals/fixtures/datasets/` make the pipeline runnable before anyone has real traces.

**Step 2 — QLoRA training (offline, checked-in recipes).**
`tuning/recipes/deepseek_reasoning_qlora.yaml` and `kimi_coding_qlora.yaml` are complete LLaMA-Factory configs: base model HF id, dataset path, LoRA rank/alpha/dropout, 4-bit quantized training, epochs, output dir. `tuning/README.md` gives the exact commands:

```bash
pip install llamafactory
llamafactory-cli train tuning/recipes/deepseek_reasoning_qlora.yaml
```

**Step 3 — Export to servable weights.**
`tuning/export_gguf.sh` merges the LoRA adapter into the base, converts to GGUF via llama.cpp's conversion scripts, and quantizes (Q4_K_M default). For the DeepSeek/Ollama path there are two options and the script supports both: (a) merged GGUF registered via `FROM ./model.gguf` Modelfile, or (b) base model + GGUF LoRA via the Modelfile `ADAPTER` directive. Kimi path always produces a merged GGUF for `llama-server` (or Ollama import if supported).

```bash
ollama create sidecar-deepseek-reasoning -f tuning/modelfiles/sidecar-deepseek-reasoning.Modelfile
```

**Step 4 — Eval gate (promotion).**
`evals/promotion.promptfoo.yaml` runs the tuned model and its base side-by-side on the held-out refinement/steering suites (strict-JSON validity, schema completeness, restatement rejection, evidence-subset correctness, rubric quality). `agent-sidecar models promote sidecar-kimi-coding` runs the suite, writes scores into the registry (B8), and only sets `status: active` if `tuned_score > base_score` and JSON-validity ≥ base. `models rollback` reverts to base instantly. The router (B8 resolution order) makes promotion/rollback a pure registry flip — zero code changes.

**Boundary rules:**
- Nothing in `src/` imports anything from `tuning/`.
- Training never touches the daemon; the daemon only ever loads whatever the registry says is active.
- CI never trains and never requires a model: registry logic, dataset exporter, Modelfile generation, and promotion bookkeeping are all tested with stub eval results and fixture datasets.

---

# PART D — Implementation Plan: Three Chunks

Work strictly in order. Every milestone lists its files (from B1), its tests, and its definition of done (DoD). CI must be green (offline) at the end of every milestone.

## D0. Bootstrap (do this before Chunk 1)

1. `pyproject.toml` with package metadata, `agent-sidecar` console entry, deps: fastapi, uvicorn, pydantic>=2, typer, litellm, httpx; dev deps: pytest, pytest-asyncio, respx.
2. `src/agent_sidecar/__init__.py` with `__version__`.
3. Empty module tree per B1; `pytest -q` runs (zero tests is fine); `agent-sidecar --version` prints.
4. `docs/decisions.md` created with the bootstrap entry.

**DoD:** clean venv → `pip install -e .[dev]` → `agent-sidecar --version` works → `pytest` exits 0.

---

## Chunk 1 — Core Runtime + Automatic Claude Code Observation

**Proves:** the sidecar runs locally and captures a complete, automatic trace of a real Claude Code session via hooks + OTLP, with zero manual event registration.

### Milestones (in order)

**1.1 Schemas + store.** `schema/events.py`, `schema/session.py`, `schema/config.py`, `store/jsonl.py`, `store/sessions.py`.
Tests: schema validation (valid/invalid payloads per event type), JSONL append/read/round-trip, session lifecycle, config load/defaults/creation.
DoD: fixture events round-trip losslessly; unknown payload fields preserved.

**1.2 Daemon skeleton.** `daemon/app.py`, `daemon/api.py`, `daemon/runner.py`. All B9 Chunk-1 routes; sessions auto-create when `POST /sessions/:id/events` references an unknown id; loopback binding only; pidfile + `start`/`status` CLI (`cli/daemon_cmds.py`).
Tests: httpx TestClient route tests; auto-creation; stop semantics.
DoD: `agent-sidecar start` then `status` shows a live daemon; all routes pass tests.

**1.3 Hook executable + installer.** `adapters/claude_code/hook_script.py` (stdlib-only: read hook JSON from stdin, POST to `/sessions/<cc-session-id>/events`, hard 200ms budget, **always exit 0**, silent when daemon down), `installer.py` (merge/unmerge `.claude/settings.json` for SessionStart, SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, Stop; backup before write; idempotent), `cli/hooks_cmds.py`.
Tests: merge idempotency incl. pre-existing third-party hooks; uninstall restores; exit-0 + latency budget with daemon down (timed subprocess test).
DoD: install → uninstall on a fixture settings.json is byte-identical; script never exits nonzero.

**1.4 Hooks adapter + derivation rules.** `adapters/claude_code/hooks_adapter.py`: raw hook payload (untrusted: size-cap, validate, truncate) → `SidecarEvent`(s); derive `file_edit_observed` from Edit/Write/MultiEdit; derive `test_run_observed`/`test_failure_observed` (+failure signature from output tail) from Bash matching `hooks.test_command_patterns`.
Tests: one fixture per hook type in `evals/fixtures/hooks/`; every derivation rule positive + negative.
DoD: replaying the full fixture hook sequence via HTTP produces the canonical trace golden file.

**1.5 OTLP receiver + adapter.** `daemon/otlp.py` (accept OTLP/HTTP protobuf **and** JSON on `/v1/metrics`, `/v1/logs`), `otlp_adapter.py` (GenAI-convention mapping → `cost_estimate_updated` with `precision: measured`; session correlation by session-id attribute, fallback time+cwd window; unmatched telemetry → `telemetry-orphans` session; dedup vs hook events), `cli/telemetry_cmds.py` (`print-env` emitting `CLAUDE_CODE_ENABLE_TELEMETRY=1` + OTLP exporter vars pointed at the receiver).
Tests: protobuf and JSON fixtures in `evals/fixtures/otlp/`; correlation; orphans; dedup.
DoD: fixture OTLP payloads attach measured tokens/cost to the right session; `status` shows `otlp ✓`.

**1.6 Manual fallback + CLI polish.** `adapters/manual.py`, `cli/session_cmds.py` (`session list|show|stop`, `trace show`, `event ...`), `cli/dev_cmds.py` (`dev replay-fixture` posting a fixture JSONL through the real HTTP path).
Tests: CLI behaviors; replay-fixture reproduces canonical trace.
DoD: Chunk 1 acceptance demo passes.

### Chunk 1 Acceptance Demo

```bash
# T1
agent-sidecar start
# T2, in a repo
agent-sidecar hooks install
eval "$(agent-sidecar telemetry print-env)"
claude     # real small task: run tests, fix one failure
# T3
agent-sidecar status && agent-sidecar trace show <id>
```

**Accept when:** trace contains `session_started`, ≥1 `prompt_submitted`, ≥5 `agent_tool_observed`, ≥1 measured `cost_estimate_updated`, with **zero** manual events; killing the sidecar mid-session leaves Claude Code unaffected; `hooks uninstall` restores settings.json; the same outcome reproduces in CI from fixtures alone.

---

## Chunk 2 — Intelligence Layer: Ensemble, Refinement, Cost, Steering, Tuning Toolchain

**Proves:** the DeepSeek+Kimi ensemble improves task cost before execution (refinement) and during execution (steering), grounded in measured/priced cost, with deterministic fallback everywhere and a working path to specially trained weights.

### Milestones (in order)

**2.1 Provider + router + registry.** `models/provider.py` (LiteLLM SDK impl of B5: strict-JSON demand, single reformat retry, pydantic validation, `None` on any failure, `model_call_completed` events), `models/router.py` (role→model per B8 resolution order + hardware-tier probe), `models/registry.py`, `cli/models_cmds.py` (`models list|pull`; `promote|rollback` bookkeeping with stubbed eval in tests).
Tests: allowlist enforcement incl. loopback-pinning for `openai/*` (B7); `remote_fallback:false` + remote string ⇒ config error; timeout/garbage ⇒ `None`; router degradation when coding role unavailable; registry resolution order; **socket-level negative test proving zero network egress with default config and both endpoints down**.
DoD: `models list` shows role table with tuned/base/unavailable status; all negative guarantees test-enforced.

**2.2 Cost engine.** `intel/cost.py`: three tiers (measured from Chunk 1 OTLP > priced via vendored `litellm_prices.json` — snapshot + refresh script + attribution — > approximate `ceil(chars/4)`), mandatory `Precision` on every number, `cost show` CLI + `/sessions/:id/cost`.
Tests: tier precedence; unknown-model fallthrough; snapshot-date surfacing.
DoD: fixture sessions report the correct tier and label end-to-end.

**2.3 Deterministic refiner fallback.** `intel/refiner_fallback.py`: issue detection (vague / broad / no-validation / no-files), template-based structured rewrite.
Tests: golden files over the fixture vague-prompt set.
DoD: `refine` works fully with **no models running**, `source: deterministic`.

**2.4 Ensemble refiner.** `intel/refiner.py` implementing C2 (Kimi draft → DeepSeek judgment → assembly, all degradation paths), `models/prompts/*.txt` (versioned; template hash recorded in `model_call_completed`), `models/validation.py` (restatement rejection via length+similarity), lineage events, `cli/intel_cmds.py::refine`, `POST /refine`.
Tests: mocked-provider tests for **all four** source paths (`ensemble`, `coding-only`, DeepSeek-judges-deterministic, `deterministic`); restatement rejection; lineage lands in the right session.
DoD: `refine` output states its `source`; golden files per path.

**2.5 Detectors + normalization + rules.** `intel/normalize.py`; five detectors per B1 with thresholds from config — triggers: same normalized command 3× (or same failed command 2× with no intervening edit/diagnostic); same failure_signature 2× with no relevant edit between; same file edited 3× after same failure without successful validation; edit with no test/lint/build within N events or before stop; edits outside prompt-declared scope / keyword mismatch. `intel/rules.py`.
Tests: every detector positive + negative against `evals/fixtures/traces/` (including the canonical `auth-refresh-loop.jsonl`); labeled fixtures for calibration.
DoD: fixture replay yields exactly the expected findings, no extras.

**2.6 Steering orchestration.** `intel/steering.py` per C2 (detectors → DeepSeek `SteerResult` with evidence-subset validation → optional Kimi `NextStepDraft` → `intel/ranker.py` deterministic fallback → decision engine with dedupe + `max_warnings_per_turn` + WARN evidence threshold), auto-steer on relevant event ingestion, `steer` CLI + API, priced waste via 2.2.
Tests: evidence-subset rejection; noise controls; all fallback paths; golden terminal output for the canonical WARN.
DoD: `dev replay-fixture auth-refresh-loop.jsonl` + `steer` prints the golden WARN with evaluators, evidence ids, and `≈ $X (priced)`.

**2.7 Tuning toolchain + eval gate.** `dev export-dataset` (C3 step 1, provenance-marked), seed datasets, `tuning/recipes/*.yaml`, `tuning/export_gguf.sh`, `tuning/modelfiles/*`, `tuning/README.md`, `evals/refiner.promptfoo.yaml` + `steering.promptfoo.yaml` + `promotion.promptfoo.yaml`, real `models promote|rollback` wiring (runs promotion suite when a model is reachable; stub-injectable for CI), calibration script for detector thresholds over labeled fixtures.
Tests: dataset exporter golden output from fixture traces; Modelfile generation; promotion refuses without passing eval; rollback restores base; registry state machine.
DoD: `docs/tuning.md` walk-through is executable top-to-bottom on a machine with a GPU; CI covers all bookkeeping with stubs.

### Chunk 2 Acceptance Demo

```bash
ollama pull deepseek-r1:8b            # + Kimi per hardware tier (see C1) or skip to show degradation
agent-sidecar start
agent-sidecar models list
agent-sidecar refine "make the app better and fix the tests"
agent-sidecar dev replay-fixture evals/fixtures/traces/auth-refresh-loop.jsonl --session demo
agent-sidecar steer --session demo
agent-sidecar cost show --session demo
```

**Accept when:** `refine` produces a materially better prompt and labels its source (`ensemble` with both models; correct degraded label otherwise); the fixture triggers the golden WARN with a Kimi-drafted concrete next step when the coding role is up; every number is precision-labeled; CI is green with no models and no network; remote egress is provably impossible under default config.

---

## Chunk 3 — Replay, Summaries, Langfuse Export, Index, Packaging

**Proves:** runs are understandable, shareable, and the tool installs cleanly.

### Milestones (in order)

**3.1 Replay.** `replay/reader.py` (timestamp order, stable tiebreak), `replay/render.py`, `cli/replay_cmds.py::replay`, `GET /sessions/:id/replay`. Timeline shows prompts (before/after refinement), tool calls, failures, detector firings, steering decisions, per-model calls, cost rollup with precision labels.
Tests: ordering; golden terminal output for the canonical session.

**3.2 Summaries.** `schema/summary.py` (RunSummary incl. tokens/cost + precision, refinement issues, steering events, `estimated_waste_avoided{cost_usd, precision}`, ensemble usage stats, follow-ups), `export/markdown.py`, `export/jsonexp.py`, `summary export` CLI + API.
Tests: golden Markdown/JSON across measured/priced/approximate fixture sessions.
DoD: the Markdown answers "what happened and how did it affect cost per successful task" on one screen.

**3.3 Langfuse exporter.** `export/base.py` (Exporter protocol + ExportReceipt), `export/langfuse_exp.py` (session→trace; prompts/refinements→generations; tool events→spans; steering→events; measured usage/cost; payload truncation; receipt written as `summary_exported`), `export langfuse` CLI, explicit-enablement config.
Tests: mapping asserted against a **stubbed** Langfuse API (respx); truncation; receipts; failure never corrupts local state. Live-instance check is a documented manual demo step, not CI.

**3.4 SQLite index.** `store/index.py`, `session list` filters (`--repo`, `--since`, `--has-warning`), `index rebuild`.
Tests: index-vs-direct-JSONL equivalence; rebuild from scratch identical.

**3.5 Packaging + regression.** Wheel build; clean-venv install smoke (`--version`, `start`, `hooks status`, `refine` deterministic path, `dev replay-fixture`, `replay`, `summary export`); scripted re-run of Chunk 1 and Chunk 2 acceptance demos.
DoD: all three demos pass from an installed wheel in a clean environment.

### Chunk 3 Acceptance Demo

```bash
python -m venv .venv && . .venv/bin/activate && pip install dist/agent_sidecar-*.whl
agent-sidecar --version && agent-sidecar start
agent-sidecar dev replay-fixture evals/fixtures/traces/auth-refresh-loop.jsonl --session final
agent-sidecar steer --session final
agent-sidecar replay final
agent-sidecar summary export final --format markdown
agent-sidecar session list --has-warning
agent-sidecar export langfuse final     # optional, user-run Langfuse configured
```

---

# PART E — Cross-Cutting Rules, Risks, Demo Matrix

## E1. Testing Rules (apply to every milestone)

- **CI is offline.** No Claude Code, no Ollama, no llama-server, no network. Model behavior in CI = mocked provider returning fixture JSON (valid and invalid variants).
- **Negative guarantees are tests:** hook script exit-0 within 200ms; zero network egress under default config; remote fallback disabled by default; `promote` refuses without a passing eval; index rebuild equivalence.
- **Golden files** for: refine output per source path, steering WARN, replay timeline, Markdown/JSON summaries, dataset export.
- **Fixtures are versioned.** `docs/fixtures.md` records the Claude Code version each hook/OTLP fixture was captured against and the re-capture procedure.
- **promptfoo suites are opt-in and never CI-gating** — they run when a local model is reachable (`refiner`, `steering`) and on demand for promotion.
- **Regression rule:** each chunk's acceptance demo is scripted where possible and re-run before later chunks merge.

## E2. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| No truly small Kimi exists; Kimi-Linear GGUF support may require llama.cpp branches / llama-server rather than Ollama | Dual serving backend behind one provider seam (D8); hardware tiers with explicit `small`-tier degradation; router reports role unavailability; deterministic fallback keeps the system whole |
| Small-model JSON reliability (both families) | Strict pydantic validation, one reformat retry, evidence-subset checks, deterministic fallback as correctness baseline, promotion gate scores JSON validity explicitly |
| Fine-tunes regress quality | Eval-gated promotion (tuned must beat base), instant `rollback`, registry keeps base entries forever |
| Claude Code hook/telemetry drift across versions | Version-tagged fixtures, raw-field preservation (`raw_hook`/`raw_otel`), adapter_version in metadata, documented re-capture |
| Warning noise erodes trust | WARN evidence threshold, per-turn cap, dedupe, threshold calibration script over labeled fixtures |
| Cost dishonesty | Mandatory precision labels enforced by the type system (`CostEstimate`); measured tier always preferred |
| Tuning pipeline scope creep into runtime | Hard boundary: `src/` never imports `tuning/`; CI never trains; registry flip is the only runtime-visible effect |

## E3. Acceptance Demo Matrix

| Chunk | Demo focus | Key commands | Accept when |
| --- | --- | --- | --- |
| 1 | Zero-touch capture of a real Claude Code session | `start`, `hooks install`, `telemetry print-env`, run `claude`, `status`, `trace show` | Full automatic trace with measured cost; Claude Code never blocked; uninstall restores; fixtures reproduce it in CI |
| 2 | Ensemble refinement + steering with honest cost | `models list`, `refine`, `dev replay-fixture`, `steer`, `cost show` | Kimi-drafted / DeepSeek-judged refinement with labeled source; golden WARN with evidence + priced waste + code-aware next step; CI green offline; no egress by default |
| 3 | Replay, summary, export, install | `pip install` wheel, `replay`, `summary export`, `session list --has-warning`, `export langfuse` | One-screen honest summary; receipted explicit export; installed CLI passes all three demos |

## E4. Remaining Open Questions (record answers in docs/decisions.md as they resolve)

1. Exact OTLP session-correlation attributes emitted by the targeted Claude Code version — confirm during fixture capture (Milestone 1.5).
2. Whether the targeted Ollama version can import Kimi-Linear-48B-A3B GGUFs directly, or the llama-server backend is required — confirm during Milestone 2.1; the dual-backend design absorbs either answer.
3. Default detector thresholds after running the calibration script over the labeled fixture set (Milestone 2.7).
4. LoRA hyperparameters per role after the first real training runs — recipes ship with conservative defaults (r=16, alpha=32, 4-bit, 2-3 epochs); tune from there.
5. Whether `.agent-sidecar/` is gitignored with a committed config template, or fully ignored (default: gitignore all except a `config.example.json`).