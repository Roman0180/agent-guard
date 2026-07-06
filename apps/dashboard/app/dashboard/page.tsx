"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Gauge,
  RefreshCw,
  ShieldCheck,
  Timer,
  TrendingDown,
  WifiOff
} from "lucide-react";

type AgentProvider = "codex" | "claude-code" | "generic";
type RunStatus = "active" | "blocked" | "completed" | "failed";
type SavingsMode = "codex_baseline" | "historical_local_baseline" | "heuristic" | "run_totals";
type QualityVerdict = "preserved" | "regressed" | "not_evaluated";

type DashboardMetricsRun = {
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
  qualitySource: "event_metadata" | "run_status" | "not_evaluated";
  savingsMode: SavingsMode;
  confidence: number;
  modelRoute?: string;
  taskType: string;
  promptHashCount: number;
};

type DashboardMetrics = {
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

const daemonUrl = (process.env.NEXT_PUBLIC_AGENT_SIDECAR_DAEMON_URL ?? "http://127.0.0.1:4319").replace(/\/$/, "");

const exampleMetrics: DashboardMetrics = {
  generatedAt: "2026-07-04T00:00:00.000Z",
  totals: {
    runCount: 2,
    defaultCostUsd: 6.18,
    sidecarCostUsd: 3.42,
    savingsUsd: 2.76,
    savingsPercent: 0.4466,
    defaultExecutionMs: 582_000,
    sidecarExecutionMs: 476_000,
    executionDeltaMs: -106_000,
    timingSampleCount: 2,
    qualityPreservedRuns: 2,
    qualityEvaluatedRuns: 2,
    qualityPreservationRate: 1
  },
  runs: [
    {
      id: "example-baseline-sidecar-001",
      label: "Run example-001",
      provider: "claude-code",
      status: "completed",
      startedAt: "2026-07-04T00:00:00.000Z",
      updatedAt: "2026-07-04T00:05:12.000Z",
      completedAt: "2026-07-04T00:05:12.000Z",
      defaultCostUsd: 3.88,
      sidecarCostUsd: 2.04,
      savingsUsd: 1.84,
      savingsPercent: 0.4742,
      defaultExecutionMs: 336_000,
      sidecarExecutionMs: 288_000,
      executionDeltaMs: -48_000,
      qualityPreserved: true,
      qualityVerdict: "preserved",
      qualitySource: "event_metadata",
      savingsMode: "codex_baseline",
      confidence: 0.95,
      modelRoute: "opus + sidecar route",
      taskType: "code_edit",
      promptHashCount: 2
    },
    {
      id: "example-baseline-sidecar-002",
      label: "Run example-002",
      provider: "codex",
      status: "completed",
      startedAt: "2026-07-04T00:08:00.000Z",
      updatedAt: "2026-07-04T00:11:08.000Z",
      completedAt: "2026-07-04T00:11:08.000Z",
      defaultCostUsd: 2.3,
      sidecarCostUsd: 1.38,
      savingsUsd: 0.92,
      savingsPercent: 0.4,
      defaultExecutionMs: 246_000,
      sidecarExecutionMs: 188_000,
      executionDeltaMs: -58_000,
      qualityPreserved: true,
      qualityVerdict: "preserved",
      qualitySource: "run_status",
      savingsMode: "heuristic",
      confidence: 0.45,
      modelRoute: "deterministic refinement + Kimi",
      taskType: "coding_prompt",
      promptHashCount: 1
    }
  ]
};

export default function MetricsDashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>();
  const [refreshSeq, setRefreshSeq] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadMetrics() {
      try {
        const response = await fetch(`${daemonUrl}/api/dashboard/metrics`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`daemon returned ${response.status}`);
        }
        const nextMetrics = (await response.json()) as DashboardMetrics;
        if (!cancelled) {
          setMetrics(nextMetrics);
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
    const interval = window.setInterval(loadMetrics, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [refreshSeq]);

  const activeMetrics = metrics ?? exampleMetrics;
  const rows = useMemo(
    () => [...activeMetrics.runs].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
    [activeMetrics.runs]
  );
  const mode = error ? (metrics ? "stale" : "example") : loading ? "loading" : "live";

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
            <button
              type="button"
              aria-label="Refresh dashboard metrics"
              onClick={() => setRefreshSeq((value) => value + 1)}
              className="grid size-10 place-items-center rounded-lg border border-white/10 text-neutral-300 transition hover:border-[#22d3ee]/40 hover:text-white"
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-[#67e8f9]">Cost dashboard</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal sm:text-4xl">Default vs Sidecar economics</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-400">
              This view uses run IDs, prompt-hash counts, cost evidence, timing, and quality verdicts. Exact prompt text is not part of the dashboard payload.
            </p>
          </div>
          <ConnectionPill mode={mode} lastRefresh={lastRefresh} />
        </div>

        {error ? (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.06] p-4 text-sm leading-6 text-amber-100/85">
            <WifiOff className="mt-0.5 shrink-0" size={17} />
            <span>{metrics ? `Last refresh failed: ${error}` : `Showing example metrics until the daemon responds: ${error}`}</span>
          </div>
        ) : null}

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard icon={<CircleDollarSign size={18} />} label="Default cost" value={formatUsd(activeMetrics.totals.defaultCostUsd)} detail={`${formatInteger(activeMetrics.totals.runCount)} runs`} />
          <MetricCard icon={<ShieldCheck size={18} />} label="Sidecar cost" value={formatUsd(activeMetrics.totals.sidecarCostUsd)} detail="Observed path" />
          <MetricCard icon={<TrendingDown size={18} />} label="Savings" value={formatUsd(activeMetrics.totals.savingsUsd)} detail={formatPercent(activeMetrics.totals.savingsPercent)} tone="good" />
          <MetricCard icon={<Timer size={18} />} label="Execution time" value={formatDurationPair(activeMetrics.totals.defaultExecutionMs, activeMetrics.totals.sidecarExecutionMs)} detail={formatTimingDelta(activeMetrics.totals.executionDeltaMs)} />
          <MetricCard icon={<CheckCircle2 size={18} />} label="Quality" value={formatQualityRate(activeMetrics.totals)} detail={`${activeMetrics.totals.qualityPreservedRuns}/${activeMetrics.totals.qualityEvaluatedRuns} preserved`} tone="good" />
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_360px]">
          <CostComparison totals={activeMetrics.totals} />
          <QualityPanel totals={activeMetrics.totals} />
        </section>

        <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.025]">
          <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Run comparison</h2>
              <p className="mt-1 text-sm text-neutral-500">Costs, timing, and quality by sanitized run.</p>
            </div>
            <span className="w-fit rounded-lg border border-white/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-neutral-400">
              generated {formatDateTime(activeMetrics.generatedAt)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-[0.16em] text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Run</th>
                  <th className="px-4 py-3 font-medium">Cost</th>
                  <th className="px-4 py-3 font-medium">Execution</th>
                  <th className="px-4 py-3 font-medium">Quality</th>
                  <th className="px-4 py-3 font-medium">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {rows.length > 0 ? rows.map((run) => <RunRow key={run.id} run={run} />) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-neutral-500">
                      No dashboard metrics have been recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}

function ConnectionPill({ mode, lastRefresh }: { mode: "live" | "loading" | "stale" | "example"; lastRefresh?: Date }) {
  const label = mode === "live" ? "daemon connected" : mode === "loading" ? "loading" : mode === "stale" ? "daemon stale" : "example data";
  const className =
    mode === "live"
      ? "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-200"
      : mode === "loading"
        ? "border-[#22d3ee]/25 bg-[#22d3ee]/[0.08] text-[#9be8f4]"
        : "border-amber-300/25 bg-amber-300/[0.08] text-amber-200";

  return (
    <div className={`flex w-fit items-center gap-2 rounded-lg border px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] ${className}`}>
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
      <p className="mt-2 truncate text-sm text-neutral-500">{detail}</p>
    </div>
  );
}

function CostComparison({ totals }: { totals: DashboardMetrics["totals"] }) {
  const maxCost = Math.max(totals.defaultCostUsd, totals.sidecarCostUsd, 0.01);
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.025] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Cost movement</h2>
          <p className="mt-1 text-sm text-neutral-500">Default cost compared with Sidecar observed cost.</p>
        </div>
        <span className="rounded-lg border border-emerald-300/20 bg-emerald-300/[0.06] px-3 py-2 font-mono text-sm text-emerald-200">
          {formatPercent(totals.savingsPercent)}
        </span>
      </div>

      <div className="mt-6 grid gap-4">
        <CostBar label="Default" amount={totals.defaultCostUsd} width={(totals.defaultCostUsd / maxCost) * 100} tone="default" />
        <CostBar label="Sidecar" amount={totals.sidecarCostUsd} width={(totals.sidecarCostUsd / maxCost) * 100} tone="sidecar" />
      </div>
    </div>
  );
}

