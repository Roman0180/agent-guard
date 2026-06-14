"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Bot, RefreshCw } from "lucide-react";

type StoredRun = {
  id: string;
  provider: "codex" | "claude-code" | "generic";
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

type StoredEvent = {
  id: string;
  runId: string;
  agent: StoredRun["provider"];
  providerEventType?: string;
  eventType: string;
  timestamp: string;
  actor: string;
  summary: string;
  command?: { normalized?: string; riskLevel?: string; toolKind?: string };
  fileEdit?: { paths?: string[]; filesChanged?: number; linesChanged?: number };
  validation?: { command?: string; status?: string; summary?: string };
  tokenUsage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  costEstimate?: { amountUsd?: number; source?: string };
  compactMetadata?: Record<string, unknown>;
};

type Decision = {
  id: string;
  runId: string;
  eventId: string;
  createdAt: string;
  source: string;
  action: string;
  severity: string;
  reasonCode: string;
  message: string;
};

type PromptOptimizationRecord = {
  originalPrompt?: string;
  result: {
    id: string;
    mode: string;
    optimizedPrompt: string;
    rewriteReason: string;
    estimatedTokenDelta: number;
    createdAt: string;
    taskContract: {
      task: string;
      scope: string[];
      constraints: string[];
      validation_requirements: string[];
      relevant_lessons: string[];
      risk_notes: string[];
    };
  };
};

type RunState = {
  status: StoredRun["status"];
  eventCounts?: Record<string, number>;
  filesChanged?: string[];
  validationSinceLastEdit?: boolean;
  lastValidationPassed?: boolean;
  promptOptimizationCount?: number;
  interventions?: Record<string, number>;
};

type DashboardReplay = {
  run: StoredRun;
  events: StoredEvent[];
  decisions: Decision[];
  promptOptimizations: PromptOptimizationRecord[];
  state?: RunState;
};

type DashboardView = "traces" | "decisions" | "policies" | "lessons" | "analytics";

const daemonUrl = (process.env.NEXT_PUBLIC_AGENT_SIDECAR_DAEMON_URL ?? "http://127.0.0.1:4319").replace(/\/$/, "");
const modelCostPerToken = Number(process.env.NEXT_PUBLIC_AGENT_SIDECAR_MODEL_COST_PER_TOKEN_USD ?? "0.00001");

const dashboardNav: DashboardView[] = ["traces", "decisions", "policies", "lessons", "analytics"];

export default function LocalDashboardPage() {
  const [runs, setRuns] = useState<StoredRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>();
  const [details, setDetails] = useState<DashboardReplay>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>();
  const [refreshSeq, setRefreshSeq] = useState(0);
  const [activeView, setActiveView] = useState<DashboardView>("traces");

  useEffect(() => {
    let cancelled = false;

    async function loadRuns() {
      try {
        const response = await fetch(`${daemonUrl}/api/runs`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`daemon returned ${response.status}`);
        }
        const nextRuns = (await response.json()) as StoredRun[];
        if (cancelled) return;
        setRuns(nextRuns);
        setSelectedRunId((current) => current ?? nextRuns[0]?.id);
        setError(undefined);
        setLastRefresh(new Date());
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

    void loadRuns();
    const interval = window.setInterval(loadRuns, 2_500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [refreshSeq]);

  useEffect(() => {
    if (!selectedRunId) {
      setDetails(undefined);
      return;
    }

    let cancelled = false;
    const runId = selectedRunId;

    async function loadDetails() {
      try {
        const response = await fetch(`${daemonUrl}/api/dashboard/runs/${encodeURIComponent(runId)}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`run detail returned ${response.status}`);
        }
        const replay = (await response.json()) as DashboardReplay;
        if (!cancelled) {
          setDetails(replay);
          setError(undefined);
          setLastRefresh(new Date());
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      }
    }

    void loadDetails();
    const interval = window.setInterval(loadDetails, 2_500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [selectedRunId, refreshSeq]);

  const selectedRun = details?.run ?? runs.find((run) => run.id === selectedRunId);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050509] text-white md:p-4">
      <div className="mx-auto min-h-screen max-w-[1500px] overflow-hidden border border-white/10 bg-[#050509] shadow-2xl shadow-black/40 md:min-h-[calc(100vh-2rem)] md:rounded-[28px]">
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-8">
          <div className="flex items-center gap-4">
            <span className="size-4 rounded-full bg-red-400/85" />
            <span className="size-4 rounded-full bg-amber-300/85" />
            <span className="size-4 rounded-full bg-emerald-300/85" />
          </div>
          <span className="hidden font-mono text-2xl font-semibold tracking-[0.08em] text-neutral-500 sm:block">Acme account dashboard</span>
        </div>

        <div className="grid min-h-[calc(100vh-5rem)] lg:grid-cols-[380px_1fr]">
          <aside className="border-b border-white/10 p-8 lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-6">
              <span className="relative grid size-[72px] place-items-center rounded-[24px] border-2 border-white/85 bg-white/[0.035]">
                <Bot size={34} />
                <span className="absolute right-4 top-4 size-3.5 rounded-full bg-[#22d3ee]" />
              </span>
              <div>
                <p className="text-3xl font-semibold tracking-normal">Agent Sidecar</p>
                <p className="mt-2 font-mono text-xl text-neutral-500">Acme workspace</p>
              </div>
            </div>

            <nav className="mt-14 grid gap-5">
              {dashboardNav.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setActiveView(item)}
                  className={`rounded-[24px] px-6 py-5 text-left text-3xl font-semibold capitalize transition ${
                    activeView === item
                      ? "border border-[#22d3ee]/40 bg-[#07171c] text-white"
                      : "text-neutral-500 hover:bg-white/[0.035] hover:text-neutral-200"
                  }`}
                >
                  {item}
                </button>
              ))}
            </nav>

            <button
              type="button"
              onClick={() => setRefreshSeq((value) => value + 1)}
              className="mt-10 flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.025] px-5 py-4 font-mono text-sm text-neutral-400 transition hover:border-[#22d3ee]/40 hover:text-white"
            >
              <span>{lastRefresh ? `updated ${lastRefresh.toLocaleTimeString()}` : "waiting for daemon"}</span>
              <RefreshCw size={17} />
            </button>
          </aside>

          <DashboardContent
            activeView={activeView}
            details={details}
            error={error}
            loading={loading}
            runs={runs}
            selectedRun={selectedRun}
            selectedRunId={selectedRunId}
            setSelectedRunId={setSelectedRunId}
          />
        </div>
      </div>
    </main>
  );
}

function DashboardContent({
  activeView,
  details,
  error,
  loading,
  runs,
  selectedRun,
  selectedRunId,
  setSelectedRunId
}: {
  activeView: DashboardView;
  details?: DashboardReplay;
  error?: string;
  loading: boolean;
  runs: StoredRun[];
  selectedRun?: StoredRun;
  selectedRunId?: string;
  setSelectedRunId: (runId: string) => void;
}) {
  const events = details?.events ?? [];
  const decisions = details?.decisions ?? [];
  const promptOptimizations = details?.promptOptimizations ?? [];
  const savings = useMemo(() => calculateSavings(promptOptimizations), [promptOptimizations]);
  const lessons = useMemo(() => collectLessons(promptOptimizations), [promptOptimizations]);
  const guardedRuns = runs.length;
  const visibleRuns = runs.length > 0 ? runs : selectedRun ? [selectedRun] : [];

  return (
    <section className="min-w-0 p-8 sm:p-10">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="font-mono text-2xl uppercase tracking-[0.34em] text-[#22d3ee]">Live runs</p>
          <h1 className="mt-8 text-5xl font-semibold tracking-normal sm:text-6xl">Runtime control plane</h1>
        </div>
        <span className={`w-fit rounded-full border px-7 py-3 font-mono text-2xl font-semibold ${error ? "border-red-300/25 bg-red-300/[0.08] text-red-200" : "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-200"}`}>
          {error ? "daemon offline" : "daemon connected"}
        </span>
      </div>

      {error ? (
        <p className="mt-5 rounded-2xl border border-red-300/20 bg-red-300/[0.06] px-5 py-4 text-sm leading-6 text-red-100/80">
          {loading ? "Connecting to local daemon." : `Dashboard shell is ready. Start the daemon to populate live traces. ${error}`}
        </p>
      ) : null}

      <div className="mt-12 grid gap-6 xl:grid-cols-3">
        <DashboardMetric label="guarded runs" value={formatInteger(guardedRuns)} />
        <DashboardMetric label="decisions" value={formatInteger(decisions.length)} />
        <DashboardMetric label="saved lessons" value={formatInteger(lessons.length)} />
      </div>

      <SavingsPanel savings={savings} />

      <div className="mt-8 grid gap-8 xl:grid-cols-[1.08fr_0.92fr]">
        <MainPanel
          activeView={activeView}
          decisions={decisions}
          events={events}
          lessons={lessons}
          runs={visibleRuns}
          savings={savings}
          selectedRunId={selectedRunId}
          setSelectedRunId={setSelectedRunId}
        />
        <SelectedTracePanel
          decisions={decisions}
          events={events}
          promptOptimizations={promptOptimizations}
          selectedRun={selectedRun}
        />
      </div>
    </section>
  );
}

function MainPanel({
  activeView,
  decisions,
  events,
  lessons,
  runs,
  savings,
  selectedRunId,
  setSelectedRunId
}: {
  activeView: DashboardView;
  decisions: Decision[];
  events: StoredEvent[];
  lessons: string[];
  runs: StoredRun[];
  savings: SavingsStats;
  selectedRunId?: string;
  setSelectedRunId: (runId: string) => void;
}) {
  if (activeView === "decisions") {
    return (
      <DashboardPanel title="Decision" companionTitle="Reason">
        {decisions.length > 0 ? decisions.map((decision) => (
          <InfoRow key={decision.id} title={decision.action} subtitle={decision.reasonCode} pill={decision.severity} />
        )) : <MutedLine>No runtime decisions recorded yet.</MutedLine>}
      </DashboardPanel>
    );
  }

  if (activeView === "policies") {
    return (
      <DashboardPanel title="Policy" companionTitle="Status">
        {["validation after edit", "block repeated failures", "require continuation"].map((policy) => (
          <InfoRow key={policy} title={policy} subtitle="active for guarded runs" pill="enabled" />
        ))}
      </DashboardPanel>
    );
  }

  if (activeView === "lessons") {
    return (
      <DashboardPanel title="Lesson" companionTitle="Source">
        {lessons.length > 0 ? lessons.map((lesson) => (
          <InfoRow key={lesson} title={lesson} subtitle="pattern library match" pill="injected" />
        )) : <MutedLine>No saved lessons or pattern matches recorded yet.</MutedLine>}
      </DashboardPanel>
    );
  }

  if (activeView === "analytics") {
    return (
      <DashboardPanel title="Metric" companionTitle="Value">
        <InfoRow title="candidate traces" subtitle="pattern or prompt optimization records" pill={formatInteger(savings.tracesInjected)} />
        <InfoRow title="avg task cost delta" subtitle="token-based proxy per successful trace" pill={formatUsd(savings.avgCostDeltaPerTrace)} />
        <InfoRow title="model cost input" subtitle="current configured model pricing" pill={formatRate(savings.modelCostPerToken)} />
      </DashboardPanel>
    );
  }

  return (
    <DashboardPanel title="Trace" companionTitle="Decision">
      {runs.length > 0 ? runs.map((run) => {
        const isSelected = run.id === selectedRunId;
        return (
          <button
            key={run.id}
            type="button"
            onClick={() => setSelectedRunId(run.id)}
            className={`grid gap-4 rounded-[24px] border p-6 text-left transition sm:grid-cols-[1fr_auto] sm:items-center ${
              isSelected ? "border-white/15 bg-white/[0.035]" : "border-white/10 bg-[#08080d] hover:border-[#22d3ee]/35"
            }`}
          >
            <div>
              <p className="max-w-[18rem] text-3xl font-semibold leading-tight">{run.taskSummary ?? run.id}</p>
              <p className="mt-4 font-mono text-xl text-neutral-500">{statusLabel(run.status)}</p>
            </div>
            <span className="w-fit rounded-full border border-white/10 px-6 py-3 font-mono text-xl text-neutral-300">
              {run.status === "active" ? "watching" : run.status === "completed" ? "validated" : "require validation"}
            </span>
          </button>
        );
      }) : <MutedLine>No traces yet. Start the daemon and run a Codex hook to populate this panel.</MutedLine>}
      {events.slice(0, 3).map((event) => (
        <InfoRow key={event.id} title={event.summary} subtitle={event.eventType} pill={formatDate(event.timestamp)} />
      ))}
    </DashboardPanel>
  );
}

function SelectedTracePanel({
  decisions,
  events,
  promptOptimizations,
  selectedRun
}: {
  decisions: Decision[];
  events: StoredEvent[];
  promptOptimizations: PromptOptimizationRecord[];
  selectedRun?: StoredRun;
}) {
  const optimization = promptOptimizations.at(-1);
  const latestDecision = decisions.at(-1);
  const latestValidation = [...events].reverse().find((event) => event.validation)?.validation;
  const cards = [
    latestDecision ? `policy: ${latestDecision.action}` : "policy: validation after edit",
    optimization ? `lesson: ${optimization.result.taskContract.relevant_lessons[0] ?? "pattern match recorded"}` : "lesson: awaiting pattern match",
    latestValidation ? `action: ${latestValidation.status}` : selectedRun ? `action: ${selectedRun.status}` : "action: waiting for trace"
  ];

  return (
    <aside className="rounded-[28px] border border-[#22d3ee]/25 bg-[#061015] p-8">
      <p className="font-mono text-2xl uppercase tracking-[0.34em] text-[#22d3ee]">Selected trace</p>
      <h2 className="mt-10 text-4xl font-semibold leading-tight">{selectedRun?.taskSummary ?? selectedRun?.id ?? "No trace selected"}</h2>
      <div className="mt-10 grid gap-5">
        {cards.map((card) => (
          <div key={card} className="rounded-[22px] border border-white/10 bg-[#091011] p-6 text-2xl font-semibold leading-9 text-neutral-200">
            {card}
          </div>
        ))}
      </div>
    </aside>
  );
}

function SavingsPanel({ savings }: { savings: SavingsStats }) {
  return (
    <section className="mt-8 rounded-[28px] border border-emerald-300/25 bg-emerald-300/[0.06] p-8">
      <div className="grid gap-6 xl:grid-cols-[270px_1fr] xl:items-center">
        <div>
          <p className="font-mono text-2xl uppercase tracking-[0.28em] text-emerald-100">Task cost improved</p>
          <p className="mt-8 text-6xl font-semibold leading-none text-emerald-100">{formatUsd(savings.estimatedSavings)}</p>
        </div>
        <p className="text-3xl font-semibold leading-[1.55] text-emerald-50/75">
          Estimated from prompt refinements, quality gates, and token-based cost evidence. Count it only when the task outcome is still successful.
        </p>
      </div>
    </section>
  );
}

function DashboardMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.035] p-8">
      <p className="font-mono text-2xl uppercase tracking-[0.24em] text-neutral-500">{label}</p>
      <p className="mt-8 text-6xl font-semibold leading-none">{value}</p>
    </div>
  );
}

function DashboardPanel({ title, companionTitle, children }: { title: string; companionTitle: string; children: ReactNode }) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.018] p-6">
      <div className="grid grid-cols-[1fr_auto] gap-4 px-5 font-mono text-2xl uppercase tracking-[0.24em] text-neutral-500">
        <span>{title}</span>
        <span>{companionTitle}</span>
      </div>
      <div className="mt-6 grid gap-4">{children}</div>
    </section>
  );
}

function InfoRow({ title, subtitle, pill }: { title: string; subtitle: string; pill: string }) {
  return (
    <div className="grid gap-4 rounded-[24px] border border-white/10 bg-[#08080d] p-6 sm:grid-cols-[1fr_auto] sm:items-center">
      <div>
        <p className="text-3xl font-semibold leading-tight">{title}</p>
        <p className="mt-4 font-mono text-xl text-neutral-500">{subtitle}</p>
      </div>
      <span className="w-fit rounded-full border border-white/10 px-6 py-3 font-mono text-xl text-neutral-300">{pill}</span>
    </div>
  );
}

function MutedLine({ children }: { children: ReactNode }) {
  return <p className="rounded-[24px] border border-white/10 bg-[#08080d] p-6 text-xl leading-9 text-neutral-500">{children}</p>;
}

type SavingsStats = {
  tracesInjected: number;
  avgTokensSavedPerInjection: number;
  avgCostDeltaPerTrace: number;
  modelCostPerToken: number;
  estimatedSavings: number;
};

function calculateSavings(promptOptimizations: PromptOptimizationRecord[]): SavingsStats {
  const tracesInjected = promptOptimizations.length;
  const totalTokensSaved = promptOptimizations.reduce((sum, record) => {
    return sum + Math.max(0, -record.result.estimatedTokenDelta);
  }, 0);
  const avgTokensSavedPerInjection = tracesInjected > 0 ? totalTokensSaved / tracesInjected : 0;

  return {
    tracesInjected,
    avgTokensSavedPerInjection,
    avgCostDeltaPerTrace: avgTokensSavedPerInjection * modelCostPerToken,
    modelCostPerToken,
    estimatedSavings: tracesInjected * avgTokensSavedPerInjection * modelCostPerToken
  };
}

function collectLessons(promptOptimizations: PromptOptimizationRecord[]): string[] {
  const lessons = new Set<string>();
  for (const record of promptOptimizations) {
    for (const lesson of record.result.taskContract.relevant_lessons) {
      if (lesson.trim()) {
        lessons.add(lesson);
      }
    }
  }
  return [...lessons];
}

function statusLabel(status: StoredRun["status"]): string {
  if (status === "active") return "watching";
  if (status === "completed") return "healthy";
  return status;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatRate(value: number): string {
  return value.toLocaleString("en-US", { maximumSignificantDigits: 3 });
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value > 0 && value < 1 ? 4 : 2,
    maximumFractionDigits: value > 0 && value < 1 ? 4 : 2
  }).format(value);
}
