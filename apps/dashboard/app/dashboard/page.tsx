"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  BookOpen,
  Bot,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Zap,
  type LucideIcon
} from "lucide-react";

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

type DashboardView = "timeline" | "decisions" | "prompt" | "state";

const daemonUrl = (process.env.NEXT_PUBLIC_AGENT_SIDECAR_DAEMON_URL ?? "http://127.0.0.1:4319").replace(/\/$/, "");

export default function LocalDashboardPage() {
  const [runs, setRuns] = useState<StoredRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>();
  const [details, setDetails] = useState<DashboardReplay>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>();
  const [refreshSeq, setRefreshSeq] = useState(0);
  const [activeView, setActiveView] = useState<DashboardView>("timeline");

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
  const promptEvents = useMemo(() => details?.events.filter((event) => event.eventType === "prompt") ?? [], [details]);
  const latestPrompt = details?.promptOptimizations[0]?.originalPrompt ?? promptEvents.at(-1)?.summary ?? selectedRun?.taskSummary;
  const totalTokens = (selectedRun?.totalInputTokens ?? 0) + (selectedRun?.totalOutputTokens ?? 0);

  return (
    <main className="min-h-screen bg-[#050509] p-4 text-white sm:p-6 lg:p-8">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_18%_8%,rgba(124,92,255,0.14),transparent_32%),radial-gradient(circle_at_82%_12%,rgba(34,211,238,0.14),transparent_30%),linear-gradient(180deg,#050509_0%,#0a0a12_52%,#050509_100%)]" />
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[28px] border border-white/10 bg-[#07070b] shadow-2xl shadow-[#22d3ee]/10">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="size-3 rounded-full bg-red-400/80" />
            <span className="size-3 rounded-full bg-amber-300/80" />
            <span className="size-3 rounded-full bg-emerald-300/80" />
          </div>
          <span className="font-mono text-sm text-neutral-500">Agent Sidecar runtime dashboard</span>
          <LiveBadge connected={!error} />
        </div>

        <div className="grid min-h-[760px] bg-[radial-gradient(circle_at_78%_18%,rgba(34,211,238,0.12),transparent_30%),#07070b] lg:grid-cols-[320px_1fr]">
          <aside className="border-b border-white/10 p-5 lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-4">
              <span className="relative grid size-16 place-items-center rounded-3xl border border-white/80 bg-white/[0.04]">
                <Bot size={30} />
                <span className="absolute right-4 top-4 size-3 rounded-full bg-[#22d3ee]" />
              </span>
              <div>
                <p className="text-2xl font-semibold">Agent Sidecar</p>
                <p className="mt-1 font-mono text-sm text-neutral-500">local runtime</p>
              </div>
            </div>

            <div className="mt-10 grid gap-3">
              <SidebarButton icon={Activity} label="Timeline" active={activeView === "timeline"} onClick={() => setActiveView("timeline")} />
              <SidebarButton icon={ShieldCheck} label="Decisions" active={activeView === "decisions"} onClick={() => setActiveView("decisions")} />
              <SidebarButton icon={FileText} label="Prompt" active={activeView === "prompt"} onClick={() => setActiveView("prompt")} />
              <SidebarButton icon={BookOpen} label="Run State" active={activeView === "state"} onClick={() => setActiveView("state")} />
            </div>

            <button
              type="button"
              onClick={() => setRefreshSeq((value) => value + 1)}
              className="mt-6 flex w-full items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3 font-mono text-xs text-neutral-300 transition hover:border-[#22d3ee]/40 hover:text-white"
            >
              <span>{lastRefresh ? `updated ${lastRefresh.toLocaleTimeString()}` : "waiting"}</span>
              <RefreshCw size={15} />
            </button>

            <div className="mt-8">
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-neutral-500">Prompt runs</p>
              <div className="mt-4 grid gap-3">
                {runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => setSelectedRunId(run.id)}
                  className={`rounded-2xl border p-4 text-left shadow-lg transition ${
                    run.id === selectedRunId
                      ? "border-[#22d3ee]/50 bg-[#061015] shadow-[#22d3ee]/10"
                      : "border-white/10 bg-white/[0.025] hover:border-white/25 hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs uppercase text-[#22d3ee]">{run.provider}</span>
                    <StatusText status={run.status} />
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm font-semibold leading-6 text-neutral-100">
                    {run.taskSummary ?? run.id}
                  </p>
                  <p className="mt-3 truncate font-mono text-xs text-neutral-500">{formatDate(run.updatedAt)}</p>
                </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="p-5 sm:p-8 lg:p-10">
            {loading ? (
              <EmptyState title="Loading local runs" body="Reading hook events from the local Agent Sidecar daemon." />
            ) : error && runs.length === 0 ? (
              <EmptyState
                title="Daemon not reachable"
                body={`Start the daemon with pnpm dev:daemon, then submit hook events through the CLI. ${error}`}
              />
            ) : !selectedRun ? (
              <EmptyState
                title="No prompt runs yet"
                body="Start the daemon, then pipe a Codex or generic hook event into agent-sidecar hook. New runs appear here automatically."
              />
            ) : (
              <RunDetails
                run={selectedRun}
                details={details}
                latestPrompt={latestPrompt}
                totalTokens={totalTokens}
                promptCount={promptEvents.length}
                activeView={activeView}
                setActiveView={setActiveView}
              />
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function RunDetails({
  run,
  details,
  latestPrompt,
  totalTokens,
  promptCount,
  activeView,
  setActiveView
}: {
  run: StoredRun;
  details?: DashboardReplay;
  latestPrompt?: string;
  totalTokens: number;
  promptCount: number;
  activeView: DashboardView;
  setActiveView: (view: DashboardView) => void;
}) {
  const events = details?.events ?? [];
  const decisions = details?.decisions ?? [];
  const optimization = details?.promptOptimizations.at(-1);
  const state = details?.state;

  return (
    <div>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="font-mono text-sm uppercase tracking-[0.28em] text-[#22d3ee]">Selected CLI request</p>
          <h1 className="mt-3 max-w-4xl text-3xl font-semibold leading-tight sm:text-5xl">
            {latestPrompt ?? run.taskSummary ?? run.id}
          </h1>
          <div className="mt-4 flex flex-wrap gap-2 font-mono text-xs text-neutral-400">
            <span className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">{run.provider}</span>
            <span className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">{run.repoRoot ?? "repo unknown"}</span>
            <span className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">{run.branch ?? "branch unknown"}</span>
          </div>
        </div>
        <StatusPanel run={run} />
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-4">
        <MetricCard icon={Terminal} label="events" value={events.length.toString()} />
        <MetricCard icon={Zap} label="prompts" value={promptCount.toString()} />
        <MetricCard icon={Activity} label="tokens" value={formatInteger(totalTokens)} />
        <MetricCard icon={DollarSign} label="cost" value={formatUsd(run.totalEstimatedCostUsd ?? 0)} />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <TabButton label="Timeline" active={activeView === "timeline"} onClick={() => setActiveView("timeline")} />
        <TabButton label="Decisions" active={activeView === "decisions"} onClick={() => setActiveView("decisions")} />
        <TabButton label="Prompt Optimization" active={activeView === "prompt"} onClick={() => setActiveView("prompt")} />
        <TabButton label="Run State" active={activeView === "state"} onClick={() => setActiveView("state")} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        {activeView === "timeline" ? (
          <Panel title="Timeline">
          <div className="grid gap-3">
            {events.map((event) => (
              <button
                key={event.id}
                type="button"
                className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-[#22d3ee]/35 hover:bg-[#071012]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-xs uppercase text-neutral-300">
                    {event.eventType}
                  </span>
                  <span className="font-mono text-xs text-neutral-500">{formatDate(event.timestamp)}</span>
                </div>
                <p className="mt-3 text-sm font-semibold leading-6 text-neutral-100">{event.summary}</p>
                <EventMeta event={event} />
              </button>
            ))}
            {events.length === 0 ? <MutedLine>No events recorded for this run yet.</MutedLine> : null}
          </div>
          </Panel>
        ) : null}

        {activeView === "timeline" || activeView === "decisions" ? (
          <div className="grid gap-6">
          <Panel title="Cost And Usage">
            <div className="grid gap-3">
              <UsageRow label="input tokens" value={formatInteger(run.totalInputTokens ?? 0)} />
              <UsageRow label="output tokens" value={formatInteger(run.totalOutputTokens ?? 0)} />
              <UsageRow label="estimated cost" value={formatUsd(run.totalEstimatedCostUsd ?? 0)} />
              <UsageRow label="cost source" value={events.some((event) => event.costEstimate?.source === "provider") ? "provider" : "estimated"} />
            </div>
          </Panel>

          <Panel title="Decisions">
            <div className="grid gap-3">
              {decisions.map((decision) => (
                <button
                  key={decision.id}
                  type="button"
                  className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-[#22d3ee]/35 hover:bg-[#071012]"
                >
                  <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#22d3ee]">{decision.action}</p>
                  <p className="mt-2 text-sm font-semibold leading-6">{decision.reasonCode}</p>
                  <p className="mt-2 line-clamp-4 text-sm leading-6 text-neutral-400">{decision.message}</p>
                </button>
              ))}
              {decisions.length === 0 ? <MutedLine>No runtime decisions recorded yet.</MutedLine> : null}
            </div>
          </Panel>
          </div>
        ) : null}
      </div>

      <div className={`mt-6 grid gap-6 ${activeView === "timeline" ? "xl:grid-cols-2" : ""}`}>
        {activeView === "timeline" || activeView === "prompt" ? (
        <Panel title="Intervention Prompt Patch">
          {optimization ? (
            <div>
              <p className="text-sm leading-7 text-neutral-300">{optimization.result.rewriteReason}</p>
              <div className="mt-4 rounded-xl border border-[#22d3ee]/20 bg-[#061015] p-4">
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#22d3ee]">suggested prompt patch</p>
                <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words pr-2 text-sm leading-6 text-neutral-200">
                  {optimization.result.optimizedPrompt}
                </pre>
              </div>
            </div>
          ) : (
            <MutedLine>No intervention prompt patch was injected for this run.</MutedLine>
          )}
        </Panel>
        ) : null}

        {activeView === "timeline" || activeView === "state" ? (
        <Panel title="Run State">
          {state ? (
            <div className="grid gap-3">
              <UsageRow label="validation after edit" value={state.validationSinceLastEdit ? "yes" : "no"} />
              <UsageRow label="last validation" value={state.lastValidationPassed === undefined ? "unknown" : state.lastValidationPassed ? "passed" : "failed"} />
              <UsageRow label="files changed" value={formatInteger(state.filesChanged?.length ?? 0)} />
              <UsageRow label="prompt optimizations" value={formatInteger(state.promptOptimizationCount ?? 0)} />
            </div>
          ) : (
            <MutedLine>No run-state snapshot recorded yet.</MutedLine>
          )}
        </Panel>
        ) : null}
      </div>
    </div>
  );
}

function EventMeta({ event }: { event: StoredEvent }) {
  const cost = event.costEstimate?.amountUsd;
  const tokens = event.tokenUsage?.totalTokens ?? (event.tokenUsage?.inputTokens ?? 0) + (event.tokenUsage?.outputTokens ?? 0);
  const command = event.command?.normalized ?? event.validation?.command;
  const files = event.fileEdit?.paths ?? [];

  if (!cost && !tokens && !command && files.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2 font-mono text-xs text-neutral-400">
      {tokens ? <span className="rounded-md bg-white/[0.05] px-2 py-1">{formatInteger(tokens)} tokens</span> : null}
      {cost ? <span className="rounded-md bg-white/[0.05] px-2 py-1">{formatUsd(cost)}</span> : null}
      {command ? <span className="max-w-full truncate rounded-md bg-white/[0.05] px-2 py-1">{command}</span> : null}
      {files.slice(0, 3).map((file) => (
        <span key={file} className="max-w-full truncate rounded-md bg-white/[0.05] px-2 py-1">{file}</span>
      ))}
    </div>
  );
}

function SidebarButton({
  icon: Icon,
  label,
  active,
  onClick
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-2xl px-5 py-4 text-left text-lg font-semibold transition ${
        active ? "border border-[#22d3ee]/35 bg-[#22d3ee]/[0.08] text-white" : "text-neutral-500 hover:bg-white/[0.035] hover:text-neutral-200"
      }`}
    >
      <Icon size={20} />
      <span>{label}</span>
    </button>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 font-mono text-sm transition ${
        active
          ? "border-[#22d3ee]/55 bg-[#22d3ee]/[0.12] text-white shadow-lg shadow-[#22d3ee]/10"
          : "border-white/10 bg-black/20 text-neutral-400 hover:border-white/25 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function StatusPanel({ run }: { run: StoredRun }) {
  return (
    <div className="w-full rounded-xl border border-white/10 bg-black/20 p-4 xl:w-64">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-neutral-500">status</span>
        <StatusText status={run.status} />
      </div>
      <div className="mt-4 grid gap-2 font-mono text-xs text-neutral-400">
        <span>started {formatDate(run.startedAt)}</span>
        <span>updated {formatDate(run.updatedAt)}</span>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-neutral-500">{label}</p>
        <Icon size={18} className="text-[#22d3ee]" />
      </div>
      <p className="mt-5 text-3xl font-semibold leading-none sm:text-4xl">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.025] p-5">
      <h2 className="font-mono text-xs uppercase tracking-[0.22em] text-neutral-500">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function UsageRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
      <span className="text-sm text-neutral-400">{label}</span>
      <span className="text-right font-mono text-sm text-neutral-100">{value}</span>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid min-h-[620px] place-items-center">
      <div className="max-w-xl text-center">
        <Clock className="mx-auto text-[#22d3ee]" size={38} />
        <h1 className="mt-5 text-3xl font-semibold">{title}</h1>
        <p className="mt-4 text-base leading-7 text-neutral-400">{body}</p>
      </div>
    </div>
  );
}

function LiveBadge({ connected }: { connected: boolean }) {
  return (
    <span className={`rounded-full border px-3 py-1 font-mono text-xs ${connected ? "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-200" : "border-red-300/25 bg-red-300/[0.08] text-red-200"}`}>
      {connected ? "live" : "offline"}
    </span>
  );
}

function StatusText({ status }: { status: StoredRun["status"] }) {
  const className =
    status === "completed"
      ? "text-emerald-200"
      : status === "failed" || status === "blocked"
        ? "text-red-200"
        : "text-amber-200";

  return (
    <span className={`inline-flex items-center gap-1 font-mono text-xs uppercase ${className}`}>
      <CheckCircle2 size={13} />
      {status}
    </span>
  );
}

function MutedLine({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-neutral-500">{children}</p>;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value > 0 && value < 1 ? 4 : 2,
    maximumFractionDigits: value > 0 && value < 1 ? 4 : 2
  }).format(value);
}
