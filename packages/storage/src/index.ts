import { createHash } from "node:crypto";

import Database from "better-sqlite3";

export type AgentKind = "codex" | "claude-code" | "generic";
export type HookEventType =
  | "run_started"
  | "prompt"
  | "tool_call"
  | "tool_result"
  | "file_edit"
  | "validation"
  | "final_attempt"
  | "compaction"
  | "run_finished"
  | "error";
export type InterventionAction =
  | "allow"
  | "warn"
  | "block"
  | "block_continue"
  | "require_validation"
  | "require_approval"
  | "inject_context";
export type PromptRewriteMode = "initial_task" | "continuation" | "compaction" | "lesson_injection";

export type JsonRecord = Record<string, unknown>;

export type NormalizedAgentEvent = {
  id: string;
  rawEventId?: string;
  runId: string;
  agent: AgentKind;
  providerEventType?: string;
  eventType: HookEventType;
  timestamp: string;
  actor: "agent" | "user" | "tool" | "system";
  summary: string;
  command?: JsonRecord;
  fileEdit?: JsonRecord;
  validation?: JsonRecord;
  tokenUsage?: JsonRecord;
  costEstimate?: JsonRecord;
  compactMetadata?: JsonRecord;
};

export type RunState = {
  runId: string;
  status: "active" | "blocked" | "completed" | "failed";
  startedAt: string;
  updatedAt: string;
  agent: AgentKind;
  repoRoot?: string;
  branch?: string;
  taskSummary?: string;
  eventCounts?: Partial<Record<HookEventType, number>>;
  recentCommands?: JsonRecord[];
  commandFrequency?: Record<string, number>;
  editedFiles?: string[];
  changedFileCount?: number;
  estimatedChangedLines?: number;
  validationSinceLastEdit?: boolean;
  lastValidation?: JsonRecord;
  pendingApprovals?: JsonRecord[];
  interventions?: Partial<Record<InterventionAction, number>>;
  tokenUsage?: JsonRecord;
  costEstimate?: JsonRecord;
  filesChanged?: string[];
  filesRead?: string[];
  filesInspected?: string[];
  commandSignatures?: string[];
  recentCommandSignatures?: string[];
  repeatedCommandCounts?: Record<string, number>;
  latestErrorSignature?: string;
  latestErrors?: string[];
  lastEditAt?: string;
  lastValidationAt?: string;
  lastValidationPassed?: boolean;
  validationCommandCount?: number;
  toolCallCount?: number;
  riskEvents?: string[];
  injectedLessons?: string[];
  promptOptimizationCount?: number;
  continuationPromptCount?: number;
  compactionPromptCount?: number;
};

export type Decision = {
  id: string;
  runId: string;
  eventId: string;
  createdAt: string;
  source: "runtime_monitor" | "steering_ensemble" | "manual" | "system";
  action: InterventionAction;
  severity: "info" | "warning" | "error";
  reasonCode: string;
  message: string;
  monitorId?: string;
  lessonIds?: string[];
  steeringDecisionId?: string;
  continuationPrompt?: string;
  expiresAt?: string;
  compactMetadata?: JsonRecord;
};

export type Policy = {
  version: 1;
  failMode: "open" | "closed";
  protectedPaths: string[];
  dangerousCommands: string[];
  broadChangeThreshold: {
    maxFilesChanged: number;
    maxLinesChanged: number;
  };
  validation: {
    requireAfterEdit: boolean;
    acceptedCommands: string[];
  };
  steering: {
    enabled: boolean;
    providers: string[];
    maxCallsPerRun: number;
    maxCostUsdPerRun: number;
  };
};

export type Lesson = {
  id: string;
  trigger: JsonRecord;
  text: string;
  confidence: number;
  evidence: JsonRecord[];
  scope: JsonRecord;
  status: "candidate" | "approved" | "disabled" | "expired";
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
};

export type TaskContract = {
  task: string;
  scope: string[];
  constraints: string[];
  acceptance_criteria: string[];
  pr_boundaries: string[];
  test_expectations: string[];
  validation_requirements: string[];
  relevant_lessons: string[];
  risk_notes: string[];
};

export type PromptOptimizationRecord = {
  result: PromptOptimizationResult;
  originalPrompt?: string;
};

