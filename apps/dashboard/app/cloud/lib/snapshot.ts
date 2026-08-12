// The only shape the cloud persists per user. A strict allowlist: the ingest
// endpoint reduces any incoming report to these keys and drops everything else,
// so a future client bug cannot cause prompt text (or anything unlisted) to be
// stored. Latest-only — each push upserts one row per account, no time series.

export type SnapshotData = {
  tokensUsed?: number;
  avoidedTokens?: number;
  measuredCostUsd?: number;
  apiEquivalentUsd?: number;
  savingsUsd?: number;
  savingsPercent?: number;
  planMultiplier?: number;
  effectivePlanValueUsd?: number;
  avoidedTokensPlanPercent?: number;
  planMonthlyUsd?: number;
  planAssumed?: boolean;
  sessions?: number;
  refinementsDelivered?: number;
  steeringRecommendations?: number;
  shadowDetections?: number;
  generatedAt?: string;
};

const INT_KEYS = [
  "tokensUsed",
  "avoidedTokens",
  "sessions",
  "refinementsDelivered",
  "steeringRecommendations",
  "shadowDetections",
] as const;

const NUMBER_KEYS = [
  "measuredCostUsd",
  "apiEquivalentUsd",
  "savingsUsd",
  "savingsPercent",
  "planMultiplier",
  "effectivePlanValueUsd",
  "avoidedTokensPlanPercent",
  "planMonthlyUsd",
] as const;

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Reduce an untrusted report to the stored numeric aggregate. Unknown keys are dropped. */
export function sanitizeSnapshot(input: unknown): SnapshotData {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: SnapshotData = {};

  for (const key of INT_KEYS) {
    const n = finiteNumber(source[key]);
    if (n !== undefined) out[key] = Math.trunc(n);
  }
  for (const key of NUMBER_KEYS) {
    const n = finiteNumber(source[key]);
    if (n !== undefined) out[key] = n;
  }
  if (typeof source.planAssumed === "boolean") out.planAssumed = source.planAssumed;
  // ISO-8601 timestamp only; cap length so a bad client can't smuggle a blob here.
  if (typeof source.generatedAt === "string" && source.generatedAt.length <= 40) {
    const t = Date.parse(source.generatedAt);
    if (!Number.isNaN(t)) out.generatedAt = source.generatedAt;
  }
  return out;
}
