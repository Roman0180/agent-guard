import { randomUUID } from "node:crypto";

import { Intervention, type InterventionCategory, type InterventionSeverity, type TrajectorySlice } from "@agent-sidecar/core";

export type DetectorResult = {
  matched: boolean;
  reasonCode?: string;
};

export type InterventionEngineOptions = {
  recentSlices?: TrajectorySlice[];
  now?: () => string;
};

export type InterventionEngineInput = {
  slice: TrajectorySlice;
  recentSlices?: TrajectorySlice[];
};

type RuleMatch = {
  category: InterventionCategory;
  severity: InterventionSeverity;
  message: string;
  rationale: string;
  recommended_action: string;
  suggested_prompt_patch?: string;
  should_block?: boolean;
  confidence: number;
  metadata?: Record<string, string | number | boolean | null | Array<string | number | boolean | null>>;
};

const DEFAULT_PROMPT_PATCH =
  "Pause. Summarize current state in 5 bullets, name the smallest next inspection, run one targeted command, and validate only the changed behavior.";

export function noMatch(): DetectorResult {
  return { matched: false };
}

export function createInterventionEngine(options: InterventionEngineOptions = {}) {
  const history = [...(options.recentSlices ?? [])].slice(-50);

  return {
    observe(slice: TrajectorySlice): Intervention {
      const parsed = slice;
      history.push(parsed);
      if (history.length > 50) history.shift();
      return evaluateTrajectorySlice(parsed, history);
    },
    getRecentSlices(): TrajectorySlice[] {
      return [...history];
    }
  };
}

export function evaluateTrajectorySlice(slice: TrajectorySlice, recentSlices: TrajectorySlice[] = [slice]): Intervention {
  const matches = [
    detectRepeatedFailedToolCalls(slice, recentSlices),
    detectRepeatedSimilarErrors(slice, recentSlices),
    detectExcessiveFileReads(slice, recentSlices),
    detectOversizedToolOutput(slice),
    detectWeakPlanningBeforeEdit(slice, recentSlices),
    detectRiskyEdit(slice),
    detectImplementationWithoutValidation(slice, recentSlices),
    detectHighTokenUsageWithoutProgress(slice, recentSlices)
  ].filter((match): match is RuleMatch => Boolean(match));

  const winner = matches.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.confidence - a.confidence)[0];
  return toIntervention(winner ?? {
    category: "tool_use",
    severity: "info",
    message: "No intervention needed for this step.",
    rationale: "The compact trajectory slice did not match the MVP waste, loop, risky-edit, planning, testing, or security rules.",
    recommended_action: "Continue the agent loop normally while sending sanitized trajectory slices for observation.",
    should_block: false,
    confidence: 0.55
  });
}

export function detectRepeatedFailedToolCalls(slice: TrajectorySlice, recentSlices: TrajectorySlice[]): RuleMatch | undefined {
  if (!slice.toolName || !hasFailure(slice)) return undefined;
  const signature = toolSignature(slice);
  const failures = recentSlices.filter((candidate) => toolSignature(candidate) === signature && hasFailure(candidate));
  if (failures.length < 3) return undefined;
  return {
    category: "loop",
    severity: "warning",
    message: "Repeated failed tool call detected.",
    rationale: `The same tool signature failed ${failures.length} times in the recent trajectory window.`,
    recommended_action: "Stop rerunning the same command. Summarize current state, inspect a narrower registration point, then run one targeted validation.",
    suggested_prompt_patch: "Stop rereading broad files. Summarize current state, search for registration points, and validate with targeted tests.",
    confidence: 0.9,
    metadata: { rule: "repeated_failed_tool_calls", signature, failures: failures.length }
  };
}