function CostBar({ label, amount, width, tone }: { label: string; amount: number; width: number; tone: "default" | "sidecar" }) {
  const barClass = tone === "sidecar" ? "bg-emerald-300" : "bg-red-300";
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-4 text-sm">
        <span className="text-neutral-300">{label}</span>
        <span className="font-mono text-neutral-400">{formatUsd(amount)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-lg bg-white/10">
        <div className={`h-full rounded-lg ${barClass}`} style={{ width: `${Math.max(3, Math.min(width, 100))}%` }} />
      </div>
    </div>
  );
}

function QualityPanel({ totals }: { totals: DashboardMetrics["totals"] }) {
  const evaluated = totals.qualityEvaluatedRuns > 0;
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.025] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Quality preservation</h2>
          <p className="mt-1 text-sm text-neutral-500">Savings count only with a preserved result.</p>
        </div>
        <Gauge size={19} className="text-[#67e8f9]" />
      </div>
      <div className="mt-6">
        <p className="text-4xl font-semibold text-emerald-200">{evaluated ? formatPercent(totals.qualityPreservationRate) : "--"}</p>
        <p className="mt-2 text-sm text-neutral-500">
          {evaluated ? `${totals.qualityPreservedRuns} of ${totals.qualityEvaluatedRuns} evaluated runs preserved quality` : "No evaluated runs yet"}
        </p>
      </div>
      <div className="mt-5 h-3 overflow-hidden rounded-lg bg-white/10">
        <div className="h-full rounded-lg bg-emerald-300" style={{ width: `${evaluated ? Math.max(3, totals.qualityPreservationRate * 100) : 0}%` }} />
      </div>
    </div>
  );
}