export type PromptOptimizationResult = {
  id: string;
  runId: string;
  eventId: string;
  mode: PromptRewriteMode;
  originalPrompt?: string;
  optimizedPrompt: string;
  estimatedOptimizedTokens: number;
  resultQuality: "unknown" | "accepted" | "needs_followup" | "failed";
  taskContract: TaskContract;
  constraints: string[];
  validationRequirements: string[];
  relevantLessons: Lesson[];
  riskNotes: string[];
  estimatedTokenDelta: number;
  rewriteReason: string;
  shouldInject: boolean;
  injected: boolean;
  deterministicOrModel: "deterministic" | "model_assisted";
  createdAt: string;
};

export type SavingsMode = "codex_baseline" | "historical_local_baseline" | "heuristic";

export type CostEvidence = {
  runId: string;
  updatedAt: string;
  baselineInputTokens: number;
  baselineOutputTokens: number;
  baselineEstimatedCostUsd: number;
  actualInputTokens: number;
  actualOutputTokens: number;
  actualCostUsd: number;
  modelRoute?: string;
  taskType: string;
  savingsMode: SavingsMode;
  confidence: number;
  promptHashes: Record<string, string>;
};

export type SqliteStorageConfig = {
  databasePath: string;
  storeRawPrompts?: boolean;
};

export const DEFAULT_DATABASE_FILENAME = "agent-sidecar.sqlite";
const PROMPT_TEXT_REDACTED = "[prompt text redacted]";
const PROMPT_HASH_KEYS = [
  "prompt",
  "userPrompt",
  "user_prompt",
  "originalPrompt",
  "original_prompt",
  "optimizedPrompt",
  "optimized_prompt"
];

export function createStorageConfig(databasePath: string): SqliteStorageConfig {
  return { databasePath };
}

export type StoredRun = {
  id: string;
  provider: AgentKind;
  externalId?: string;
  repoRoot?: string;
  branch?: string;
  taskSummary?: string;
  status: "active" | "blocked" | "completed" | "failed";
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  successStatus?: "success" | "failure" | "unknown";
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalEstimatedCostUsd?: number;
};

export type StoredEvent = NormalizedAgentEvent & {
  rawPayload?: unknown;
};

export type SavedPolicy = {
  id: string;
  repoRoot?: string;
  policy: Policy;
  createdAt: string;
  updatedAt: string;
};

export type Feedback = {
  id: string;
  runId: string;
  decisionId?: string;
  createdAt: string;
  feedbackType: string;
  value: string;
  note?: string;
};

export type RunStateSnapshot = {
  id: string;
  runId: string;
  eventId: string;
  createdAt: string;
  state: RunState;
};

type RunRow = {
  id: string;
  provider: AgentKind;
  external_id: string | null;
  repo_root: string | null;
  branch: string | null;
  task_summary: string | null;
  status: StoredRun["status"];
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  success_status: StoredRun["successStatus"] | null;
  total_input_tokens: number;
  total_output_tokens: number;
  total_estimated_cost_usd: number;
};

type PolicyRow = {
  id: string;
  repo_root: string | null;
  policy_json: string;
  created_at: string;
  updated_at: string;
};

type EventRow = {
  event_json: string;
};

type EventPrivacyRow = {
  id: string;
  run_id: string;
  event_type: HookEventType;
  summary: string;
  event_json: string;
  raw_payload_json: string | null;
};

type DecisionRow = {
  decision_json: string;
};

type LessonRow = {
  id: string;
  lesson_json: string;
};

type SnapshotRow = {
  id: string;
  run_id: string;
  event_id: string;
  created_at: string;
  state_json: string;
};

type PromptOptimizationRow = {
  id: string;
  run_id: string;
  event_id: string;
  mode: PromptOptimizationResult["mode"];
  original_prompt: string | null;
  optimized_prompt: string;
  task_contract_json: string;
  rewrite_reason: string;
  should_inject: 0 | 1;
  injected: 0 | 1;
  deterministic_or_model: PromptOptimizationResult["deterministicOrModel"];
  estimated_token_delta: number;
  created_at: string;
  result_json: string;
};

type CostEvidenceRow = {
  run_id: string;
  updated_at: string;
  baseline_input_tokens: number;
  baseline_output_tokens: number;
  baseline_estimated_cost_usd: number;
  actual_input_tokens: number;
  actual_output_tokens: number;
  actual_cost_usd: number;
  model_route: string | null;
  task_type: string;
  savings_mode: SavingsMode;
  confidence: number;
  prompt_hashes_json: string;
};

export class Storage {
  private readonly db: Database.Database;
  private readonly storeRawPrompts: boolean;