export function detectRepeatedSimilarErrors(slice: TrajectorySlice, recentSlices: TrajectorySlice[]): RuleMatch | undefined {
  const error = errorSignature(slice);
  if (!error) return undefined;
  const occurrences = recentSlices.filter((candidate) => errorSignature(candidate) === error).length;
  if (occurrences < 3) return undefined;
  return {
    category: "loop",
    severity: "warning",
    message: "Repeated similar error detected.",
    rationale: `A similar error appeared ${occurrences} times, which suggests the agent is not changing strategy.`,
    recommended_action: "Do not retry blindly. Identify the missing assumption, inspect one likely source of truth, and update the plan before another tool call.",
    suggested_prompt_patch: DEFAULT_PROMPT_PATCH,
    confidence: 0.86,
    metadata: { rule: "repeated_similar_errors", error }
  };
}

export function detectExcessiveFileReads(slice: TrajectorySlice, recentSlices: TrajectorySlice[]): RuleMatch | undefined {
  const readSlices = recentSlices.filter(isReadStep);
  const uniqueFiles = new Set(readSlices.flatMap((candidate) => candidate.filesTouched));
  if (readSlices.length < 6 && uniqueFiles.size < 12) return undefined;
  return {
    category: "context",
    severity: "warning",
    message: "Context bloat risk from excessive file reads.",
    rationale: `The agent recently performed ${readSlices.length} read-like steps across ${uniqueFiles.size} unique files.`,
    recommended_action: "Compress what is already known, switch to symbol or registration-point search, and avoid loading more full files until the plan is narrower.",
    suggested_prompt_patch: "Create a compact state summary, list unknowns, then use targeted search instead of broad file reads.",
    confidence: 0.8,
    metadata: { rule: "excessive_file_reads", readSteps: readSlices.length, uniqueFiles: uniqueFiles.size }
  };
}

export function detectOversizedToolOutput(slice: TrajectorySlice): RuleMatch | undefined {
  const outputLength = slice.toolOutput?.length ?? 0;
  if (outputLength < 8_000) return undefined;
  return {
    category: "cost",
    severity: "warning",
    message: "Oversized tool output may waste context.",
    rationale: `This tool output is ${outputLength} characters before downstream context use.`,
    recommended_action: "Truncate or summarize the output locally and rerun with a narrower command, such as a focused search or limited test output.",
    suggested_prompt_patch: "Use a targeted command with limited output; summarize only the relevant error lines and next action.",
    confidence: 0.82,
    metadata: { rule: "oversized_tool_output", outputLength }
  };
}

export function detectWeakPlanningBeforeEdit(slice: TrajectorySlice, recentSlices: TrajectorySlice[]): RuleMatch | undefined {
  if (!isEditStep(slice)) return undefined;
  const recentPlanning = recentSlices.slice(-5).some((candidate) => candidate.stepType === "planning" || candidate.tags.includes("plan"));
  const summary = slice.agentStateSummary?.toLowerCase() ?? "";
  const hasPlanWords = /plan|step|approach|because|validate/.test(summary);
  if (recentPlanning || hasPlanWords) return undefined;
  return {
    category: "planning",
    severity: "warning",
    message: "Edit is starting with weak planning evidence.",
    rationale: "The agent is touching files without a recent plan or state summary that explains scope, risk, and validation.",
    recommended_action: "Require a short plan naming intended files, risk level, and validation command before applying the edit.",
    suggested_prompt_patch: "Before editing, write a 3-step plan with files to change, files not to change, and validation command.",
    confidence: 0.74,
    metadata: { rule: "weak_planning_before_edits" }
  };
}

export function detectRiskyEdit(slice: TrajectorySlice): RuleMatch | undefined {
  if (!isEditStep(slice)) return undefined;
  const riskyFiles = slice.filesTouched.filter(isRiskyPath);
  if (riskyFiles.length === 0) return undefined;
  return {
    category: riskyFiles.some((file) => /auth|secret|security/i.test(file)) ? "security" : "risky_edit",
    severity: "critical",
    message: "Risky edit path detected.",
    rationale: `The agent is editing sensitive deployment, auth, config, security, or migration files: ${riskyFiles.join(", ")}.`,
    recommended_action: "Block or require explicit approval unless the plan, rollback path, and targeted validation are present.",
    suggested_prompt_patch: "State why this sensitive file must change, identify rollback steps, and run focused validation before continuing.",
    should_block: true,
    confidence: 0.88,
    metadata: { rule: "risky_edit", riskyFiles }
  };
}