function RunRow({ run }: { run: DashboardMetricsRun }) {
  return (
    <tr className="border-b border-white/10 last:border-0">
      <td className="px-4 py-4 align-top">
        <div className="font-medium text-white">{run.label}</div>
        <div className="mt-1 font-mono text-xs text-neutral-500">{run.id}</div>
        <div className="mt-2 flex items-center gap-2 text-xs text-neutral-400">
          <span>{providerLabel(run.provider)}</span>
          <span className="text-neutral-700">/</span>
          <span>{statusLabel(run.status)}</span>
        </div>
      </td>
      <td className="px-4 py-4 align-top">
        <MetricPair label="Default" value={formatUsd(run.defaultCostUsd)} />
        <MetricPair label="Sidecar" value={formatUsd(run.sidecarCostUsd)} />
        <p className={`mt-2 font-mono text-xs ${run.savingsUsd >= 0 ? "text-emerald-300" : "text-red-300"}`}>
          {formatUsd(run.savingsUsd)} ({formatPercent(run.savingsPercent)})
        </p>
      </td>
      <td className="px-4 py-4 align-top">
        <MetricPair label="Default" value={formatDuration(run.defaultExecutionMs)} />
        <MetricPair label="Sidecar" value={formatDuration(run.sidecarExecutionMs)} />
        <p className="mt-2 font-mono text-xs text-neutral-500">{formatTimingDelta(run.executionDeltaMs)}</p>
      </td>
      <td className="px-4 py-4 align-top">
        <QualityBadge verdict={run.qualityVerdict} />
        <p className="mt-2 text-xs text-neutral-500">{qualitySourceLabel(run.qualitySource)}</p>
      </td>
      <td className="px-4 py-4 align-top">
        <p className="font-mono text-xs text-neutral-300">{savingsModeLabel(run.savingsMode)}</p>
        <p className="mt-2 text-xs text-neutral-500">{formatPercent(run.confidence)} confidence</p>
        <p className="mt-2 text-xs text-neutral-500">{run.promptHashCount} prompt hashes</p>
        {run.modelRoute ? <p className="mt-2 max-w-[220px] truncate text-xs text-neutral-500">{run.modelRoute}</p> : null}
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

function QualityBadge({ verdict }: { verdict: QualityVerdict }) {
  if (verdict === "preserved") {
    return <span className="inline-flex rounded-lg border border-emerald-300/20 bg-emerald-300/[0.08] px-2.5 py-1 text-xs font-medium text-emerald-200">Preserved</span>;
  }
  if (verdict === "regressed") {
    return <span className="inline-flex rounded-lg border border-red-300/20 bg-red-300/[0.08] px-2.5 py-1 text-xs font-medium text-red-200">Regressed</span>;
  }
  return <span className="inline-flex rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-neutral-300">Not evaluated</span>;
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

function formatPercent(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: Math.abs(value) < 0.1 && value !== 0 ? 1 : 0
  }).format(value);
}

function formatDuration(value?: number): string {
  if (value === undefined) return "--";
  if (value < 1000) return `${value} ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function formatDurationPair(defaultMs?: number, sidecarMs?: number): string {
  if (defaultMs === undefined && sidecarMs === undefined) return "--";
  if (defaultMs === undefined) return formatDuration(sidecarMs);
  if (sidecarMs === undefined) return formatDuration(defaultMs);
  return `${formatDuration(defaultMs)} -> ${formatDuration(sidecarMs)}`;
}

function formatTimingDelta(value?: number): string {
  if (value === undefined) return "No baseline timing";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatDuration(Math.abs(value))}`;
}

function formatQualityRate(totals: DashboardMetrics["totals"]): string {
  return totals.qualityEvaluatedRuns > 0 ? formatPercent(totals.qualityPreservationRate) : "--";
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function providerLabel(provider: AgentProvider): string {
  if (provider === "claude-code") return "Claude Code";
  if (provider === "codex") return "Codex";
  return "Generic";
}

function statusLabel(status: RunStatus): string {
  if (status === "active") return "active";
  if (status === "blocked") return "blocked";
  if (status === "completed") return "completed";
  return "failed";
}

function savingsModeLabel(mode: SavingsMode): string {
  if (mode === "codex_baseline") return "Codex baseline";
  if (mode === "historical_local_baseline") return "Historical baseline";
  if (mode === "heuristic") return "Heuristic baseline";
  return "Run totals";
}

function qualitySourceLabel(source: DashboardMetricsRun["qualitySource"]): string {
  if (source === "event_metadata") return "Evaluator metadata";
  if (source === "run_status") return "Run status";
  return "Awaiting evaluator";
}
