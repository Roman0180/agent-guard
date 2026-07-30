export type AgentProvider = "codex" | "claude-code" | "generic";
export type RunStatus = "active" | "blocked" | "completed" | "failed";
export type SavingsMode = "codex_baseline" | "historical_local_baseline" | "heuristic" | "run_totals";
export type QualityVerdict = "preserved" | "regressed" | "not_evaluated";

export type DashboardMetricsRun = {
  id: string;
  label: string;
  provider: AgentProvider;
  status: RunStatus;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  defaultCostUsd: number;
  sidecarCostUsd: number;
  savingsUsd: number;
  savingsPercent: number;
  defaultExecutionMs?: number;
  sidecarExecutionMs?: number;
  executionDeltaMs?: number;
  qualityPreserved: boolean | null;
  qualityVerdict: QualityVerdict;
  qualitySource: "event_metadata" | "run_status" | "swebench_evaluator" | "not_evaluated";
  baselineScore?: number;
  sidecarScore?: number;
  scoreDelta?: number;
  baselineGradeStatus?: string;
  sidecarGradeStatus?: string;
  savingsMode: SavingsMode;
  confidence: number;
  modelRoute?: string;
  taskType: string;
  promptHashCount: number;
};

export type DashboardMetrics = {
  generatedAt: string;
  totals: {
    runCount: number;
    defaultCostUsd: number;
    sidecarCostUsd: number;
    savingsUsd: number;
    savingsPercent: number;
    defaultExecutionMs?: number;
    sidecarExecutionMs?: number;
    executionDeltaMs?: number;
    timingSampleCount: number;
    qualityPreservedRuns: number;
    qualityEvaluatedRuns: number;
    qualityPreservationRate: number;
  };
  runs: DashboardMetricsRun[];
};

export type DashboardResetResult = {
  ok: boolean;
  sessionsRemoved: number;
  swebenchRunsRemoved: number;
  metrics: DashboardMetrics;
};

type FetchMetrics = (input: string, init?: RequestInit) => Promise<Response>;

const DASHBOARD_METRICS_PATH = "/api/dashboard/metrics";
const DASHBOARD_RESET_PATH = "/api/dashboard/reset";
const DASHBOARD_EVENTS_PATH = "/api/dashboard/events";
const DAEMON_DISCOVERY_PATH = "/api/agent-sidecar/daemon";
const DEFAULT_DAEMON_URLS = ["http://127.0.0.1:7433", "http://127.0.0.1:4319"];

export function dashboardDaemonUrls(configuredUrl = process.env.NEXT_PUBLIC_AGENT_SIDECAR_DAEMON_URL): string[] {
  return normalizeDaemonUrls([configuredUrl, ...DEFAULT_DAEMON_URLS]);
}

export async function dashboardDaemonUrlCandidates(
  fetchMetrics: FetchMetrics = fetch,
  configuredUrl = process.env.NEXT_PUBLIC_AGENT_SIDECAR_DAEMON_URL
): Promise<string[]> {
  const discovered = await discoverDashboardDaemonUrls(fetchMetrics);
  return normalizeDaemonUrls([configuredUrl, ...discovered, ...DEFAULT_DAEMON_URLS]);
}

export async function discoverDashboardDaemonUrls(fetchMetrics: FetchMetrics = fetch): Promise<string[]> {
  try {
    const response = await fetchMetrics(DAEMON_DISCOVERY_PATH, { cache: "no-store" });
    if (!response.ok) {
      return [];
    }
    const payload = (await response.json()) as { daemonUrls?: unknown };
    return Array.isArray(payload.daemonUrls)
      ? payload.daemonUrls.filter((url): url is string => typeof url === "string")
      : [];
  } catch {
    return [];
  }
}

export async function fetchDashboardMetrics(
  fetchMetrics: FetchMetrics = fetch,
  daemonUrls?: string[]
): Promise<{ metrics: DashboardMetrics; sourceUrl: string }> {
  const attempts: string[] = [];
  const failures: string[] = [];
  const urls = daemonUrls ?? await dashboardDaemonUrlCandidates(fetchMetrics);

  for (const daemonUrl of normalizeDaemonUrls(urls)) {
    attempts.push(daemonUrl);
    try {
      const response = await fetchMetrics(`${daemonUrl}${DASHBOARD_METRICS_PATH}`, { cache: "no-store" });
      if (response.ok) {
        return { metrics: (await response.json()) as DashboardMetrics, sourceUrl: daemonUrl };
      }
      failures.push(`${daemonUrl} returned ${response.status}`);
    } catch (error) {
      failures.push(`${daemonUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const tried = attempts.length > 0 ? attempts.join(", ") : "no daemon URLs";
  const details = failures.length > 0 ? failures.join("; ") : "no response";
  throw new Error(`daemon metrics unavailable; ${details}; tried ${tried}`);
}

export async function resetDashboardMetrics(
  fetchMetrics: FetchMetrics = fetch,
  daemonUrls?: string[]
): Promise<{ result: DashboardResetResult; sourceUrl: string }> {
  const attempts: string[] = [];
  const failures: string[] = [];
  const urls = daemonUrls ?? await dashboardDaemonUrlCandidates(fetchMetrics);

  for (const daemonUrl of normalizeDaemonUrls(urls)) {
    attempts.push(daemonUrl);
    try {
      const response = await fetchMetrics(`${daemonUrl}${DASHBOARD_RESET_PATH}`, { method: "POST", cache: "no-store" });
      if (response.ok) {
        return { result: (await response.json()) as DashboardResetResult, sourceUrl: daemonUrl };
      }
      failures.push(`${daemonUrl} returned ${response.status}`);
    } catch (error) {
      failures.push(`${daemonUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const tried = attempts.length > 0 ? attempts.join(", ") : "no daemon URLs";
  const details = failures.length > 0 ? failures.join("; ") : "no response";
  throw new Error(`daemon dashboard reset unavailable; ${details}; tried ${tried}`);
}

export function dashboardEventsUrl(daemonUrl: string): string {
  return `${normalizeDaemonUrl(daemonUrl) ?? daemonUrl}${DASHBOARD_EVENTS_PATH}`;
}

function normalizeDaemonUrls(urls: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const url of urls) {
    const value = normalizeDaemonUrl(url);
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

function normalizeDaemonUrl(url: string | undefined): string | undefined {
  const trimmed = url?.trim();
  return trimmed ? trimmed.replace(/\/$/, "") : undefined;
}