export function detectImplementationWithoutValidation(slice: TrajectorySlice, recentSlices: TrajectorySlice[]): RuleMatch | undefined {
  const hasEdits = recentSlices.some(isEditStep);
  if (!hasEdits || slice.stepType !== "final") return undefined;
  const validatedAfterEdit = [...recentSlices].reverse().some((candidate) => candidate.stepType === "validation" || candidate.tags.includes("validation"));
  if (validatedAfterEdit) return undefined;
  return {
    category: "testing",
    severity: "warning",
    message: "Implementation is finishing without validation.",
    rationale: "The trajectory includes edits but no validation or test step before the final response.",
    recommended_action: "Run the smallest relevant test, typecheck, or build command before finalizing. If impossible, report the exact limitation.",
    suggested_prompt_patch: "Before final response, run targeted validation for the touched files or explain why validation cannot run.",
    confidence: 0.84,
    metadata: { rule: "implementation_without_validation" }
  };
}

export function detectHighTokenUsageWithoutProgress(slice: TrajectorySlice, recentSlices: TrajectorySlice[]): RuleMatch | undefined {
  const recentTokenTotal = recentSlices.slice(-6).reduce((sum, candidate) => sum + candidate.tokenCounts.totalTokens, 0);
  const hasProgress = recentSlices.slice(-6).some((candidate) => isEditStep(candidate) || candidate.stepType === "validation" || candidate.tags.includes("progress"));
  if (recentTokenTotal < 12_000 || hasProgress) return undefined;
  return {
    category: "cost",
    severity: "warning",
    message: "High token usage without clear progress.",
    rationale: `The last few trajectory slices used about ${recentTokenTotal} tokens without an edit, validation, or progress tag.`,
    recommended_action: "Stop broad exploration, compress state, and pick one narrow next action with an expected success signal.",
    suggested_prompt_patch: DEFAULT_PROMPT_PATCH,
    confidence: 0.78,
    metadata: { rule: "high_token_usage_without_progress", recentTokenTotal }
  };
}

function toIntervention(match: RuleMatch): Intervention {
  return Intervention.parse({
    intervention_id: `int_${randomUUID()}`,
    severity: match.severity,
    category: match.category,
    message: match.message,
    rationale: match.rationale,
    recommended_action: match.recommended_action,
    suggested_prompt_patch: match.suggested_prompt_patch,
    should_block: match.should_block ?? false,
    confidence: match.confidence,
    metadata: match.metadata ?? {}
  });
}

function severityRank(severity: InterventionSeverity): number {
  return severity === "critical" ? 3 : severity === "warning" ? 2 : 1;
}

function toolSignature(slice: TrajectorySlice): string {
  return `${slice.toolName ?? slice.stepType}:${JSON.stringify(slice.toolArguments)}`.toLowerCase();
}

function hasFailure(slice: TrajectorySlice): boolean {
  return Boolean(slice.errorMessage) || /error|exception|failed|fatal|exit code [1-9]/i.test(slice.toolOutput ?? "");
}

function errorSignature(slice: TrajectorySlice): string | undefined {
  const source = slice.errorMessage ?? (hasFailure(slice) ? slice.toolOutput : undefined);
  return source?.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").slice(0, 240);
}

function isReadStep(slice: TrajectorySlice): boolean {
  const tool = slice.toolName?.toLowerCase() ?? "";
  return slice.stepType === "file_read" || ["read_file", "read", "cat", "sed", "rg", "grep", "glob"].some((name) => tool.includes(name));
}

function isEditStep(slice: TrajectorySlice): boolean {
  const tool = slice.toolName?.toLowerCase() ?? "";
  return slice.stepType === "file_edit" || ["edit", "write", "apply_patch", "multiedit"].some((name) => tool.includes(name));
}

function isRiskyPath(path: string): boolean {
  return /(^|\/)(\.env|dockerfile|docker-compose|k8s|helm|terraform|auth|security|secrets?|migrations?|config)(\/|\.|$)|\.(ya?ml|toml|ini)$|package-lock\.json|pnpm-lock\.yaml/i.test(path);
}
