import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Bot, Code2, DollarSign, GitBranch, Gauge, Terminal } from "lucide-react";

const sections = [
  ["Overview", "#overview"],
  ["Install", "#install"],
  ["How it works", "#how-it-works"],
  ["Decisions", "#decisions"],
  ["Cost math", "#cost-math"]
] as const;

const lifecycle = [
  ["Observe", "Hook events from Codex, Claude Code, or another agent are captured as a structured run timeline"],
  ["Evaluate", "The sidecar checks monitor signals, tool-cost guardrails, repo map entries, and approved lessons"],
  ["Respond", "The agent receives one compact action: allow, warn, block, require validation, or inject concise context"],
  ["Measure", "Costs, tokens, decisions, lessons, and outcomes are saved for replay and baseline comparison"]
];

const capabilities = [
  "Scoped lesson recall",
  "Hash-aware file memory",
  "Runtime loop monitors",
  "Tool policy supervision",
  "Task-context compression",
  "Steering direction"
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
            <SectionTitle icon={GitBranch} label="How it works" title="Observe, evaluate, respond, measure" />
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
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-emerald-200">Reporting rule</p>
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

function LogoMark() {
  return (
    <span className="relative grid size-9 place-items-center rounded-xl border border-white/12 bg-white/[0.04]">
      <Bot size={19} />
      <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[#22d3ee]" />
    </span>
  );
}
