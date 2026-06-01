import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Bot, Code2, DollarSign, GitBranch, Gauge, Terminal } from "lucide-react";

const sections = [
  ["Overview", "#overview"],
  ["Install", "#install"],
  ["How it works", "#how-it-works"],
  ["Architecture", "#architecture"],
  ["Decisions", "#decisions"],
  ["Cost math", "#cost-math"]
] as const;

const lifecycle = [
  ["Observe", "Hook events from Codex, Claude Code, or another agent are captured as a structured run timeline"],
  ["Optimize", "Vague prompts are rewritten into compact task contracts before the agent spends more steps"],
  ["Evaluate", "The sidecar checks monitor signals, tool-cost guardrails, repo map entries, and approved lessons"],
  ["Respond", "The agent receives one compact action: allow, warn, block, require validation, or inject concise context"],
  ["Measure", "Costs, tokens, decisions, lessons, and outcomes are saved for replay and baseline comparison"]
];

const capabilities = [
  "Runbook memory",
  "Repo map cache",
  "Trajectory watchdogs",
  "Tool-cost guardrails",
  "Prompt shaping and compaction",
  "Ensemble steering"
];

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-[#07070b] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_8%,rgba(124,92,255,0.16),transparent_32%),radial-gradient(circle_at_82%_12%,rgba(34,211,238,0.12),transparent_30%),#07070b]" />
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07070b]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-7 lg:px-10">
          <a href="/" className="flex items-center gap-3">
            <LogoMark />
            <span className="text-sm font-semibold tracking-wide">Agent Sidecar</span>
          </a>
          <a href="/" className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-[#07070b]">
            Landing
            <ArrowRight size={16} />
          </a>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-7 lg:grid-cols-[240px_1fr] lg:px-10">
        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-neutral-500">Docs</p>
            <nav className="mt-4 grid gap-1">
              {sections.map(([label, href]) => (
                <a key={href} href={href} className="rounded-lg px-3 py-2 text-sm text-neutral-400 transition hover:bg-white/[0.04] hover:text-white">
                  {label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <article className="min-w-0">
          <section
            id="overview"
            className="rounded-[28px] border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-[#7c5cff]/10 sm:p-8"
          >
            <Badge>Introduction</Badge>
            <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-tight sm:text-6xl">
              A terminal sidecar for more reliable coding agents
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-neutral-300">
              Agent Sidecar sits beside Codex, Claude Code, or another coding agent. It receives hook events, evaluates the run, returns runtime decisions, and gives teams a replayable account of what happened.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {capabilities.map((capability) => (
                <div key={capability} className="rounded-2xl border border-white/10 bg-[#050509] p-4 text-sm text-neutral-300">
                  {capability}
                </div>
              ))}
            </div>
          </section>

          <section
            id="install"
            className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.035] p-6 sm:p-8"
          >
            <SectionTitle icon={Terminal} label="Install" title="Install once, run from your terminal" />
            <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#050509]">
              <div className="border-b border-white/10 px-4 py-3 font-mono text-xs uppercase tracking-[0.18em] text-neutral-500">
                terminal
              </div>
              <pre className="overflow-x-auto p-5 text-sm leading-7 text-neutral-200">
                <code>{`python -m pip install agent-sidecar
agent-sidecar daemon start
agent-sidecar hook install --provider codex
agent-sidecar hook install --provider claude-code`}</code>
              </pre>
            </div>
            <p className="mt-4 text-sm leading-6 text-neutral-400">
              The terminal process owns hook ingestion and decision responses. The dashboard is a replay and control surface, not the runtime authority.
            </p>
          </section>

          <section
            id="how-it-works"
            className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.035] p-6 sm:p-8"
          >
            <SectionTitle icon={GitBranch} label="How it works" title="Observe, optimize, evaluate, respond, measure" />
            <div className="mt-6 grid gap-3">
              {lifecycle.map(([label, body], index) => (
                <div key={label} className="grid gap-3 rounded-2xl border border-white/10 bg-[#050509] p-4 sm:grid-cols-[56px_150px_1fr] sm:items-start">
                  <span className="grid size-10 place-items-center rounded-xl bg-white/[0.04] font-mono text-xs text-neutral-400">
                    {index + 1}
                  </span>
                  <h3 className="font-semibold">{label}</h3>
                  <p className="text-sm leading-6 text-neutral-400">{body}</p>
                </div>
              ))}
            </div>
          </section>

          <section
            id="architecture"
            className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.035] p-6 sm:p-8"
          >
            <SectionTitle icon={GitBranch} label="Architecture" title="Local sidecar, runtime decisions" />
            <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#050509]">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-red-400/80" />
                  <span className="size-2 rounded-full bg-amber-300/80" />
                  <span className="size-2 rounded-full bg-emerald-300/80" />
                </div>
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-neutral-500">runtime pipeline</span>
              </div>
              <SystemDiagram />
            </div>
          </section>

          <section
            id="decisions"
            className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.035] p-6 sm:p-8"
          >
            <SectionTitle icon={Gauge} label="Decisions" title="The agent gets one explicit instruction back" />
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {[
                ["allow", "Let a healthy step continue without extra context"],
                ["warn", "Surface a risk while allowing the run to continue"],
                ["block", "Stop dangerous commands or known waste loops"],
                ["require continuation", "Prevent premature final answers when more work is needed"],
                ["require validation", "Ask the agent to run targeted checks before finalizing"],
                ["inject context", "Add a short approved lesson, repo-map hint, or task contract"]
              ].map(([label, body]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-[#050509] p-4">
                  <h3 className="font-mono text-sm uppercase tracking-[0.14em] text-[#22d3ee]">{label}</h3>
                  <p className="mt-3 text-sm leading-6 text-neutral-400">{body}</p>
                </div>
              ))}
            </div>
          </section>

          <section
            id="cost-math"
            className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.035] p-6 sm:p-8"
          >
            <SectionTitle icon={DollarSign} label="Cost math" title="Savings are calculated from comparable runs" />
            <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-white/10 bg-[#050509] p-5">
                <p className="text-sm leading-7 text-neutral-300">
                  Each step records input tokens, output tokens, cache reads, cache writes, model id, and provider pricing. A run cost is the sum of step costs. Savings are reported against a matched unguarded baseline or an explicit A/B control arm.
                </p>
                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 font-mono text-xs leading-6 text-neutral-300">
                  sidecar_savings = baseline_run_cost - guarded_run_cost
                  <br />
                  total_cost_saved = sum(sidecar_savings across matched runs)
                </div>
              </div>
              <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.065] p-5">
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-emerald-200">Reporting note</p>
                <p className="mt-3 text-sm leading-7 text-emerald-50/75">
                  If there is no matched baseline, the dashboard labels the number as an estimate. If controlled arms exist, the report can show per-arm deltas for cost, tokens, validation rate, and successful completion.
                </p>
              </div>
            </div>
          </section>
        </article>
      </div>
    </main>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-xs text-neutral-200">
      <Code2 size={12} className="text-[#22d3ee]" />
      {children}
    </span>
  );
}

