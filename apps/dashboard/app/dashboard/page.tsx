"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  CircleDollarSign,
  FlaskConical,
  Gauge,
  RefreshCw,
  Shield,
  ShieldCheck,
  Trash2,
  TrendingDown,
  WifiOff
} from "lucide-react";

import {
  dashboardEventsUrl,
  fetchPilotMetrics,
  resetPilotMetrics,
  type PilotArm,
  type PilotArmTotals,
  type PilotHistoryDay,
  type PilotMetrics,
  type PilotPromptRow
} from "./metrics";

const DASHBOARD_POLL_MS = 2_000;

const examplePilotMetrics: PilotMetrics = {
  generatedAt: "2026-08-09T00:00:00.000Z",
  billing: {
    mode: "plan",
    source: "detected",
    tier: "default_claude_max_5x",
    planMonthlyUsd: 100,
    extraUsageEnabled: false
  },
  totals: {
    promptCount: 5,
    sessionCount: 3,
    estimatedDefaultCostUsd: 4.92,
    sidecarCostUsd: 3.61,
    estimatedSavingsUsd: 1.31,
    estimatedSavingsPercent: 0.2663,
    tokensUsed: 181760,
    estimatedAvoidedTokens: 65940,
    estimatedDefaultTokens: 247700,
    planMultiplier: 1.363,
    apiEquivalentUsd: 3.61,
    effectivePlanValueUsd: 136.3,
    assistSessions: 2,
    controlSessions: 1,
    refinementsDelivered: 4,
    refinementsSuppressed: 1,
    steeringRecommendations: 2,
    shadowDetections: 3
  },
  defaultCostAlgorithm: {
    basis: "k-calibration",
    description: "estimated default cost = measured sidecar cost + k-estimated avoided iterations x measured cost per iteration",
    kCalibrated: false,
    kValues: {
      failed_test_loop: 2,
      repeated_command: 2,
      repeated_edit: 2,
      missing_validation: 1,
      task_drift: 2
    }
  },
  measurement: {
    control_fraction: 0.3,
    steer_on_ingest: true,
    arms: {
      assist: {
        sessions: 2,
        events: 184,
        tokens_input: 96_200,
        tokens_output: 14_850,
        sessions_with_measured_tokens: 2,
        measured_cost_usd: 2.31,
        refinements_delivered: 4,
        refinements_suppressed: 1,
        steering_recommendations: 2,
        shadow_detections: 0
      },
      control: {
        sessions: 1,
        events: 121,
        tokens_input: 61_400,
        tokens_output: 9_310,
        sessions_with_measured_tokens: 1,
        measured_cost_usd: 1.3,
        refinements_delivered: 0,
        refinements_suppressed: 0,
        steering_recommendations: 0,
        shadow_detections: 3
      }
    },
    note: "Arm comparison is measured; per-event avoided-waste figures are approximate k-calibrated estimates."
  },
  prompts: [
    {
      id: "example-assist-001:p1",
      sessionId: "example-assist-001",
      label: "Prompt 1",
      promptText: "Fix the flaky login test and make sure the retry logic is covered",
      arm: "assist",
      status: "completed",
      startedAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:06:40.000Z",
      completedAt: "2026-08-09T00:06:40.000Z",
      estimatedDefaultCostUsd: 1.86,
      sidecarCostUsd: 1.31,
      estimatedAvoidedCostUsd: 0.55,
      tokensUsed: 64200,
      estimatedAvoidedTokens: 26800,
      estimatedDefaultTokens: 91000,
      avoidedIterations: 4,
      observedIterations: 26,
      costPrecision: "measured",
      promptsSubmitted: 2,
      refinementsDelivered: 2,
      refinementsSuppressed: 1,
      steeringRecommendations: 1,
      shadowDetections: 0,
      modelRoute: "claude-opus",
      taskType: "code_edit",
      promptHashCount: 2
    },
    {
      id: "example-control-001:p1",
      sessionId: "example-control-001",
      label: "Prompt 1",
      promptText: "Refactor the billing module to remove the deprecated client",
      arm: "control",
      status: "completed",
      startedAt: "2026-08-09T00:10:00.000Z",
      updatedAt: "2026-08-09T00:17:05.000Z",
      completedAt: "2026-08-09T00:17:05.000Z",
      estimatedDefaultCostUsd: 1.3,
      sidecarCostUsd: 1.3,
      estimatedAvoidedCostUsd: 0,
      tokensUsed: 70710,
      estimatedAvoidedTokens: 0,
      estimatedDefaultTokens: 70710,
      avoidedIterations: 0,
      observedIterations: 31,
      costPrecision: "measured",
      promptsSubmitted: 1,
      refinementsDelivered: 0,
      refinementsSuppressed: 0,
      steeringRecommendations: 0,
      shadowDetections: 3,
      modelRoute: "claude-opus",
      taskType: "code_edit",
      promptHashCount: 1
    },
    {
      id: "example-assist-002:p1",
      sessionId: "example-assist-002",
      label: "Prompt 1",
      promptText: "Add pagination to the audit log endpoint",
      arm: "assist",
      status: "active",
      startedAt: "2026-08-09T00:20:00.000Z",
      updatedAt: "2026-08-09T00:24:12.000Z",
      estimatedDefaultCostUsd: 1.76,
      sidecarCostUsd: 1,
      estimatedAvoidedCostUsd: 0.76,
      tokensUsed: 46850,
      estimatedAvoidedTokens: 39140,
      estimatedDefaultTokens: 85990,
      avoidedIterations: 6,
      observedIterations: 8,
      costPrecision: "approximate",
      promptsSubmitted: 2,
      refinementsDelivered: 2,
      refinementsSuppressed: 0,
      steeringRecommendations: 1,
      shadowDetections: 0,
      modelRoute: "claude-opus",
      taskType: "coding_prompt",
      promptHashCount: 2
    }
  ],
  history: [
    {
      day: "2026-08-08",
      sessions: 1,
      promptsSubmitted: 3,
      estimatedDefaultCostUsd: 2.12,
      sidecarCostUsd: 1.64,
      estimatedSavingsUsd: 0.48,
      tokensUsed: 84300,
      estimatedAvoidedTokens: 24600
    },
    {
      day: "2026-08-09",
      sessions: 3,
      promptsSubmitted: 5,
      estimatedDefaultCostUsd: 4.92,
      sidecarCostUsd: 3.61,
      estimatedSavingsUsd: 1.31,
      tokensUsed: 181760,
      estimatedAvoidedTokens: 65940
    }
  ]
};

