import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import {
  createStorageConfig,
  DEFAULT_DATABASE_FILENAME,
  Storage,
  type Decision,
  type Lesson,
  type NormalizedAgentEvent,
  type Policy,
  type PromptOptimizationResult,
  type RunState,
  type StoredRun,
  type TaskContract
} from "./index.js";

const now = "2026-05-31T12:00:00.000Z";

const policy: Policy = {
  version: 1,
  failMode: "open",
  protectedPaths: [".env"],
  dangerousCommands: ["rm -rf /"],
  broadChangeThreshold: {
    maxFilesChanged: 10,
    maxLinesChanged: 500
  },
  validation: {
    requireAfterEdit: true,
    acceptedCommands: ["pnpm test"]
  },
  steering: {
    enabled: false,
    providers: [],
    maxCallsPerRun: 0,
    maxCostUsdPerRun: 0
  }
};

const taskContract: TaskContract = {
  task: "Implement SQLite storage.",
  scope: ["packages/storage"],
  constraints: ["Store locally only."],
  validation_requirements: ["Run pnpm test."],
  relevant_lessons: ["Keep storage APIs deterministic."],
  risk_notes: ["Raw prompt storage should remain optional."]
};

let tempDirs: string[] = [];

async function createTempDatabasePath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "agent-sidecar-storage-"));
  tempDirs.push(dir);
  return join(dir, "test.sqlite");
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("@agent-sidecar/storage", () => {
  it("creates a SQLite-ready storage config", () => {
    expect(DEFAULT_DATABASE_FILENAME).toBe("agent-sidecar.sqlite");
    expect(createStorageConfig("/tmp/agent-sidecar.sqlite")).toEqual({
      databasePath: "/tmp/agent-sidecar.sqlite"
    });
  });

  it("runs migrations automatically", async () => {
    const databasePath = await createTempDatabasePath();
    const storage = new Storage({ databasePath });
    storage.close();

    const db = new Database(databasePath, { readonly: true });
    const tables = db
      .prepare(
        `
        SELECT name FROM sqlite_master
        WHERE type = 'table'
        ORDER BY name
      `
      )
      .all() as Array<{ name: string }>;
    const userVersion = db.pragma("user_version", { simple: true });
    db.close();

    expect(userVersion).toBe(1);
    expect(tables.map((table) => table.name)).toEqual(
      expect.arrayContaining([
        "runs",
        "events",
        "decisions",
        "policies",
        "lessons",
        "feedback",
        "run_state_snapshots",
        "prompt_optimizations"
      ])
    );
  });

  it("stores runs, events, decisions, snapshots, policies, lessons, feedback, and prompt optimizations", async () => {
    const databasePath = await createTempDatabasePath();
    const storage = new Storage({ databasePath });

    const run: StoredRun = {
      id: "run-1",
      provider: "codex",
      externalId: "external-run-1",
      repoRoot: "/repo",
      branch: "main",
      taskSummary: "Implement SQLite storage.",
      status: "active",
      startedAt: now,
      updatedAt: now,
      totalInputTokens: 100,
      totalOutputTokens: 20,
      totalEstimatedCostUsd: 0.01
    };

    storage.createRun(run);

    const event: NormalizedAgentEvent & { rawPayload: unknown } = {
      id: "event-1",
      rawEventId: "raw-1",
      runId: run.id,
      agent: "codex",
      providerEventType: "UserPromptSubmit",
      eventType: "prompt",
      timestamp: now,
      actor: "user",
      summary: "User asked to implement SQLite storage.",
      compactMetadata: {
        repo: "agent-guard"
      },
      rawPayload: {
        providerEventType: "UserPromptSubmit",
        prompt: "Implement storage."
      }
    };

    storage.addEvent(event);

    const decision: Decision = {
      id: "decision-1",
      runId: run.id,
      eventId: event.id,
      createdAt: now,
      source: "runtime_monitor",
      action: "allow",
      severity: "info",
      reasonCode: "runtime.allow",
      message: "No policy violations found.",
      compactMetadata: {}
    };

    storage.addDecision(decision);

    const state: RunState = {
      runId: run.id,
      status: "active",
      startedAt: now,
      updatedAt: now,
      agent: "codex",
      repoRoot: "/repo",
      taskSummary: "Implement SQLite storage.",
      eventCounts: {
        prompt: 1
      },
      recentCommands: [],
      commandFrequency: {},
      editedFiles: [],
      changedFileCount: 0,
      estimatedChangedLines: 0,
      validationSinceLastEdit: false,
      pendingApprovals: [],
      interventions: {
        allow: 1
      },
      tokenUsage: {
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120
      },
      costEstimate: {
        amountUsd: 0.01,
        source: "estimated"
      }
    };

    storage.saveRunStateSnapshot({
      id: "snapshot-1",
      runId: run.id,
      eventId: event.id,
      createdAt: now,
      state
    });

    storage.savePolicy({
      id: "policy-1",
      repoRoot: "/repo",
      policy,
      createdAt: now,
      updatedAt: now
    });
    storage.savePolicy({
      id: "policy-global-1",
      policy: {
        ...policy,
        failMode: "closed"
      },
      createdAt: now,
      updatedAt: now
    });
    storage.savePolicy({
      id: "policy-global-2",
      policy,
      createdAt: now,
      updatedAt: "2026-05-31T12:01:00.000Z"
    });

    const lesson: Lesson = {
      id: "lesson-1",
      trigger: {
        languages: ["typescript"],
        frameworks: [],
        pathGlobs: ["packages/storage/**"],
        commandTypes: ["test"],
        failureTypes: ["validation_missing"],
        tags: ["storage"]
      },
      text: "Keep lesson text short and operational; never store raw reasoning.",
      confidence: 0.8,
      evidence: [
        {
          runId: run.id,
          eventIds: [event.id],
          summary: "Storage implementation needed compact operational lessons."
        }
      ],
      scope: {
        kind: "repo",
        value: "agent-guard"
      },
      status: "candidate",
      createdAt: now,
      updatedAt: now
    };

    storage.createLesson(lesson);
    const updatedLesson = storage.updateLessonStatus(lesson.id, "approved", "2026-05-31T12:01:00.000Z");

    storage.addFeedback({
      id: "feedback-1",
      runId: run.id,
      decisionId: decision.id,
      createdAt: now,
      feedbackType: "intervention_usefulness",
      value: "accepted",
      note: "Decision was useful."
    });

    const promptOptimization: PromptOptimizationResult = {
      id: "prompt-optimization-1",
      runId: run.id,
      eventId: event.id,
      mode: "initial_task",
      optimizedPrompt: "Task: Implement SQLite storage.\nValidation: Run pnpm test.",
      taskContract,
      constraints: taskContract.constraints,
      validationRequirements: taskContract.validation_requirements,
      relevantLessons: [updatedLesson ?? { ...lesson, status: "approved" }],
      riskNotes: taskContract.risk_notes,
      estimatedTokenDelta: -12,
      rewriteReason: "Converted request into a compact task contract.",
      shouldInject: true,
      injected: true,
      deterministicOrModel: "deterministic",
      createdAt: now
    };

    storage.savePromptOptimization(promptOptimization, {
      originalPrompt: "Implement storage."
    });

    expect(storage.getRun(run.id)).toMatchObject(run);
    expect(storage.listRuns()).toHaveLength(1);
    expect(storage.listEventsForRun(run.id)).toEqual([event]);
    expect(storage.listDecisionsForRun(run.id)).toEqual([decision]);
    expect(storage.getLatestRunStateSnapshot(run.id)?.state.validationSinceLastEdit).toBe(false);
    expect(storage.getPolicyForRepo("/repo")?.policy.validation.requireAfterEdit).toBe(true);
    expect(storage.getPolicyForRepo("/unknown")?.id).toBe("policy-global-2");
    expect(storage.listLessons("approved")).toHaveLength(1);
    expect(storage.getPromptOptimizationsForRun(run.id)).toEqual([promptOptimization]);

    storage.close();
  });

  it("can omit original prompt text while preserving prompt optimization metadata", async () => {
    const databasePath = await createTempDatabasePath();
    const storage = new Storage({ databasePath, storeRawPrompts: false });

    const run: StoredRun = {
      id: "run-privacy",
      provider: "codex",
      status: "active",
      startedAt: now,
      updatedAt: now
    };
    storage.createRun(run);
    storage.addEvent({
      id: "event-privacy",
      runId: run.id,
      agent: "codex",
      eventType: "prompt",
      timestamp: now,
      actor: "user",
      summary: "User submitted prompt.",
      compactMetadata: {}
    });
    storage.savePromptOptimization(
      {
        id: "prompt-optimization-privacy",
        runId: run.id,
        eventId: "event-privacy",
        mode: "initial_task",
        optimizedPrompt: "Task: Keep prompt text out of storage.",
        taskContract,
        constraints: taskContract.constraints,
        validationRequirements: taskContract.validation_requirements,
        relevantLessons: [],
        riskNotes: taskContract.risk_notes,
        estimatedTokenDelta: -1,
        rewriteReason: "Privacy configuration disabled original prompt storage.",
        shouldInject: true,
        injected: true,
        deterministicOrModel: "deterministic",
        createdAt: now
      },
      {
        originalPrompt: "Sensitive raw prompt"
      }
    );
    storage.close();

    const db = new Database(databasePath, { readonly: true });
    const row = db
      .prepare("SELECT original_prompt, optimized_prompt FROM prompt_optimizations WHERE id = ?")
      .get("prompt-optimization-privacy") as { original_prompt: string | null; optimized_prompt: string };
    db.close();

    expect(row.original_prompt).toBeNull();
    expect(row.optimized_prompt).toBe("Task: Keep prompt text out of storage.");
  });
});
