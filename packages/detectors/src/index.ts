export type DetectorEvent = {
  id?: string;
  eventType?: string;
  summary?: string;
  timestamp?: string;
  command?: { normalized?: string; type?: string } & Record<string, unknown>;
  validation?: { status?: string; command?: string; summary?: string } & Record<string, unknown>;
  fileEdit?: { paths?: string[]; operation?: string } & Record<string, unknown>;
  compactMetadata?: Record<string, unknown>;
};

export type DetectorRunState = {
  taskSummary?: string;
  recentCommandSignatures?: string[];
  repeatedCommandCounts?: Record<string, number>;
  latestErrorSignature?: string;
  latestErrors?: string[];
  filesChanged?: string[];
  changedFileCount?: number;
  validationSinceLastEdit?: boolean;
  lastEditAt?: string;
  lastValidationAt?: string;
  lastValidationPassed?: boolean;
  validationCommandCount?: number;
};

export type DetectorContext = {
  runState?: DetectorRunState;
  events?: DetectorEvent[];
};

export type DetectorResult = {
  matched: boolean;
  detectorId?: string;
  reasonCode?: string;
  severity?: "info" | "warning" | "error";
  confidence?: number;
  message?: string;
  recommendation?: string;
  evidence?: string[];
  estimatedAvoidedWaste?: string[];
};

export function noMatch(): DetectorResult {
  return { matched: false };
}

export function detectRepeatedCommand(context: DetectorContext): DetectorResult {
  const counts = context.runState?.repeatedCommandCounts ?? countRecentCommands(context.events ?? []);
  const topCommand = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!topCommand) return noMatch();
  const [command, count] = topCommand;
  if (count < 3) return noMatch();

  return match({
    detectorId: "repeated_command_detector",
    reasonCode: "loop.repeated_command",
    confidence: Math.min(0.95, 0.55 + count * 0.1),
    message: `The same command has been run ${count} times: ${command}`,
    recommendation: "Stop rerunning the same command until new evidence or a code/config change explains why it should pass.",
    evidence: [`${command} × ${count}`],
    estimatedAvoidedWaste: ["2-3 redundant command executions", "avoidable agent/tool spend"]
  });
}

export function detectFailedTestRepetition(context: DetectorContext): DetectorResult {
  const failed = (context.events ?? []).filter((event) => {
    const isValidation = event.eventType === "validation" || event.command?.type === "test" || event.command?.type === "build";
    const failedStatus = event.validation?.status === "failed" || /failed|error|exit\s*code\s*[1-9]/i.test(event.summary ?? "");
    return isValidation && failedStatus;
  });
  const latestError = context.runState?.latestErrorSignature;
  const sameFailureCount = latestError
    ? failed.filter((event) => compact(event.summary ?? event.validation?.summary ?? "").includes(compact(latestError).slice(0, 80))).length
    : failed.length;

  if (failed.length < 2 && sameFailureCount < 2) return noMatch();

  return match({
    detectorId: "failed_test_repetition_detector",
    reasonCode: "loop.failed_test_repetition",
    confidence: 0.86,
    message: "A failing validation command appears to be repeating without a passing signal.",
    recommendation: "Inspect the first failing stack trace, change the implicated code or test setup, then rerun the narrowest validation command.",
    evidence: failed.slice(-3).map((event) => event.summary ?? event.validation?.summary ?? "failed validation"),
    estimatedAvoidedWaste: ["repeated failed test reruns", "exploratory debugging turns"]
  });
}

export function detectRepeatedEdit(context: DetectorContext): DetectorResult {
  const pathCounts = new Map<string, number>();
  for (const event of context.events ?? []) {
    for (const path of event.fileEdit?.paths ?? []) pathCounts.set(path, (pathCounts.get(path) ?? 0) + 1);
  }
  const topPath = Array.from(pathCounts.entries()).sort((a, b) => b[1] - a[1])[0];
  if (!topPath) return noMatch();
  const [path, count] = topPath;
  if (count < 3) return noMatch();

  return match({
    detectorId: "repeated_edit_detector",
    reasonCode: "loop.repeated_edit",
    confidence: 0.78,
    message: `The same file has been edited ${count} times: ${path}`,
    recommendation: "Pause and summarize the desired invariant for this file before making another edit.",
    evidence: [`${path} edited ${count} times`],
    estimatedAvoidedWaste: ["thrashing edits", "extra validation cycles"]
  });
}

export function detectMissingValidation(context: DetectorContext): DetectorResult {
  const state = context.runState;
  const changed = (state?.changedFileCount ?? state?.filesChanged?.length ?? 0) > 0 || Boolean(state?.lastEditAt);
  if (!changed || state?.validationSinceLastEdit || state?.lastValidationPassed) return noMatch();

  return match({
    detectorId: "missing_validation_detector",
    reasonCode: "guardrail.validation_missing",
    confidence: 0.82,
    message: "Files changed without passing validation afterward.",
    recommendation: "Run the narrowest relevant test, typecheck, build, or lint command before finalizing.",
    evidence: (state?.filesChanged ?? []).slice(0, 5),
    estimatedAvoidedWaste: ["unvalidated final answer", "follow-up fix cycle"]
  });
}

export function detectPromptDrift(context: DetectorContext): DetectorResult {
  const task = compact(context.runState?.taskSummary ?? "");
  if (!task) return noMatch();
  const latest = [...(context.events ?? [])].reverse().find((event) => event.summary && event.eventType !== "prompt")?.summary ?? "";
  if (!latest) return noMatch();
  const overlap = keywordOverlap(task, compact(latest));
  const broadChange = (context.runState?.changedFileCount ?? 0) >= 8;
  if (overlap >= 0.15 || !broadChange) return noMatch();

  return match({
    detectorId: "prompt_task_drift_detector",
    reasonCode: "guardrail.prompt_drift",
    confidence: 0.64,
    message: "Recent activity has low keyword overlap with the original task while touching many files.",
    recommendation: "Restate the requested task and confirm the next edit is inside that scope.",
    evidence: [`task: ${context.runState?.taskSummary}`, `latest: ${latest}`],
    estimatedAvoidedWaste: ["off-scope edits"]
  });
}

export const DEFAULT_DETECTORS = [
  detectRepeatedCommand,
  detectFailedTestRepetition,
  detectRepeatedEdit,
  detectMissingValidation,
  detectPromptDrift
];

function match(result: Omit<DetectorResult, "matched" | "severity"> & { severity?: DetectorResult["severity"] }): DetectorResult {
  return { matched: true, severity: result.severity ?? "warning", ...result };
}

function countRecentCommands(events: DetectorEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    const command = event.command?.normalized;
    if (command) counts[command] = (counts[command] ?? 0) + 1;
  }
  return counts;
}

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_./-]+/g, " ").trim();
}

function keywordOverlap(task: string, latest: string): number {
  const words = new Set(task.split(/\s+/).filter((word) => word.length > 3));
  if (words.size === 0) return 1;
  const latestWords = new Set(latest.split(/\s+/).filter((word) => word.length > 3));
  const hits = [...words].filter((word) => latestWords.has(word)).length;
  return hits / words.size;
}