  constructor(config: SqliteStorageConfig) {
    this.db = new Database(config.databasePath);
    this.storeRawPrompts = config.storeRawPrompts ?? false;
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  createRun(run: StoredRun): StoredRun {
    this.db
      .prepare(
        `
        INSERT INTO runs (
          id, provider, external_id, repo_root, branch, task_summary, status,
          started_at, updated_at, completed_at, success_status,
          total_input_tokens, total_output_tokens, total_estimated_cost_usd
        ) VALUES (
          @id, @provider, @externalId, @repoRoot, @branch, @taskSummary, @status,
          @startedAt, @updatedAt, @completedAt, @successStatus,
          @totalInputTokens, @totalOutputTokens, @totalEstimatedCostUsd
        )
      `
      )
      .run({
        ...run,
        externalId: run.externalId ?? null,
        repoRoot: run.repoRoot ?? null,
        branch: run.branch ?? null,
        taskSummary: run.taskSummary ?? null,
        completedAt: run.completedAt ?? null,
        successStatus: run.successStatus ?? null,
        totalInputTokens: run.totalInputTokens ?? 0,
        totalOutputTokens: run.totalOutputTokens ?? 0,
        totalEstimatedCostUsd: run.totalEstimatedCostUsd ?? 0
      });

    return run;
  }

  updateRunFromEvent(event: StoredEvent): StoredRun | undefined {
    const existing = this.getRun(event.runId);
    if (!existing) {
      return undefined;
    }

    const inputTokens = numberFromRecord(event.tokenUsage, ["inputTokens", "input_tokens", "prompt_tokens"]);
    const outputTokens = numberFromRecord(event.tokenUsage, ["outputTokens", "output_tokens", "completion_tokens"]);
    const costUsd = numberFromRecord(event.costEstimate, ["amountUsd", "amount_usd", "costUsd", "cost_usd"]);
    const completed = event.eventType === "run_finished";
    const status = completed ? "completed" : existing.status;
    const taskSummary = event.eventType === "prompt" ? event.summary : existing.taskSummary;

    this.db
      .prepare(
        `
        UPDATE runs
        SET
          task_summary = @taskSummary,
          status = @status,
          updated_at = @updatedAt,
          completed_at = COALESCE(@completedAt, completed_at),
          total_input_tokens = total_input_tokens + @inputTokens,
          total_output_tokens = total_output_tokens + @outputTokens,
          total_estimated_cost_usd = total_estimated_cost_usd + @costUsd
        WHERE id = @runId
      `
      )
      .run({
        runId: event.runId,
        taskSummary: taskSummary ?? null,
        status,
        updatedAt: event.timestamp,
        completedAt: completed ? event.timestamp : null,
        inputTokens,
        outputTokens,
        costUsd
      });

    return this.getRun(event.runId);
  }

  listRuns(limit = 100): StoredRun[] {
    const rows = this.db
      .prepare("SELECT * FROM runs ORDER BY updated_at DESC LIMIT ?")
      .all(limit) as RunRow[];

    return rows.map(runFromRow);
  }

  getRun(id: string): StoredRun | undefined {
    const row = this.db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as RunRow | undefined;
    return row ? runFromRow(row) : undefined;
  }

  addEvent(event: StoredEvent): StoredEvent {
    this.db
      .prepare(
        `
        INSERT INTO events (
          id, run_id, provider, event_type, actor, timestamp, summary,
          event_json, raw_payload_json
        ) VALUES (
          @id, @runId, @provider, @eventType, @actor, @timestamp, @summary,
          @eventJson, @rawPayloadJson
        )
      `
      )
      .run({
        id: event.id,
        runId: event.runId,
        provider: event.agent,
        eventType: event.eventType,
        actor: event.actor,
        timestamp: event.timestamp,
        summary: event.summary,
        eventJson: JSON.stringify(stripUndefined(event)),
        rawPayloadJson: event.rawPayload === undefined ? null : JSON.stringify(event.rawPayload)
      });

    return event;
  }

  listEventsForRun(runId: string): StoredEvent[] {
    const rows = this.db
      .prepare(
        `
        SELECT event_json FROM events
        WHERE run_id = ?
        ORDER BY timestamp ASC, id ASC
      `
      )
      .all(runId) as EventRow[];

    return rows.map((row) => JSON.parse(row.event_json) as StoredEvent);
  }

  addDecision(decision: Decision): Decision {
    this.db
      .prepare(
        `
        INSERT INTO decisions (
          id, run_id, event_id, created_at, source, action, severity,
          reason_code, message, monitor_id, steering_decision_id, decision_json
        ) VALUES (
          @id, @runId, @eventId, @createdAt, @source, @action, @severity,
          @reasonCode, @message, @monitorId, @steeringDecisionId, @decisionJson
        )
      `
      )
      .run({
        id: decision.id,
        runId: decision.runId,
        eventId: decision.eventId,
        createdAt: decision.createdAt,
        source: decision.source,
        action: decision.action,
        severity: decision.severity,
        reasonCode: decision.reasonCode,
        message: decision.message,
        monitorId: decision.monitorId ?? null,
        steeringDecisionId: decision.steeringDecisionId ?? null,
        decisionJson: JSON.stringify(stripUndefined(decision))
      });

    return decision;
  }

  listDecisionsForRun(runId: string): Decision[] {
    const rows = this.db
      .prepare(
        `
        SELECT decision_json FROM decisions
        WHERE run_id = ?
        ORDER BY created_at ASC, id ASC
      `
      )
      .all(runId) as DecisionRow[];

    return rows.map((row) => JSON.parse(row.decision_json) as Decision);
  }

  saveRunStateSnapshot(snapshot: RunStateSnapshot): RunStateSnapshot {
    this.db
      .prepare(
        `
        INSERT INTO run_state_snapshots (id, run_id, event_id, created_at, state_json)
        VALUES (@id, @runId, @eventId, @createdAt, @stateJson)
      `
      )
      .run({
        id: snapshot.id,
        runId: snapshot.runId,
        eventId: snapshot.eventId,
        createdAt: snapshot.createdAt,
        stateJson: JSON.stringify(stripUndefined(snapshot.state))
      });

    return snapshot;
  }

  getLatestRunStateSnapshot(runId: string): RunStateSnapshot | undefined {
    const row = this.db
      .prepare(
        `
        SELECT * FROM run_state_snapshots
        WHERE run_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `
      )
      .get(runId) as SnapshotRow | undefined;

    return row
      ? {
          id: row.id,
          runId: row.run_id,
          eventId: row.event_id,
          createdAt: row.created_at,
          state: JSON.parse(row.state_json) as RunState
        }
      : undefined;
  }

  savePolicy(policy: SavedPolicy): SavedPolicy {
    if (!policy.repoRoot) {
      const existing = this.db.prepare("SELECT id FROM policies WHERE repo_root IS NULL").get() as
        | { id: string }
        | undefined;

      if (existing) {
        this.db
          .prepare(
            `
            UPDATE policies
            SET id = @id, policy_json = @policyJson, updated_at = @updatedAt
            WHERE repo_root IS NULL
          `
          )
          .run({
            id: policy.id,
            policyJson: JSON.stringify(policy.policy),
            updatedAt: policy.updatedAt
          });

        return policy;
      }
    }

    this.db
      .prepare(
        `
        INSERT INTO policies (id, repo_root, policy_json, created_at, updated_at)
        VALUES (@id, @repoRoot, @policyJson, @createdAt, @updatedAt)
        ON CONFLICT(repo_root) DO UPDATE SET
          policy_json = excluded.policy_json,
          updated_at = excluded.updated_at
      `
      )
      .run({
        id: policy.id,
        repoRoot: policy.repoRoot ?? null,
        policyJson: JSON.stringify(policy.policy),
        createdAt: policy.createdAt,
        updatedAt: policy.updatedAt
      });

    return policy;
  }

  getPolicyForRepo(repoRoot?: string): SavedPolicy | undefined {
    const row = (
      repoRoot
        ? this.db.prepare("SELECT * FROM policies WHERE repo_root = ?").get(repoRoot)
        : this.db.prepare("SELECT * FROM policies WHERE repo_root IS NULL").get()
    ) as PolicyRow | undefined;

    if (row) {
      return policyFromRow(row);
    }

    if (repoRoot) {
      const fallback = this.db.prepare("SELECT * FROM policies WHERE repo_root IS NULL").get() as
        | PolicyRow
        | undefined;
      return fallback ? policyFromRow(fallback) : undefined;
    }

    return undefined;
  }

  createLesson(lesson: Lesson): Lesson {
    this.db
      .prepare(
        `
        INSERT INTO lessons (
          id, status, trigger_json, text, confidence, scope_json,
          evidence_json, created_at, updated_at, expires_at, lesson_json
        ) VALUES (
          @id, @status, @triggerJson, @text, @confidence, @scopeJson,
          @evidenceJson, @createdAt, @updatedAt, @expiresAt, @lessonJson
        )
      `
      )
      .run(lessonParams(lesson));

    return lesson;
  }

  updateLessonStatus(id: string, status: Lesson["status"], updatedAt = new Date().toISOString()): Lesson | undefined {
    const existing = this.getLesson(id);
    if (!existing) {
      return undefined;
    }

    const updated: Lesson = {
      ...existing,
      status,
      updatedAt
    };

    this.db
      .prepare(
        `
        UPDATE lessons
        SET status = @status, updated_at = @updatedAt, lesson_json = @lessonJson
        WHERE id = @id
      `
      )
      .run({
        id,
        status,
        updatedAt,
        lessonJson: JSON.stringify(stripUndefined(updated))
      });

    return updated;
  }

  listLessons(status?: Lesson["status"]): Lesson[] {
    const rows = (
      status
        ? this.db.prepare("SELECT id, lesson_json FROM lessons WHERE status = ? ORDER BY updated_at DESC").all(status)
        : this.db.prepare("SELECT id, lesson_json FROM lessons ORDER BY updated_at DESC").all()
    ) as LessonRow[];

    return rows.map((row) => JSON.parse(row.lesson_json) as Lesson);
  }

  addFeedback(feedback: Feedback): Feedback {
    this.db
      .prepare(
        `
        INSERT INTO feedback (id, run_id, decision_id, created_at, feedback_type, value, note)
        VALUES (@id, @runId, @decisionId, @createdAt, @feedbackType, @value, @note)
      `
      )
      .run({
        ...feedback,
        decisionId: feedback.decisionId ?? null,
        note: feedback.note ?? null
      });

    return feedback;
  }

  savePromptOptimization(
    optimization: PromptOptimizationResult,
    options: { originalPrompt?: string } = {}
  ): PromptOptimizationResult {
    const persistedOptimization: PromptOptimizationResult = this.storeRawPrompts
      ? optimization
      : {
          ...optimization,
          originalPrompt: undefined,
          optimizedPrompt: PROMPT_TEXT_REDACTED
        };

    this.db
      .prepare(
        `
        INSERT INTO prompt_optimizations (
          id, run_id, event_id, mode, original_prompt, optimized_prompt,
          task_contract_json, rewrite_reason, should_inject, injected,
          deterministic_or_model, estimated_token_delta, created_at, result_json
        ) VALUES (
          @id, @runId, @eventId, @mode, @originalPrompt, @optimizedPrompt,
          @taskContractJson, @rewriteReason, @shouldInject, @injected,
          @deterministicOrModel, @estimatedTokenDelta, @createdAt, @resultJson
        )
      `
      )
      .run({
        id: optimization.id,
        runId: optimization.runId,
        eventId: optimization.eventId,
        mode: optimization.mode,
        originalPrompt: this.storeRawPrompts ? (options.originalPrompt ?? null) : null,
        optimizedPrompt: persistedOptimization.optimizedPrompt,
        taskContractJson: JSON.stringify(optimization.taskContract),
        rewriteReason: optimization.rewriteReason,
        shouldInject: optimization.shouldInject ? 1 : 0,
        injected: optimization.injected ? 1 : 0,
        deterministicOrModel: optimization.deterministicOrModel,
        estimatedTokenDelta: optimization.estimatedTokenDelta,
        createdAt: optimization.createdAt,
        resultJson: JSON.stringify(stripUndefined(persistedOptimization))
      });

    return persistedOptimization;
  }

  getPromptOptimizationsForRun(runId: string): PromptOptimizationResult[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM prompt_optimizations
        WHERE run_id = ?
        ORDER BY created_at ASC, id ASC
      `
      )
      .all(runId) as PromptOptimizationRow[];

    return rows.map((row) => JSON.parse(row.result_json) as PromptOptimizationResult);
  }

  getPromptOptimizationRecordsForRun(runId: string): PromptOptimizationRecord[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM prompt_optimizations
        WHERE run_id = ?
        ORDER BY created_at ASC, id ASC
      `
      )
      .all(runId) as PromptOptimizationRow[];

    return rows.map((row) => ({
      result: JSON.parse(row.result_json) as PromptOptimizationResult,
      originalPrompt: row.original_prompt ?? undefined
    }));
  }