export default function PilotDashboardPage() {
  const [metrics, setMetrics] = useState<PilotMetrics>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>();
  const [refreshSeq, setRefreshSeq] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [metricsSourceUrl, setMetricsSourceUrl] = useState<string>();
  const [streamConnected, setStreamConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadMetrics() {
      try {
        const { metrics: nextMetrics, sourceUrl } = await fetchPilotMetrics();
        if (!cancelled) {
          setMetrics(nextMetrics);
          setMetricsSourceUrl(sourceUrl);
          setError(undefined);
          setLastRefresh(new Date());
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadMetrics();
    const interval = window.setInterval(loadMetrics, DASHBOARD_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [refreshSeq]);

  useEffect(() => {
    if (!metricsSourceUrl || typeof window.EventSource === "undefined") {
      setStreamConnected(false);
      return;
    }

    let closed = false;
    const stream = new window.EventSource(dashboardEventsUrl(metricsSourceUrl));

    stream.addEventListener("open", () => {
      if (!closed) {
        setStreamConnected(true);
      }
    });
    stream.addEventListener("metrics", () => {
      if (!closed) {
        setRefreshSeq((value) => value + 1);
      }
    });
    stream.addEventListener("error", () => {
      if (!closed) {
        setStreamConnected(false);
      }
    });

    return () => {
      closed = true;
      setStreamConnected(false);
      stream.close();
    };
  }, [metricsSourceUrl]);

  const activeMetrics = metrics ?? examplePilotMetrics;
  const rows = useMemo(
    () => [...activeMetrics.prompts].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
    [activeMetrics.prompts]
  );
  const mode = error ? (metrics ? "stale" : "example") : loading ? "loading" : "live";

  // Reset is deliberately immediate — no confirmation dialog. It clears pilot
  // session traces only; SWE-bench run results are untouched (see /swebench).
  async function resetDashboard() {
    if (resetting) {
      return;
    }
    setResetting(true);
    try {
      const { result, sourceUrl } = await resetPilotMetrics(undefined, metricsSourceUrl ? [metricsSourceUrl] : undefined);
      setMetrics(result.metrics);
      setMetricsSourceUrl(sourceUrl);
      setError(undefined);
      setLastRefresh(new Date());
    } catch (resetError) {
      setError(`Reset failed: ${resetError instanceof Error ? resetError.message : String(resetError)}`);
    } finally {
      setResetting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#07070b] text-white">
      <header className="border-b border-white/10 bg-[#07070b]/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="/" className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/15 bg-white/[0.04]">
              <Bot size={18} />
            </span>
            <span className="truncate text-sm font-semibold tracking-wide">Agent Sidecar</span>
          </a>
          <div className="flex items-center gap-2">
            <a href="/" className="rounded-lg border border-white/10 px-3 py-2 text-sm text-neutral-300 transition hover:border-white/20 hover:text-white">
              Website
            </a>
            <a href="/swebench" className="rounded-lg border border-white/10 px-3 py-2 text-sm text-neutral-300 transition hover:border-white/20 hover:text-white">
              SWE-bench
            </a>
            <button
              type="button"
              aria-label="Refresh pilot metrics"
              onClick={() => setRefreshSeq((value) => value + 1)}
              className="grid size-10 place-items-center rounded-lg border border-white/10 text-neutral-300 transition hover:border-[#22d3ee]/40 hover:text-white"
            >
              <RefreshCw size={17} />
            </button>
            <button
              type="button"
              aria-label={resetting ? "Resetting pilot metrics" : "Reset pilot metrics"}
              title="Reset pilot session traces (immediate; SWE-bench results are kept)"
              disabled={resetting}
              onClick={resetDashboard}
              className="grid size-10 place-items-center rounded-lg border border-white/10 text-neutral-300 transition hover:border-red-300/40 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 size={17} />
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-[#67e8f9]">Pilot dashboard</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal sm:text-4xl">Assist vs control economics</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-400">
              Each row is one submitted prompt, read locally from your own session traces — prompt text never leaves this
              machine, and the operator push carries aggregate counts only. Default cost is estimated as measured cost plus
              the waste steering likely avoided; the assist-vs-control comparison below is the pilot&apos;s real measurement.
            </p>
          </div>
          <ConnectionPill mode={mode} lastRefresh={lastRefresh} sourceUrl={metricsSourceUrl} streamConnected={streamConnected} />
        </div>

        {error ? (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.06] p-4 text-sm leading-6 text-amber-100/85">
            <WifiOff className="mt-0.5 shrink-0" size={17} />
            <span>{metrics ? `Last refresh failed: ${error}` : `Showing example metrics until the daemon responds: ${error}`}</span>
          </div>
        ) : null}

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {activeMetrics.billing.mode === "plan" ? (
            <>
              <MetricCard
                icon={<Gauge size={18} />}
                label="Plan multiplier"
                value={`${activeMetrics.totals.planMultiplier.toFixed(2)}×`}
                detail={
                  activeMetrics.totals.effectivePlanValueUsd != null && activeMetrics.billing.planMonthlyUsd != null
                    ? `$${activeMetrics.billing.planMonthlyUsd}/mo plan doing ~$${activeMetrics.totals.effectivePlanValueUsd} of work`
                    : "Est. work vs plan without sidecar"
                }
                tone="good"
              />
              <MetricCard
                icon={<CircleDollarSign size={18} />}
                label="Tokens used"
                value={formatTokens(activeMetrics.totals.tokensUsed)}
                detail={`~${formatTokens(activeMetrics.totals.estimatedAvoidedTokens)} waste avoided`}
              />
              <MetricCard
                icon={<ShieldCheck size={18} />}
                label="API-equiv. value"
                value={formatUsd(activeMetrics.totals.apiEquivalentUsd)}
                detail="Work delivered, at API prices"
              />
            </>
          ) : (
            <>
              <MetricCard
                icon={<CircleDollarSign size={18} />}
                label="Est. default cost"
                value={formatUsd(activeMetrics.totals.estimatedDefaultCostUsd)}
                detail="Incl. estimated avoided waste"
              />
              <MetricCard icon={<ShieldCheck size={18} />} label="Sidecar cost" value={formatUsd(activeMetrics.totals.sidecarCostUsd)} detail="Measured path" />
              <MetricCard
                icon={<TrendingDown size={18} />}
                label="Est. savings"
                value={formatUsd(activeMetrics.totals.estimatedSavingsUsd)}
                detail={formatPercent(activeMetrics.totals.estimatedSavingsPercent)}
                tone="good"
              />
            </>
          )}
          <MetricCard
            icon={<FlaskConical size={18} />}
            label="Prompts"
            value={formatInteger(activeMetrics.totals.promptCount)}
            detail={`${activeMetrics.totals.sessionCount} sessions · ${activeMetrics.totals.assistSessions} assist / ${activeMetrics.totals.controlSessions} control`}
          />
          <MetricCard
            icon={<Activity size={18} />}
            label="Interventions"
            value={formatInteger(activeMetrics.totals.refinementsDelivered + activeMetrics.totals.steeringRecommendations)}
            detail={`${activeMetrics.totals.refinementsDelivered} refined / ${activeMetrics.totals.steeringRecommendations} steered / ${activeMetrics.totals.shadowDetections} shadow`}
          />
        </section>

        <section className="mt-6">
          {activeMetrics.billing.mode === "plan" ? <CapacityComparison metrics={activeMetrics} /> : <CostComparison metrics={activeMetrics} />}
        </section>

        <ArmComparison measurement={activeMetrics.measurement} />

        <HistoryPanel history={activeMetrics.history} />

        <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.025]">
          <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Prompts</h2>
              <p className="mt-1 text-sm text-neutral-500">One row per submitted prompt, with costs, activity, and interventions.</p>
            </div>
            <span className="w-fit rounded-lg border border-white/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-neutral-400">
              generated {formatDateTime(activeMetrics.generatedAt)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-[0.16em] text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Prompt</th>
                  <th className="px-4 py-3 font-medium">Cost</th>
                  <th className="px-4 py-3 font-medium">Activity</th>
                  <th className="px-4 py-3 font-medium">Interventions</th>
                  <th className="px-4 py-3 font-medium">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {rows.length > 0 ? rows.map((row) => <PromptRow key={row.id} row={row} />) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-neutral-500">
                      No prompts have been recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.025] p-4 text-sm leading-6 text-neutral-400">
          <Shield className="mt-0.5 shrink-0 text-[#67e8f9]" size={17} />
          <span>
            The arm comparison is measured; per-session avoided-waste figures are approximate estimates. Control sessions
            behave exactly like stock Claude Code — detectors run silently
            and record shadow detections only. If the operator&apos;s machine is unreachable, the sidecar degrades to fully
            local mode; the worst case is stock Claude Code. The weekly report compares the two arms on cost and outcomes —
            that comparison is the pilot&apos;s answer.
          </span>
        </section>
      </section>
    </main>
  );
}

function ConnectionPill({
  mode,
  lastRefresh,
  sourceUrl,
  streamConnected
}: {
  mode: "live" | "loading" | "stale" | "example";
  lastRefresh?: Date;
  sourceUrl?: string;
  streamConnected: boolean;
}) {
  const label =
    mode === "live"
      ? streamConnected
        ? "daemon streaming"
        : "daemon connected"
      : mode === "loading"
        ? "loading"
        : mode === "stale"
          ? "daemon stale"
          : "example data";
  const className =
    mode === "live"
      ? "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-200"
      : mode === "loading"
        ? "border-[#22d3ee]/25 bg-[#22d3ee]/[0.08] text-[#9be8f4]"
        : "border-amber-300/25 bg-amber-300/[0.08] text-amber-200";

  return (
    <div
      className={`flex w-fit items-center gap-2 rounded-lg border px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] ${className}`}
      title={sourceUrl}
    >
      <Activity size={15} />
      <span>{label}</span>
      {lastRefresh ? <span className="text-white/45">{lastRefresh.toLocaleTimeString()}</span> : null}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone = "neutral"
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "good";
}) {
  const valueClass = tone === "good" ? "text-emerald-200" : "text-white";
  return (
    <div className="min-h-[128px] rounded-lg border border-white/10 bg-white/[0.025] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-neutral-500">{label}</p>
        <span className="grid size-8 place-items-center rounded-lg border border-white/10 bg-black/20 text-neutral-300">{icon}</span>
      </div>
      <p className={`mt-5 truncate text-2xl font-semibold ${valueClass}`}>{value}</p>
      <p className="mt-2 text-sm leading-5 text-neutral-500">{detail}</p>
    </div>
  );
}

function CostComparison({ metrics }: { metrics: PilotMetrics }) {
  const { totals } = metrics;
  const maxCost = Math.max(totals.estimatedDefaultCostUsd, totals.sidecarCostUsd, 0.01);
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.025] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Cost movement</h2>
          <p className="mt-1 text-sm text-neutral-500">Estimated default cost compared with measured Sidecar cost.</p>
        </div>
        <span className="rounded-lg border border-emerald-300/20 bg-emerald-300/[0.06] px-3 py-2 font-mono text-sm text-emerald-200">
          {formatPercent(totals.estimatedSavingsPercent)}
        </span>
      </div>

      <div className="mt-6 grid gap-4">
        <CostBar label="Default (estimated)" amount={totals.estimatedDefaultCostUsd} width={(totals.estimatedDefaultCostUsd / maxCost) * 100} tone="default" />
        <CostBar label="Sidecar (measured)" amount={totals.sidecarCostUsd} width={(totals.sidecarCostUsd / maxCost) * 100} tone="sidecar" />
      </div>
      <p className="mt-4 text-xs leading-5 text-neutral-500">
        Estimated default cost adds the waste steering likely avoided to the measured Sidecar cost.
      </p>
    </div>
  );
}

function CostBar({
  label,
  amount,
  width,
  tone,
  format = formatUsd
}: {
  label: string;
  amount: number;
  width: number;
  tone: "default" | "sidecar";
  format?: (value: number) => string;
}) {
  const barClass = tone === "sidecar" ? "bg-emerald-300" : "bg-red-300";
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-4 text-sm">
        <span className="text-neutral-300">{label}</span>
        <span className="font-mono text-neutral-400">{format(amount)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-lg bg-white/10">
        <div className={`h-full rounded-lg ${barClass}`} style={{ width: `${Math.max(3, Math.min(width, 100))}%` }} />
      </div>
    </div>
  );
}

function CapacityComparison({ metrics }: { metrics: PilotMetrics }) {
  const { totals, billing } = metrics;
  const maxTokens = Math.max(totals.estimatedDefaultTokens, totals.tokensUsed, 1);
  const tierLabel = billing.tier ? billing.tier.replace("default_claude_", "").replaceAll("_", " ") : null;
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.025] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Plan capacity</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Tokens your plan would have burned without the sidecar, compared with what it actually used.
            {tierLabel ? ` Detected plan: ${tierLabel}.` : ""}
          </p>
        </div>
        <span className="rounded-lg border border-emerald-300/20 bg-emerald-300/[0.06] px-3 py-2 font-mono text-sm text-emerald-200">
          {totals.planMultiplier.toFixed(2)}×
        </span>
      </div>

      <div className="mt-6 grid gap-4">
        <CostBar
          label="Without sidecar (estimated)"
          amount={totals.estimatedDefaultTokens}
          width={(totals.estimatedDefaultTokens / maxTokens) * 100}
          tone="default"
          format={formatTokens}
        />
        <CostBar
          label="With sidecar (measured)"
          amount={totals.tokensUsed}
          width={(totals.tokensUsed / maxTokens) * 100}
          tone="sidecar"
          format={formatTokens}
        />
      </div>
      <p className="mt-4 text-xs leading-5 text-neutral-500">
        Avoided waste stays inside your usage limits as headroom — more prompts before the window or weekly cap closes.
        {billing.extraUsageEnabled ? " Extra-usage billing is enabled on this account, so avoided waste is also avoided overage spend." : ""}
      </p>
    </div>
  );
}

function ArmComparison({ measurement }: { measurement: PilotMetrics["measurement"] }) {
  return (
    <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.025]">
      <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Assist vs control</h2>
          <p className="mt-1 text-sm text-neutral-500">
            The measured comparison. {formatPercent(measurement.control_fraction)} of sessions run in control mode and receive
            no sidecar help.
          </p>
        </div>
        <span className="w-fit rounded-lg border border-white/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-neutral-400">
          steering {measurement.steer_on_ingest ? "on" : "off"}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-[0.16em] text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Arm</th>
              <th className="px-4 py-3 font-medium">Sessions</th>
              <th className="px-4 py-3 font-medium">Tokens in / out</th>
              <th className="px-4 py-3 font-medium">Measured cost</th>
              <th className="px-4 py-3 font-medium">Refinements</th>
              <th className="px-4 py-3 font-medium">Steering</th>
              <th className="px-4 py-3 font-medium">Shadow detections</th>
            </tr>
          </thead>
          <tbody>
            {(["assist", "control"] as PilotArm[]).map((arm) => (
              <ArmRow key={arm} arm={arm} totals={measurement.arms[arm]} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ArmRow({ arm, totals }: { arm: PilotArm; totals: PilotArmTotals }) {
  return (
    <tr className="border-b border-white/10 last:border-0">
      <td className="px-4 py-4">
        <ArmBadge arm={arm} />
      </td>
      <td className="px-4 py-4 font-mono text-neutral-200">{formatInteger(totals.sessions)}</td>
      <td className="px-4 py-4 font-mono text-neutral-200">
        {formatInteger(totals.tokens_input)} / {formatInteger(totals.tokens_output)}
      </td>
      <td className="px-4 py-4 font-mono text-neutral-200">{formatUsd(totals.measured_cost_usd)}</td>
      <td className="px-4 py-4 font-mono text-neutral-200">
        {formatInteger(totals.refinements_delivered)}
        <span className="text-neutral-500"> delivered / {formatInteger(totals.refinements_suppressed)} suppressed</span>
      </td>
      <td className="px-4 py-4 font-mono text-neutral-200">{formatInteger(totals.steering_recommendations)}</td>
      <td className="px-4 py-4 font-mono text-neutral-200">{formatInteger(totals.shadow_detections)}</td>
    </tr>
  );
}

function ArmBadge({ arm }: { arm: PilotArm }) {
  if (arm === "assist") {
    return <span className="inline-flex rounded-lg border border-[#22d3ee]/25 bg-[#22d3ee]/[0.08] px-2.5 py-1 text-xs font-medium text-[#9be8f4]">Assist</span>;
  }
  return <span className="inline-flex rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-neutral-300">Control</span>;
}

function HistoryPanel({ history }: { history: PilotHistoryDay[] }) {
  const rows = [...history].sort((left, right) => right.day.localeCompare(left.day));
  const maxDefault = Math.max(...rows.map((row) => row.estimatedDefaultCostUsd), 0.01);
  return (
    <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.025]">
      <div className="border-b border-white/10 p-4">
        <h2 className="text-lg font-semibold">Over time</h2>
        <p className="mt-1 text-sm text-neutral-500">Daily totals across recorded sessions, newest first.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-[0.16em] text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Day</th>
              <th className="px-4 py-3 font-medium">Sessions</th>
              <th className="px-4 py-3 font-medium">Prompts</th>
              <th className="px-4 py-3 font-medium">Tokens</th>
              <th className="px-4 py-3 font-medium">Est. default</th>
              <th className="px-4 py-3 font-medium">Sidecar</th>
              <th className="px-4 py-3 font-medium">Est. savings</th>
              <th className="px-4 py-3 font-medium">Spend</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? rows.map((row) => (
              <tr key={row.day} className="border-b border-white/10 last:border-0">
                <td className="px-4 py-3 font-mono text-neutral-200">{row.day}</td>
                <td className="px-4 py-3 font-mono text-neutral-200">{formatInteger(row.sessions)}</td>
                <td className="px-4 py-3 font-mono text-neutral-200">{formatInteger(row.promptsSubmitted)}</td>
                <td className="px-4 py-3 font-mono text-neutral-200">
                  {formatTokens(row.tokensUsed)}
                  {row.estimatedAvoidedTokens > 0 ? <span className="text-emerald-300"> +{formatTokens(row.estimatedAvoidedTokens)}</span> : null}
                </td>
                <td className="px-4 py-3 font-mono text-neutral-200">{formatUsd(row.estimatedDefaultCostUsd)}</td>
                <td className="px-4 py-3 font-mono text-neutral-200">{formatUsd(row.sidecarCostUsd)}</td>
                <td className={`px-4 py-3 font-mono ${row.estimatedSavingsUsd >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                  {formatUsd(row.estimatedSavingsUsd)}
                </td>
                <td className="w-[180px] px-4 py-3">
                  <div className="h-2.5 overflow-hidden rounded-lg bg-white/10">
                    <div
                      className="h-full rounded-lg bg-emerald-300/80"
                      style={{ width: `${Math.max(3, Math.min((row.sidecarCostUsd / maxDefault) * 100, 100))}%` }}
                    />
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-neutral-500">
                  No daily history yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PromptRow({ row }: { row: PilotPromptRow }) {
  return (
    <tr className="border-b border-white/10 last:border-0">
      <td className="max-w-[360px] px-4 py-4 align-top">
        <div className="line-clamp-3 text-sm leading-5 text-white" title={row.promptText}>
          {row.promptText ?? <span className="italic text-neutral-500">Telemetry only — no hook-captured prompt</span>}
        </div>
        <div className="mt-2 truncate font-mono text-xs text-neutral-500" title={`${row.label} · ${row.sessionId}`}>
          {row.label} · {row.sessionId}
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-neutral-400">
          <ArmBadge arm={row.arm} />
          <span>{row.status}</span>
        </div>
      </td>
      <td className="px-4 py-4 align-top">
        <MetricPair label="Default" value={formatUsd(row.estimatedDefaultCostUsd)} />
        <MetricPair label="Sidecar" value={formatUsd(row.sidecarCostUsd)} />
        <MetricPair label="Tokens" value={formatTokens(row.tokensUsed)} />
        <p className={`mt-2 font-mono text-xs ${row.estimatedAvoidedCostUsd > 0 ? "text-emerald-300" : "text-neutral-500"}`}>
          {formatUsd(row.estimatedAvoidedCostUsd)} / ~{formatTokens(row.estimatedAvoidedTokens)} est. avoided
        </p>
      </td>
      <td className="px-4 py-4 align-top">
        <MetricPair label="Observed" value={`${formatInteger(row.observedIterations)} iterations`} />
        <MetricPair label="Avoided" value={`~${row.avoidedIterations} iterations`} />
        <p className="mt-2 text-xs text-neutral-500">{row.taskType}</p>
      </td>
      <td className="px-4 py-4 align-top">
        <MetricPair label="Refined" value={`${row.refinementsDelivered} / ${row.refinementsSuppressed} suppressed`} />
        <MetricPair label="Steering" value={formatInteger(row.steeringRecommendations)} />
        <MetricPair label="Shadow" value={formatInteger(row.shadowDetections)} />
      </td>
      <td className="px-4 py-4 align-top">
        <p className="font-mono text-xs text-neutral-300">{row.costPrecision === "measured" ? "Measured telemetry" : "Estimated cost"}</p>
        {row.modelRoute ? <p className="mt-2 max-w-[220px] truncate text-xs text-neutral-500">{row.modelRoute}</p> : null}
      </td>
    </tr>
  );
}

function MetricPair({ label, value }: { label: string; value: string }) {
  return (
    <p className="mt-1 grid grid-cols-[72px_1fr] gap-3 font-mono text-xs">
      <span className="text-neutral-500">{label}</span>
      <span className="text-neutral-200">{value}</span>
    </p>
  );
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value > 0 && value < 1 ? 4 : 2,
    maximumFractionDigits: value > 0 && value < 1 ? 4 : 2
  }).format(value);
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatTokens(value: number): string {
  return `${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)} tok`;
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: Math.abs(value) < 0.1 && value !== 0 ? 1 : 0
  }).format(value);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const year = date.getUTCFullYear();
  const month = padDatePart(date.getUTCMonth() + 1);
  const day = padDatePart(date.getUTCDate());
  const hours = padDatePart(date.getUTCHours());
  const minutes = padDatePart(date.getUTCMinutes());
  const seconds = padDatePart(date.getUTCSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`;
}

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}
