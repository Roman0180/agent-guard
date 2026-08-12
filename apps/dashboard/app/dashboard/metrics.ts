import { dashboardDaemonUrlCandidates, dashboardEventsUrl } from "../swebench/metrics";

export { dashboardEventsUrl };

export type PilotArm = "assist" | "control";
export type SessionStatus = "active" | "completed";
export type CostPrecision = "measured" | "priced" | "approximate";

export type PilotPromptRow = {
  id: string;
  sessionId: string;
  label: string;
  promptText?: string;
  arm: PilotArm;
  status: SessionStatus;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  estimatedDefaultCostUsd: number;
  sidecarCostUsd: number;
  estimatedAvoidedCostUsd: number;
  tokensUsed: number;
  estimatedAvoidedTokens: number;
  estimatedDefaultTokens: number;
  avoidedIterations: number;
  observedIterations: number;
  costPrecision: CostPrecision;
  promptsSubmitted: number;
  refinementsDelivered: number;
  refinementsSuppressed: number;
  steeringRecommendations: number;
  shadowDetections: number;
  modelRoute?: string;
  taskType: string;
  promptHashCount: number;
};

export type PilotArmTotals = {
  sessions: number;
  events: number;
  tokens_input: number;
  tokens_output: number;
  sessions_with_measured_tokens: number;
  measured_cost_usd: number;
  refinements_delivered: number;
  refinements_suppressed: number;
  steering_recommendations: number;
  shadow_detections: number;
};

export type PilotHistoryDay = {
  day: string;
  sessions: number;
  promptsSubmitted: number;
  estimatedDefaultCostUsd: number;
  sidecarCostUsd: number;
  estimatedSavingsUsd: number;
  tokensUsed: number;
  estimatedAvoidedTokens: number;
};

export type PilotBilling = {
  mode: "credits" | "plan";
  source: "config" | "detected" | "fallback";
  tier?: string | null;
  planMonthlyUsd?: number | null;
  extraUsageEnabled: boolean;
};

export type PilotPlanCapacity = {
  estimatedPlanTokens: number | null;
  planMonthlyUsd: number;
  planAssumed: boolean;
  basis: "config-override" | "api-equivalent-estimate";
  precision: "approximate";
};

export type PilotMetrics = {
  generatedAt: string;
  billing: PilotBilling;
  totals: {
    promptCount: number;
    sessionCount: number;
    estimatedDefaultCostUsd: number;
    sidecarCostUsd: number;
    estimatedSavingsUsd: number;
    estimatedSavingsPercent: number;
    tokensUsed: number;
    estimatedAvoidedTokens: number;
    estimatedDefaultTokens: number;
    planMultiplier: number;
    apiEquivalentUsd: number;
    effectivePlanValueUsd?: number | null;
    planCapacity?: PilotPlanCapacity | null;
    avoidedTokensPlanPercent?: number | null;
    assistSessions: number;
    controlSessions: number;
    refinementsDelivered: number;
    refinementsSuppressed: number;
    steeringRecommendations: number;
    shadowDetections: number;
  };
  defaultCostAlgorithm: {
    basis: string;
    description: string;
    kCalibrated: boolean;
    kValues: Record<string, number>;
  };
  measurement: {
    control_fraction: number;
    steer_on_ingest: boolean;
    arms: Record<PilotArm, PilotArmTotals>;
    note: string;
  };
  prompts: PilotPromptRow[];
  history: PilotHistoryDay[];
};

export type PilotResetResult = {
  ok: boolean;
  sessionsRemoved: number;
  metrics: PilotMetrics;
};

type FetchMetrics = (input: string, init?: RequestInit) => Promise<Response>;

const PILOT_METRICS_PATH = "/api/dashboard/pilot";
const PILOT_RESET_PATH = "/api/dashboard/pilot/reset";

export async function fetchPilotMetrics(
  fetchMetrics: FetchMetrics = fetch,
  daemonUrls?: string[]
): Promise<{ metrics: PilotMetrics; sourceUrl: string }> {
  const { payload, sourceUrl } = await requestFirstAvailable(fetchMetrics, PILOT_METRICS_PATH, undefined, daemonUrls);
  return { metrics: payload as PilotMetrics, sourceUrl };
}

export async function resetPilotMetrics(
  fetchMetrics: FetchMetrics = fetch,
  daemonUrls?: string[]
): Promise<{ result: PilotResetResult; sourceUrl: string }> {
  const { payload, sourceUrl } = await requestFirstAvailable(fetchMetrics, PILOT_RESET_PATH, { method: "POST" }, daemonUrls);
  return { result: payload as PilotResetResult, sourceUrl };
}

async function requestFirstAvailable(
  fetchMetrics: FetchMetrics,
  path: string,
  init?: RequestInit,
  daemonUrls?: string[]
): Promise<{ payload: unknown; sourceUrl: string }> {
  const attempts: string[] = [];
  const failures: string[] = [];
  const urls = daemonUrls ?? await dashboardDaemonUrlCandidates(fetchMetrics);

  for (const daemonUrl of urls.map(normalizeDaemonUrl).filter((url): url is string => Boolean(url))) {
    attempts.push(daemonUrl);
    try {
      const response = await fetchMetrics(`${daemonUrl}${path}`, { cache: "no-store", ...init });
      if (response.ok) {
        return { payload: await response.json(), sourceUrl: daemonUrl };
      }
      failures.push(`${daemonUrl} returned ${response.status}`);
    } catch (error) {
      failures.push(`${daemonUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const tried = attempts.length > 0 ? attempts.join(", ") : "no daemon URLs";
  const details = failures.length > 0 ? failures.join("; ") : "no response";
  throw new Error(`daemon pilot metrics unavailable; ${details}; tried ${tried}`);
}

function normalizeDaemonUrl(url: string | undefined): string | undefined {
  const trimmed = url?.trim();
  return trimmed ? trimmed.replace(/\/$/, "") : undefined;
}