  saveCostEvidence(evidence: CostEvidence): CostEvidence {
    this.db
      .prepare(
        `
        INSERT INTO cost_evidence (
          run_id, updated_at, baseline_input_tokens, baseline_output_tokens,
          baseline_estimated_cost_usd, actual_input_tokens, actual_output_tokens,
          actual_cost_usd, model_route, task_type, savings_mode, confidence,
          prompt_hashes_json
        ) VALUES (
          @runId, @updatedAt, @baselineInputTokens, @baselineOutputTokens,
          @baselineEstimatedCostUsd, @actualInputTokens, @actualOutputTokens,
          @actualCostUsd, @modelRoute, @taskType, @savingsMode, @confidence,
          @promptHashesJson
        )
        ON CONFLICT(run_id) DO UPDATE SET
          updated_at = excluded.updated_at,
          baseline_input_tokens = excluded.baseline_input_tokens,
          baseline_output_tokens = excluded.baseline_output_tokens,
          baseline_estimated_cost_usd = excluded.baseline_estimated_cost_usd,
          actual_input_tokens = excluded.actual_input_tokens,
          actual_output_tokens = excluded.actual_output_tokens,
          actual_cost_usd = excluded.actual_cost_usd,
          model_route = excluded.model_route,
          task_type = excluded.task_type,
          savings_mode = excluded.savings_mode,
          confidence = excluded.confidence,
          prompt_hashes_json = excluded.prompt_hashes_json
      `
      )
      .run({
        ...evidence,
        modelRoute: evidence.modelRoute ?? null,
        promptHashesJson: JSON.stringify(evidence.promptHashes)
      });

    return evidence;
  }