function SectionTitle({ icon: Icon, label, title }: { icon: LucideIcon; label: string; title: string }) {
  return (
    <div>
      <Badge>
        <Icon size={12} />
        {label}
      </Badge>
      <h2 className="mt-4 text-3xl font-semibold leading-tight sm:text-4xl">{title}</h2>
    </div>
  );
}

function SystemDiagram() {
  return (
    <div className="bg-[radial-gradient(circle_at_18%_18%,rgba(124,92,255,0.2),transparent_30%),radial-gradient(circle_at_82%_70%,rgba(34,211,238,0.14),transparent_32%),#050509] p-5 sm:p-7">
      <div className="grid gap-4 lg:grid-cols-[1fr_72px_1.2fr_72px_1fr] lg:items-center">
        <DiagramNode label="Coding agent" detail="Codex, Claude Code, or another agent emits hook events" tone="neutral" />
        <DiagramArrow />
        <DiagramNode label="Agent Sidecar" detail="CLI adapter and local daemon evaluate the run" tone="cyan" />
        <DiagramArrow />
        <DiagramNode label="Runtime decision" detail="warn, block, continue, inject context, or require validation" tone="green" />
      </div>

      <div className="my-5 h-px bg-white/10" />

      <div className="rounded-2xl border border-[#22d3ee]/20 bg-[#22d3ee]/[0.045] p-4">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#22d3ee]">Sidecar internals</p>
            <h3 className="mt-2 text-xl font-semibold">Evaluate before the agent continues</h3>
          </div>
          <span className="w-fit rounded-full border border-white/10 bg-black/20 px-3 py-1 font-mono text-xs text-neutral-300">
            local daemon
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Ingest", "Normalize hook events and update run state"],
            ["Remember", "Retrieve file memory and approved lessons"],
            ["Steer", "Apply prompt optimization, monitor signals, and low-cost model ensemble guidance"],
            ["Record", "Store traces, decisions, cost signals, and outcomes"]
          ].map(([label, detail]) => (
            <div key={label} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-white">{label}</p>
              <p className="mt-2 text-sm leading-6 text-neutral-400">{detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="my-5 h-px bg-white/10" />

      <div className="grid gap-4 lg:grid-cols-[1fr_72px_1fr_72px_1fr] lg:items-center">
        <DiagramNode label="Dashboard" detail="Replay UI and control plane" tone="violet" />
        <DiagramArrow />
        <DiagramNode label="Daemon API" detail="Reads and writes through the sidecar" tone="cyan" />
        <DiagramArrow />
        <DiagramNode label="Local data" detail="Traces, policies, lessons, analytics" tone="neutral" />
      </div>
    </div>
  );
}

function DiagramNode({ label, detail, tone }: { label: string; detail: string; tone: "neutral" | "cyan" | "green" | "violet" }) {
  const tones = {
    neutral: "border-white/10 bg-white/[0.035]",
    cyan: "border-[#22d3ee]/25 bg-[#22d3ee]/[0.055]",
    green: "border-emerald-300/25 bg-emerald-300/[0.06]",
    violet: "border-violet-300/25 bg-violet-300/[0.06]"
  };

  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-neutral-500">{label}</p>
      <p className="mt-3 text-sm leading-6 text-neutral-300">{detail}</p>
    </div>
  );
}

function DiagramArrow() {
  return (
    <div className="hidden items-center justify-center lg:flex">
      <div className="h-px flex-1 bg-white/15" />
      <div className="size-2 rotate-45 border-r border-t border-white/30" />
    </div>
  );
}

function LogoMark() {
  return (
    <span className="relative grid size-9 place-items-center rounded-xl border border-white/12 bg-white/[0.04]">
      <Bot size={19} />
      <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[#22d3ee]" />
    </span>
  );
}
