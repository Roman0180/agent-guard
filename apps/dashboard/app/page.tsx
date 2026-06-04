"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import {
  Bot,
  Code2,
  FileText,
  GitBranch,
  Menu,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Volume2,
  X
} from "lucide-react";

const navItems = [
  ["Problem", "#problem"],
  ["Architecture", "#architecture"],
  ["Boundary", "#boundary"],
  ["Demo", "#demo"],
  ["Adoption", "#adoption"]
] as const;

const wasteDrivers = [
  "Rereading the same files and diffs across runs",
  "Repeating reasoning the repo already taught the agent",
  "Carrying bloated context into every model call",
  "Using premium models for simple routing and lookup work"
];

const capabilities = [
  {
    icon: Sparkles,
    title: "Observe first",
    body: "Run in telemetry-only mode to baseline token usage, model calls, tool calls, latency, repeated work, failed runs, repo metadata, and PR metadata without changing agent behavior.",
    detail: "Measure waste before steering it."
  },
  {
    icon: GitBranch,
    title: "Optimize locally",
    body: "When ready, enable local steering for context compression, repo memory, prompt rewriting, repeated-work avoidance, and task-aware model routing where sensitive context is visible.",
    detail: "Optimization happens inside your boundary."
  },
  {
    icon: FileText,
    title: "Attribute savings",
    body: "The dashboard receives sanitized telemetry slices so teams can see baseline cost, optimized cost, tokens saved, routing decisions, latency, failure rates, and spend by repo, PR, agent, tool, model, and workflow.",
    detail: "Cost signals become actionable."
  }
];

const crossesBoundary = [
  "Token counts",
  "Model usage",
  "Tool names",
  "Latency",
  "Cost estimates",
  "Routing decisions",
  "Run status",
  "Optional sanitized or truncated tool traces"
];

const staysLocal = [
  "LLM provider API keys",
  "Full source code",
  "Private system prompts",
  "Full user prompts",
  "Secrets",
  "Raw PII",
  "Unsanitized tool outputs",
  "Tool outputs that have not been truncated"
];

const modes = [
  {
    title: "Observe-only mode",
    badge: "low-risk baseline",
    body: "Install Sidecar beside the coding agent, keep behavior unchanged, capture telemetry locally, and send only sanitized slices to the dashboard.",
    items: ["Token waste", "Repeated work", "Slow tools", "Expensive model usage", "Failed runs"]
  },
  {
    title: "Active steering mode",
    badge: "enable when ready",
    body: "Once teams trust the telemetry, Sidecar can steer each run locally using the context that should never leave your infrastructure.",
    items: ["Compress context", "Reuse repo memory", "Rewrite prompts locally", "Route models smarter", "Avoid repeated file reads"]
  }
];

const dashboardMetrics = [
  ["Baseline cost", "$2.84/run"],
  ["Optimized cost", "$1.41/run"],
  ["Tokens saved", "48%"],
  ["Routing decisions", "1,284"],
  ["Failure rate", "↓ 22%"],
  ["Latency", "p95 tracked"]
] as const;

const repoMemoryItems = [
  "Architectural decisions",
  "Prior PR feedback",
  "Service conventions",
  "Test patterns",
  "Known anti-patterns",
  "Reviewer preferences"
];

const storyboard = [
  {
    time: "0–3s",
    overlay: "Coding agents waste tokens fast.",
    body: "Prompt bubbles, repeated file reads, bloated context, and expensive model calls stack up around a PR."
  },
  {
    time: "3–6s",
    overlay: "Runs locally. Keeps sensitive data inside.",
    body: "Agent Sidecar appears inside the customer infrastructure boundary beside source code, system prompts, API keys, and full prompts."
  },
  {
    time: "6–9s",
    overlay: "Only sanitized telemetry crosses the boundary.",
    body: "A thin telemetry slice carries token counts, model usage, latency, routing metadata, cost signals, and optional truncated traces to the dashboard."
  },
  {
    time: "9–12s",
    overlay: "Compress context. Reuse memory. Route smarter.",
    body: "Sidecar compresses prompts locally, skips repeated context, reuses repo memory, and routes simple steps to cheaper models."
  },
  {
    time: "12–15s",
    overlay: "Lower spend. Same engineering output.",
    body: "The dashboard shows tokens saved, lower cost, routing decisions, and stable output quality before ending on the logo."
  }
];