  getCostEvidenceForRun(runId: string): CostEvidence | undefined {
    const row = this.db.prepare("SELECT * FROM cost_evidence WHERE run_id = ?").get(runId) as CostEvidenceRow | undefined;
    return row ? costEvidenceFromRow(row) : undefined;
  }

  getHistoricalCostEvidence(taskType: string, excludeRunId?: string, limit = 20): CostEvidence[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM cost_evidence
        WHERE task_type = ?
          AND run_id != COALESCE(?, '')
          AND (baseline_estimated_cost_usd > 0 OR actual_cost_usd > 0)
        ORDER BY updated_at DESC
        LIMIT ?
      `
      )
      .all(taskType, excludeRunId ?? null, limit) as CostEvidenceRow[];
    return rows.map(costEvidenceFromRow);
  }

  private getLesson(id: string): Lesson | undefined {
    const row = this.db.prepare("SELECT id, lesson_json FROM lessons WHERE id = ?").get(id) as LessonRow | undefined;
    return row ? (JSON.parse(row.lesson_json) as Lesson) : undefined;
  }

  private redactStoredPromptText(): void {
    const promptRows = this.db.prepare("SELECT id, result_json FROM prompt_optimizations").all() as Array<{
      id: string;
      result_json: string;
    }>;
    const updatePromptOptimization = this.db.prepare(
      `
      UPDATE prompt_optimizations
      SET original_prompt = NULL,
          optimized_prompt = @optimizedPrompt,
          result_json = @resultJson
      WHERE id = @id
    `
    );

    for (const row of promptRows) {
      const result = safeJsonParse(row.result_json);
      const redacted = {
        ...result,
        originalPrompt: undefined,
        optimizedPrompt: PROMPT_TEXT_REDACTED
      };
      updatePromptOptimization.run({
        id: row.id,
        optimizedPrompt: PROMPT_TEXT_REDACTED,
        resultJson: JSON.stringify(stripUndefined(redacted))
      });
    }

    const eventRows = this.db
      .prepare("SELECT id, run_id, event_type, summary, event_json, raw_payload_json FROM events")
      .all() as EventPrivacyRow[];
    const updateEvent = this.db.prepare(
      `
      UPDATE events
      SET summary = @summary,
          event_json = @eventJson,
          raw_payload_json = @rawPayloadJson
      WHERE id = @id
    `
    );
    const updateRunTaskSummary = this.db.prepare(
      `
      UPDATE runs
      SET task_summary = @taskSummary
      WHERE id = @runId
        AND task_summary = @previousSummary
    `
    );

    for (const row of eventRows) {
      const eventJson = safeJsonParse(row.event_json);
      const rawPayload = row.raw_payload_json ? safeJsonParse(row.raw_payload_json) : undefined;
      const promptText =
        findPromptTextInValue(rawPayload) ??
        findPromptTextInValue(asStorageRecord(eventJson).compactMetadata) ??
        (row.event_type === "prompt" ? row.summary : undefined);
      const promptHash = promptText ? hashStorageString(promptText) : undefined;
      const sanitizedRawPayload = sanitizePromptStoragePayload(rawPayload);
      const sanitizedEvent = sanitizePromptStoragePayload({
        ...eventJson,
        rawPayload: sanitizedRawPayload,
        compactMetadata: {
          ...asStorageRecord(asStorageRecord(eventJson).compactMetadata),
          ...(promptHash ? { promptHash } : {})
        }
      }) as JsonRecord;
      const summary = row.event_type === "prompt" ? "Prompt submitted" : row.summary;
      sanitizedEvent.summary = summary;

      updateEvent.run({
        id: row.id,
        summary,
        eventJson: JSON.stringify(stripUndefined(sanitizedEvent)),
        rawPayloadJson: sanitizedRawPayload === undefined ? null : JSON.stringify(stripUndefined(sanitizedRawPayload))
      });

      if (row.event_type === "prompt") {
        updateRunTaskSummary.run({
          runId: row.run_id,
          previousSummary: row.summary,
          taskSummary: "Prompt submitted"
        });
      }
    }
  }

  private migrate(): void {
    const version = this.db.pragma("user_version", { simple: true }) as number;

    if (version < 1) {
      const runMigration = this.db.transaction(() => {
        this.db.exec(`
        CREATE TABLE IF NOT EXISTS runs (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          external_id TEXT,
          repo_root TEXT,
          branch TEXT,
          task_summary TEXT,
          status TEXT NOT NULL,
          started_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          completed_at TEXT,
          success_status TEXT,
          total_input_tokens INTEGER NOT NULL DEFAULT 0,
          total_output_tokens INTEGER NOT NULL DEFAULT 0,
          total_estimated_cost_usd REAL NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS events (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          event_type TEXT NOT NULL,
          actor TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          summary TEXT NOT NULL,
          event_json TEXT NOT NULL,
          raw_payload_json TEXT,
          FOREIGN KEY (run_id) REFERENCES runs(id)
        );

        CREATE TABLE IF NOT EXISTS decisions (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          event_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          source TEXT NOT NULL,
          action TEXT NOT NULL,
          severity TEXT NOT NULL,
          reason_code TEXT NOT NULL,
          message TEXT NOT NULL,
          monitor_id TEXT,
          steering_decision_id TEXT,
          decision_json TEXT NOT NULL,
          FOREIGN KEY (run_id) REFERENCES runs(id),
          FOREIGN KEY (event_id) REFERENCES events(id)
        );

        CREATE TABLE IF NOT EXISTS policies (
          id TEXT PRIMARY KEY,
          repo_root TEXT UNIQUE,
          policy_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS lessons (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          trigger_json TEXT NOT NULL,
          text TEXT NOT NULL,
          confidence REAL NOT NULL,
          scope_json TEXT NOT NULL,
          evidence_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          expires_at TEXT,
          lesson_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS feedback (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          decision_id TEXT,
          created_at TEXT NOT NULL,
          feedback_type TEXT NOT NULL,
          value TEXT NOT NULL,
          note TEXT,
          FOREIGN KEY (run_id) REFERENCES runs(id),
          FOREIGN KEY (decision_id) REFERENCES decisions(id)
        );

        CREATE TABLE IF NOT EXISTS run_state_snapshots (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          event_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          state_json TEXT NOT NULL,
          FOREIGN KEY (run_id) REFERENCES runs(id),
          FOREIGN KEY (event_id) REFERENCES events(id)
        );

        CREATE TABLE IF NOT EXISTS prompt_optimizations (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          event_id TEXT NOT NULL,
          mode TEXT NOT NULL,
          original_prompt TEXT,
          optimized_prompt TEXT NOT NULL,
          task_contract_json TEXT NOT NULL,
          rewrite_reason TEXT NOT NULL,
          should_inject INTEGER NOT NULL,
          injected INTEGER NOT NULL,
          deterministic_or_model TEXT NOT NULL,
          estimated_token_delta INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          result_json TEXT NOT NULL,
          FOREIGN KEY (run_id) REFERENCES runs(id),
          FOREIGN KEY (event_id) REFERENCES events(id)
        );

        CREATE INDEX IF NOT EXISTS idx_runs_updated_at ON runs(updated_at);
        CREATE INDEX IF NOT EXISTS idx_runs_provider_updated_at ON runs(provider, updated_at);
        CREATE INDEX IF NOT EXISTS idx_events_run_timestamp ON events(run_id, timestamp);
        CREATE INDEX IF NOT EXISTS idx_decisions_run_created_at ON decisions(run_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_lessons_status_updated_at ON lessons(status, updated_at);
        CREATE INDEX IF NOT EXISTS idx_feedback_run_created_at ON feedback(run_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_snapshots_run_created_at ON run_state_snapshots(run_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_prompt_optimizations_run_created_at
          ON prompt_optimizations(run_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_prompt_optimizations_event_id ON prompt_optimizations(event_id);
      `);

        this.db.pragma("user_version = 1");
      });

      runMigration();
    }

    if (version < 2) {
      const costEvidenceMigration = this.db.transaction(() => {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS cost_evidence (
            run_id TEXT PRIMARY KEY,
            updated_at TEXT NOT NULL,
            baseline_input_tokens INTEGER NOT NULL DEFAULT 0,
            baseline_output_tokens INTEGER NOT NULL DEFAULT 0,
            baseline_estimated_cost_usd REAL NOT NULL DEFAULT 0,
            actual_input_tokens INTEGER NOT NULL DEFAULT 0,
            actual_output_tokens INTEGER NOT NULL DEFAULT 0,
            actual_cost_usd REAL NOT NULL DEFAULT 0,
            model_route TEXT,
            task_type TEXT NOT NULL,
            savings_mode TEXT NOT NULL,
            confidence REAL NOT NULL,
            prompt_hashes_json TEXT NOT NULL,
            FOREIGN KEY (run_id) REFERENCES runs(id)
          );

          CREATE INDEX IF NOT EXISTS idx_cost_evidence_task_type_updated_at
            ON cost_evidence(task_type, updated_at);
        `);

        this.db.pragma("user_version = 2");
      });

      costEvidenceMigration();
    }

    if (version < 3) {
      const promptPrivacyMigration = this.db.transaction(() => {
        this.redactStoredPromptText();
        this.db.pragma("user_version = 3");
      });

      promptPrivacyMigration();
    }
  }
}

function runFromRow(row: RunRow): StoredRun {
  return {
    id: row.id,
    provider: row.provider,
    externalId: row.external_id ?? undefined,
    repoRoot: row.repo_root ?? undefined,
    branch: row.branch ?? undefined,
    taskSummary: row.task_summary ?? undefined,
    status: row.status,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
    successStatus: row.success_status ?? undefined,
    totalInputTokens: row.total_input_tokens,
    totalOutputTokens: row.total_output_tokens,
    totalEstimatedCostUsd: row.total_estimated_cost_usd
  };
}

function policyFromRow(row: PolicyRow): SavedPolicy {
  return {
    id: row.id,
    repoRoot: row.repo_root ?? undefined,
    policy: JSON.parse(row.policy_json) as Policy,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function lessonParams(lesson: Lesson): Record<string, unknown> {
  return {
    id: lesson.id,
    status: lesson.status,
    triggerJson: JSON.stringify(lesson.trigger),
    text: lesson.text,
    confidence: lesson.confidence,
    scopeJson: JSON.stringify(lesson.scope),
    evidenceJson: JSON.stringify(lesson.evidence),
    createdAt: lesson.createdAt,
    updatedAt: lesson.updatedAt,
    expiresAt: lesson.expiresAt ?? null,
    lessonJson: JSON.stringify(stripUndefined(lesson))
  };
}

function costEvidenceFromRow(row: CostEvidenceRow): CostEvidence {
  return {
    runId: row.run_id,
    updatedAt: row.updated_at,
    baselineInputTokens: row.baseline_input_tokens,
    baselineOutputTokens: row.baseline_output_tokens,
    baselineEstimatedCostUsd: row.baseline_estimated_cost_usd,
    actualInputTokens: row.actual_input_tokens,
    actualOutputTokens: row.actual_output_tokens,
    actualCostUsd: row.actual_cost_usd,
    modelRoute: row.model_route ?? undefined,
    taskType: row.task_type,
    savingsMode: row.savings_mode,
    confidence: row.confidence,
    promptHashes: JSON.parse(row.prompt_hashes_json) as Record<string, string>
  };
}

function numberFromRecord(record: JsonRecord | undefined, keys: string[]): number {
  if (!record) {
    return 0;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return 0;
}

function sanitizePromptStoragePayload(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizePromptStoragePayload(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const sanitized: JsonRecord = {};
  for (const [key, childValue] of Object.entries(value as JsonRecord)) {
    if (PROMPT_HASH_KEYS.includes(key) && typeof childValue === "string") {
      sanitized[`${key}Hash`] = hashStorageString(childValue);
      continue;
    }
    sanitized[key] = sanitizePromptStoragePayload(childValue);
  }
  return sanitized;
}

function findPromptTextInValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findPromptTextInValue(item);
      if (nested) {
        return nested;
      }
    }
    return undefined;
  }

  const record = asStorageRecord(value);
  for (const key of PROMPT_HASH_KEYS) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  for (const nested of Object.values(record)) {
    const candidate = findPromptTextInValue(nested);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

function asStorageRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function safeJsonParse(value: string): JsonRecord {
  try {
    return asStorageRecord(JSON.parse(value));
  } catch {
    return {};
  }
}

function hashStorageString(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