const workflow = [
  "Install Agent Sidecar next to the coding agent inside your infrastructure",
  "Start in observe-only mode to establish a sanitized cost and behavior baseline",
  "Review spend by repo, PR, model, tool, workflow, and agent in the dashboard",
  "Enable local steering for context compression, repo memory, prompt rewriting, and model routing",
  "Track optimized cost, tokens saved, latency, failures, and output quality over time"
];

export default function HomePage() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#07070b] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_18%_8%,rgba(124,92,255,0.18),transparent_34%),radial-gradient(circle_at_82%_12%,rgba(34,211,238,0.12),transparent_30%),linear-gradient(180deg,#07070b_0%,#0a0a12_46%,#07070b_100%)]" />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:48px_48px] opacity-45" />
      <Navbar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <Hero />
      <Problem />
      <LocalFirstArchitecture />
      <Boundary />
      <Capabilities />
      <DashboardAndMemory />
      <DemoSection />
      <HowToUse />
      <FinalCta />
    </main>
  );
}

function Navbar({
  mobileOpen,
  setMobileOpen
}: {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07070b]/78 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-7 lg:px-10">
        <a href="#" className="flex items-center gap-3">
          <LogoMark />
          <span className="text-sm font-semibold tracking-wide">Agent Sidecar</span>
        </a>
        <nav className="hidden items-center gap-6 text-sm text-neutral-300 lg:flex">
          {navItems.map(([label, href]) => (
            <a key={label} href={href} className="transition hover:text-white">
              {label}
            </a>
          ))}
        </nav>
        <button
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(!mobileOpen)}
          className="grid size-10 place-items-center rounded-lg border border-white/10 lg:hidden"
        >
          {mobileOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>
      {mobileOpen ? (
        <div className="border-t border-white/10 bg-[#07070b]/95 px-5 py-4 lg:hidden">
          <div className="grid gap-2">
            {navItems.map(([label, href]) => (
              <a
                key={label}
                href={href}
                onClick={() => setMobileOpen(false)}
                className="rounded-lg border border-white/10 px-4 py-3 text-sm text-neutral-200"
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </header>
  );
}

function Hero() {
  return (
    <section className="mx-auto flex max-w-7xl flex-col items-center px-5 pb-16 pt-16 text-center sm:px-7 lg:px-10 lg:pb-20 lg:pt-20">
      <div className="flex w-full max-w-7xl flex-col items-center">
        <Badge>Local-first cost control for coding agents</Badge>
        <h1 className="mt-7 max-w-5xl text-4xl font-semibold leading-[1.02] tracking-normal sm:text-5xl lg:text-6xl">
          Cut coding-agent costs without exposing your codebase.
        </h1>
        <p className="mt-8 max-w-3xl text-lg leading-8 text-neutral-300">
          Agent Sidecar runs locally beside your coding agents, finds wasted tokens, and steers context, memory, prompts, and model routing while sensitive code, prompts, API keys, and system instructions stay inside your infrastructure.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <a href="#adoption" className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#07070b] transition hover:bg-neutral-200">
            Measure your agent spend
          </a>
          <a href="#boundary" className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08]">
            See what crosses the boundary
          </a>
        </div>
        <div className="mt-8 w-full max-w-6xl">
          <ComparisonCard />
        </div>
      </div>
    </section>
  );
}

function Problem() {
  return (
    <Section id="problem" eyebrow="The problem" title="Coding agents burn tokens faster than teams can explain.">
      <div className="mt-10 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <p className="text-lg leading-8 text-neutral-300">
            Teams need to reduce coding-agent spend without handing private source code, prompts, API keys, secrets, and system instructions to another AI proxy. Agent Sidecar is built as a local-first sidecar, so cost control starts where the sensitive context already lives.
          </p>
        </div>
        <div className="grid gap-3">
          {wasteDrivers.map((item, index) => (
            <div key={item} className="grid grid-cols-[42px_1fr] items-center gap-3 rounded-xl border border-white/10 bg-[#050509] p-4">
              <span className="grid size-8 place-items-center rounded-lg bg-white/[0.04] font-mono text-xs text-neutral-400">
                {index + 1}
              </span>
              <span className="text-sm text-neutral-200">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function LocalFirstArchitecture() {
  return (
    <Section id="architecture" eyebrow="Local-first architecture" title="Your code stays local. Your cost signals become actionable.">
      <div className="mt-10 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.035] p-4 shadow-2xl shadow-[#7c5cff]/10">
        <div className="grid gap-4 lg:grid-cols-[1.05fr_220px_0.95fr]">
          <ArchitecturePanel title="Customer infrastructure" tone="emerald">
            <div className="grid gap-3">
              {[
                "Coding agent",
                "Agent Sidecar daemon",
                "Source code + diffs",
                "API keys + secrets",
                "System prompts + full user prompts",
                "Local repo memory"
              ].map((item) => (
                <div key={item} className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.045] px-4 py-3 text-sm text-emerald-50/85">
                  {item}
                </div>
              ))}
            </div>
          </ArchitecturePanel>

          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-[#22d3ee]/20 bg-[#22d3ee]/[0.035] p-4 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#22d3ee]">sanitized telemetry slice</p>
            <div className="h-px w-full bg-gradient-to-r from-transparent via-[#22d3ee] to-transparent lg:h-full lg:w-px lg:bg-gradient-to-b" />
            <p className="text-sm leading-6 text-neutral-300">
              Token counts, cost signals, routing metadata, run status, and optional truncated tool traces.
            </p>
          </div>

          <ArchitecturePanel title="Agent Sidecar dashboard" tone="cyan">
            <div className="grid gap-3">
              {[
                "Spend by repo, PR, model, tool, agent, and workflow",
                "Baseline vs optimized cost",
                "Tokens saved and routing decisions",
                "Latency and failure-rate trends",
                "Evidence-labeled sanitized traces"
              ].map((item) => (
                <div key={item} className="rounded-xl border border-white/10 bg-[#050509] px-4 py-3 text-sm text-neutral-300">
                  {item}
                </div>
              ))}
            </div>
          </ArchitecturePanel>
        </div>
      </div>
    </Section>
  );
}

function Boundary() {
  return (
    <Section id="boundary" eyebrow="Boundary model" title="Only the optimization trace crosses the boundary.">
      <p className="mt-6 max-w-4xl text-xl leading-9 text-neutral-300">
        Agent Sidecar does not need to become another cloud proxy for your source code. It runs beside your coding agent, optimizes locally, and sends only sanitized telemetry to the dashboard.
      </p>
      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <BoundaryList title="What crosses the boundary" items={crossesBoundary} tone="cyan" />
        <BoundaryList title="What never crosses by default" items={staysLocal} tone="red" />
      </div>
    </Section>
  );
}

function Capabilities() {
  return (
    <section
      id="capabilities"
      className="mx-auto max-w-7xl px-5 py-16 sm:px-7 lg:px-10"
    >
      <Badge>Cost-control workflow</Badge>
      <h2 className="mt-8 max-w-5xl text-4xl font-semibold leading-tight tracking-normal sm:text-5xl lg:text-6xl">
        Observe first. Optimize later. Prove the savings.
      </h2>
      <p className="mt-6 max-w-4xl text-xl leading-9 text-neutral-300">
        Start in telemetry-only mode. When the baseline is trusted, enable local steering for context compression, repo memory, prompt rewriting, repeated-work avoidance, and smarter model routing.
      </p>
      <div className="mt-12 divide-y divide-white/10 border-y border-white/10">
        {capabilities.map((capability, index) => {
          const Icon = capability.icon;
          return (
            <article
              key={capability.title}
              className="grid gap-5 py-8 md:grid-cols-[120px_1fr_0.75fr] md:items-start"
            >
              <div className="flex items-center gap-4 font-mono text-sm text-neutral-500">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <Icon size={22} className="text-[#22d3ee]" />
              </div>
              <div>
                <h3 className="text-2xl font-semibold">{capability.title}</h3>
                <p className="mt-4 max-w-2xl text-base leading-8 text-neutral-400">{capability.body}</p>
              </div>
              <p className="font-mono text-sm leading-7 text-[#22d3ee]">{capability.detail}</p>
            </article>
          );
        })}
      </div>
      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        {modes.map((mode) => (
          <article key={mode.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <span className="rounded-full border border-[#22d3ee]/25 bg-[#22d3ee]/[0.08] px-3 py-1 font-mono text-xs text-[#22d3ee]">
              {mode.badge}
            </span>
            <h3 className="mt-5 text-2xl font-semibold">{mode.title}</h3>
            <p className="mt-4 text-base leading-8 text-neutral-300">{mode.body}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {mode.items.map((item) => (
                <span key={item} className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-neutral-300">
                  {item}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function DashboardAndMemory() {
  return (
    <Section id="dashboard" eyebrow="Cost intelligence" title="Find the repos, PRs, tools, agents, and models driving spend.">
      <div className="mt-10 grid gap-6 lg:grid-cols-[1.18fr_0.82fr]">
        <DashboardMock />
        <div className="grid gap-6">
          <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#22d3ee]">Repo-aware memory</p>
            <h3 className="mt-4 text-2xl font-semibold">Stop rediscovering the same codebase context every run.</h3>
            <p className="mt-4 text-base leading-8 text-neutral-300">
              Repo memory stays local-first and keeps reusable engineering knowledge close to the agent, so context selection improves without shipping raw code or private prompts to the dashboard.
            </p>
            <div className="mt-5 grid gap-2">
              {repoMemoryItems.map((item) => (
                <div key={item} className="rounded-xl border border-white/10 bg-[#050509] px-4 py-3 text-sm text-neutral-300">
                  {item}
                </div>
              ))}
            </div>
          </article>
          <article className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.055] p-6">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-emerald-200">Cost savings loop</p>
            <p className="mt-4 text-lg leading-8 text-emerald-50/85">
              Better context selection and repo memory reduce repeated reasoning, unnecessary file reads, bloated prompts, and overuse of expensive models while helping agents produce cleaner PRs.
            </p>
          </article>
        </div>
      </div>
    </Section>
  );
}

function DashboardMock() {
  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.035] p-3 shadow-2xl shadow-[#7c5cff]/10">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#050509]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-red-400/80" />
            <span className="size-2 rounded-full bg-amber-300/80" />
            <span className="size-2 rounded-full bg-emerald-300/80" />
          </div>
          <span className="font-mono text-xs text-neutral-500">Sanitized cost dashboard</span>
        </div>
        <div className="grid min-h-[520px] bg-[radial-gradient(circle_at_78%_18%,rgba(34,211,238,0.12),transparent_30%),#07070b] md:grid-cols-[190px_1fr]">
          <aside className="border-b border-white/10 p-4 md:border-b-0 md:border-r">
            <div className="flex items-center gap-3">
              <LogoMark />
              <div>
                <p className="text-sm font-semibold">Agent Sidecar</p>
                <p className="font-mono text-[11px] text-neutral-500">Acme workspace</p>
              </div>
            </div>
            <div className="mt-7 grid gap-2">
              {["Spend", "Routing", "Repos", "PRs", "Traces"].map((item, index) => (
                <div
                  key={item}
                  className={`rounded-xl px-3 py-2 text-sm ${
                    index === 0 ? "border border-[#22d3ee]/25 bg-[#22d3ee]/[0.08] text-white" : "text-neutral-500"
                  }`}
                >
                  {item}
                </div>
              ))}
            </div>
          </aside>

          <div className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#22d3ee]">Live cost intelligence</p>
                <h3 className="mt-2 text-2xl font-semibold">PR #428 cost-control trace</h3>
              </div>
              <span className="w-fit rounded-full border border-emerald-300/25 bg-emerald-300/[0.08] px-3 py-1 font-mono text-xs text-emerald-200">
                sanitized telemetry only
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {dashboardMetrics.map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-500">{label}</p>
                  <p className="mt-2 text-2xl font-semibold">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="mb-2 flex items-center justify-between px-2 font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-500">
                  <span>spend driver</span>
                  <span>signal</span>
                </div>
                <div className="grid gap-2">
                  {[
                    ["repo: web-platform", "41% of spend"],
                    ["model: frontier-reasoning", "reserved for complex steps"],
                    ["tool: read_file", "repeat reads reduced"],
                    ["agent: codex", "optimized context"]
                  ].map(([name, signal]) => (
                    <div key={name} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-white/10 bg-[#090910] px-3 py-3">
                      <p className="text-sm font-medium">{name}</p>
                      <span className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[11px] text-neutral-300">
                        {signal}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-[#22d3ee]/20 bg-[#22d3ee]/[0.045] p-4">
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#22d3ee]">Selected routing decision</p>
                <h4 className="mt-3 text-lg font-semibold">auth-refresh-fix</h4>
                <div className="mt-4 grid gap-2 text-sm text-neutral-300">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">simple file lookup → cheaper model</div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">complex auth reasoning → stronger model</div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">truncated tool trace → dashboard</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DemoSection() {
  return (
    <Section id="demo" eyebrow="15-second demo" title="See what crosses the boundary.">
      <p className="mt-6 max-w-4xl text-xl leading-9 text-neutral-300">
        Agent Sidecar runs locally beside your coding agent. Sensitive prompts, code, API keys, and system instructions stay inside your infrastructure. The dashboard receives only sanitized telemetry, cost signals, routing metadata, and optional truncated traces.
      </p>
      <div className="mt-10 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.035] p-3 shadow-2xl shadow-[#7c5cff]/10">
        <div className="demo-video-frame overflow-hidden rounded-2xl border border-white/10 bg-[#050509]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-red-400/80" />
              <span className="size-2 rounded-full bg-amber-300/80" />
              <span className="size-2 rounded-full bg-emerald-300/80" />
            </div>
            <span className="font-mono text-xs text-neutral-500">15-second cost-control flow</span>
          </div>
          <div className="grid gap-4 p-5 lg:grid-cols-[1fr_0.82fr]">
            <div className="relative min-h-[430px] overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_20%_10%,rgba(124,92,255,0.2),transparent_32%),radial-gradient(circle_at_84%_78%,rgba(34,211,238,0.13),transparent_30%),#07070b] p-5">
              <div className="absolute inset-x-6 top-6 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.04] p-4">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-emerald-200">customer infrastructure boundary</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {["coding agent", "Agent Sidecar", "source code", "API keys", "system prompts", "full prompts"].map((item) => (
                    <span key={item} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-neutral-200">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
              <div className="absolute bottom-6 left-6 right-6 rounded-2xl border border-[#22d3ee]/25 bg-[#22d3ee]/[0.055] p-4">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#22d3ee]">dashboard receives</p>
                <p className="mt-3 text-sm leading-7 text-neutral-200">
                  token counts · model usage · latency · routing metadata · cost signals · optional truncated traces
                </p>
              </div>
              <div className="absolute left-1/2 top-1/2 hidden w-[42%] -translate-x-1/2 -translate-y-1/2 items-center justify-center lg:flex">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#22d3ee] to-transparent" />
                <span className="mx-3 rounded-full border border-[#22d3ee]/30 bg-[#050509] px-3 py-1 font-mono text-[11px] text-[#22d3ee]">
                  sanitized slice
                </span>
                <div className="h-px flex-1 bg-gradient-to-r from-[#22d3ee] to-transparent" />
              </div>
            </div>
            <div className="grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border border-[#22d3ee]/25 bg-[#22d3ee]/[0.08] text-[#22d3ee]">
                    <Volume2 size={15} />
                  </span>
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#22d3ee]">Caption</p>
                    <p className="mt-1 text-sm leading-6 text-neutral-200">Watch the 15-second cost-control flow.</p>
                  </div>
                </div>
              </div>
              {storyboard.map((scene) => (
                <article key={scene.time} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-mono text-xs uppercase tracking-[0.16em] text-neutral-500">{scene.time}</p>
                    <span className="rounded-full border border-[#22d3ee]/25 bg-[#22d3ee]/[0.08] px-3 py-1 font-mono text-[11px] text-[#22d3ee]">
                      overlay
                    </span>
                  </div>
                  <h3 className="mt-3 text-base font-semibold">{scene.overlay}</h3>
                  <p className="mt-2 text-sm leading-6 text-neutral-400">{scene.body}</p>
                </article>
              ))}
            </div>
          </div>
          <div className="border-t border-white/10 p-4">
            <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/30 p-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <button type="button" aria-label="Play demo storyboard" className="grid size-10 place-items-center rounded-full bg-white text-[#07070b] transition hover:bg-neutral-200">
                  <Play size={17} fill="currentColor" />
                </button>
                <button type="button" aria-label="Pause demo storyboard" className="grid size-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-neutral-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white">
                  <Pause size={17} />
                </button>
                <button type="button" aria-label="Restart demo storyboard" className="grid size-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-neutral-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white">
                  <RotateCcw size={17} />
                </button>
              </div>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="demo-video-progress h-full rounded-full bg-[#22d3ee]" />
              </div>
              <span className="font-mono text-xs text-neutral-500">00:15</span>
            </div>
            <p className="mt-4 text-center font-mono text-xs uppercase tracking-[0.18em] text-neutral-500">
              Agent Sidecar — local-first cost control for coding agents.
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}

function HowToUse() {
  return (
    <Section id="adoption" eyebrow="Adoption path" title="Measure first, then turn on local optimization.">
      <div className="mt-10 grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-lg leading-8 text-neutral-300">
            Start in observe-only mode. Measure token waste, repeated work, slow tools, expensive model usage, and failed runs without changing agent behavior. When you are ready, enable local steering: context compression, repo memory, prompt rewriting, and model routing.
          </p>
        </div>
        <div className="grid gap-3">
          {workflow.map((item, index) => (
            <div key={item} className="grid grid-cols-[42px_1fr] items-center gap-3 rounded-xl border border-white/10 bg-[#050509] p-4">
              <span className="grid size-8 place-items-center rounded-lg bg-white/[0.04] font-mono text-xs text-neutral-400">
                {index + 1}
              </span>
              <span className="text-sm text-neutral-200">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function FinalCta() {
  return (
    <section className="mx-auto max-w-7xl px-5 pb-24 pt-16 sm:px-7 lg:px-10">
      <div className="overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.035] p-8 text-center shadow-2xl shadow-[#7c5cff]/10 sm:p-12">
        <Badge>Cut spend without giving another vendor your codebase</Badge>
        <h2 className="mx-auto mt-6 max-w-4xl text-3xl font-semibold leading-tight sm:text-5xl">
          Local-first trust, measurable savings, and cleaner coding-agent runs.
        </h2>
        <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-neutral-300">
          Agent Sidecar keeps sensitive prompts, source code, API keys, and system instructions inside your infrastructure while the dashboard turns sanitized cost signals into decisions your engineering team can act on.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a href="#problem" className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#07070b] transition hover:bg-neutral-200">
            Measure your agent spend
          </a>
          <a href="#demo" className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08]">
            Watch the 15-second flow
          </a>
        </div>
      </div>
    </section>
  );
}

function ArchitecturePanel({ title, tone, children }: { title: string; tone: "emerald" | "cyan"; children: ReactNode }) {
  const classes = tone === "emerald" ? "border-emerald-300/20 bg-emerald-300/[0.035]" : "border-[#22d3ee]/20 bg-[#22d3ee]/[0.035]";
  const text = tone === "emerald" ? "text-emerald-200" : "text-[#22d3ee]";

  return (
    <article className={`rounded-2xl border p-5 ${classes}`}>
      <p className={`font-mono text-xs uppercase tracking-[0.18em] ${text}`}>{title}</p>
      <div className="mt-5">{children}</div>
    </article>
  );
}

function BoundaryList({ title, items, tone }: { title: string; items: string[]; tone: "cyan" | "red" }) {
  const heading = tone === "cyan" ? "text-[#22d3ee]" : "text-red-200";
  const panel = tone === "cyan" ? "border-[#22d3ee]/20 bg-[#22d3ee]/[0.035]" : "border-red-400/20 bg-red-400/[0.035]";

  return (
    <article className={`rounded-2xl border p-6 ${panel}`}>
      <h3 className={`text-2xl font-semibold ${heading}`}>{title}</h3>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item} className="rounded-xl border border-white/10 bg-[#050509]/80 px-4 py-3 text-sm text-neutral-200">
            {item}
          </div>
        ))}
      </div>
    </article>
  );
}

function ComparisonCard() {
  return (
    <div
      role="img"
      aria-label="Hero image comparing a coding-agent run without Agent Sidecar at $2.84 per run against a guarded run with Agent Sidecar at $1.41 per run."
      className="relative mx-auto w-full max-w-6xl overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.035] p-4 text-left text-white shadow-2xl shadow-[#7c5cff]/10 backdrop-blur"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(124,92,255,0.22),transparent_32%),radial-gradient(circle_at_84%_82%,rgba(34,211,238,0.13),transparent_32%)]" />
      <div className="relative flex min-h-[520px] flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[#07070b]/84 p-5 sm:min-h-[430px] lg:min-h-[360px]">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-neutral-500">Agent Sidecar run</p>
            <h3 className="mt-2 text-xl font-semibold leading-tight">Auth refresh fix</h3>
          </div>
          <div className="rounded-full border border-emerald-300/25 bg-emerald-300/[0.08] px-3 py-1 font-mono text-xs text-emerald-200">
            guarded
          </div>
        </div>

        <div className="mt-5 grid flex-1 gap-4 lg:grid-cols-2">
          <RunComparisonPanel
            title="Without Agent Sidecar"
            tone="red"
            cost="$2.84"
            outcome="unchecked final"
            lines={["repeats auth callback edit", "skips browser login flow", "same sign-out bug returns"]}
          />
          <RunComparisonPanel
            title="With Agent Sidecar"
            tone="emerald"
            cost="$1.41"
            outcome="validated fix"
            lines={["adds task contract", "optimized prompt for token usage", "verifies login flow"]}
          />
        </div>
      </div>
    </div>
  );
}

function RunComparisonPanel({
  title,
  tone,
  cost,
  outcome,
  lines
}: {
  title: string;
  tone: "red" | "emerald";
  cost: string;
  outcome: string;
  lines: string[];
}) {
  const isGood = tone === "emerald";
  const accent = isGood ? "text-emerald-200" : "text-red-200";
  const panel = isGood ? "border-emerald-300/20 bg-emerald-300/[0.055]" : "border-red-400/20 bg-red-400/[0.055]";
  const barColor = isGood ? "#4ade80" : "#f87171";
  const barWidth = isGood ? "52%" : "100%";

  return (
    <article
      className={`flex min-h-0 flex-col rounded-xl border p-4 ${panel}`}
    >
      <div className="grid min-h-[92px] grid-cols-[1fr_auto] items-start gap-4 border-b border-white/10 pb-4">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-neutral-500">{title}</p>
        <span className={`rounded-full border px-3 py-1 font-mono text-xs ${isGood ? "border-emerald-300/25 text-emerald-200" : "border-red-400/25 text-red-200"}`}>
          {outcome}
        </span>
        <p className={`self-end text-4xl font-semibold leading-none ${accent}`}>{cost}</p>
        <p className="self-end text-right font-mono text-xs uppercase tracking-[0.16em] text-neutral-500">per run</p>
      </div>
      <div className="mt-4 grid gap-2">
        {lines.map((line) => (
          <div key={line} className="flex min-h-11 items-center rounded-lg border border-white/10 bg-[#07070b]/60 px-3 py-2 text-sm text-neutral-300">
            {line}
          </div>
        ))}
      </div>
      <div className="mt-auto pt-5">
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full"
            style={{ backgroundColor: barColor, width: barWidth }}
          />
        </div>
      </div>
    </article>
  );
}

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-7xl px-5 py-16 sm:px-7 lg:px-10">
      <div className="max-w-3xl">
        <Badge>{eyebrow}</Badge>
        <h2 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">{title}</h2>
      </div>
      {children}
    </section>
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

function LogoMark() {
  return (
    <span className="relative grid size-9 place-items-center rounded-xl border border-white/12 bg-white/[0.04]">
      <Bot size={19} />
      <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[#22d3ee]" />
    </span>
  );
}
