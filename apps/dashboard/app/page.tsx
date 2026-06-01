"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import {
  BookOpen,
  Bot,
  Code2,
  Database,
  FileText,
  GitBranch,
  Menu,
  Repeat,
  ShieldCheck,
  Sparkles,
  X
} from "lucide-react";

const docsUrl = "/docs";

const navItems = [
  ["Capabilities", "#capabilities"],
  ["How to use", "#how-to-use"],
  ["Architecture", "#architecture"]
] as const;

const capabilities = [
  {
    icon: FileText,
    title: "Lesson recall",
    body: "Pull a reviewed fix pattern only when the current repo, task shape, and failure signal match the saved lesson",
    detail: "scoped lesson match"
  },
  {
    icon: Database,
    title: "File memory",
    body: "Carry compact summaries, ownership notes, and validation hints forward so unchanged files do not need another read",
    detail: "hash-aware summaries"
  },
  {
    icon: Repeat,
    title: "Loop detection",
    body: "Recognize repeated commands, stale searches, and no-new-evidence retries while the agent can still recover",
    detail: "retry loop / warn"
  },
  {
    icon: ShieldCheck,
    title: "Tool supervision",
    body: "Check shell commands, file edits, fetches, and searches for waste or risk before they stack up",
    detail: "tool risk / policy"
  },
  {
    icon: Sparkles,
    title: "Context compression",
    body: "Keep the task contract, open constraints, and validation evidence while dropping noisy old output",
    detail: "contract / evidence / lessons"
  },
  {
    icon: GitBranch,
    title: "Steering direction",
    body: "Let hard rules decide first, then use a configured small model only for ambiguous next-step guidance",
    detail: "configured steering only"
  }
];

const workflow = [
  "Install the sidecar package with pip",
  "Start the daemon from your terminal",
  "Configure Codex or Claude Code hooks",
  "Run the coding agent normally",
  "Review traces, decisions, monitors, saved patterns, and A/B analytics"
];

export default function HomePage() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#07070b] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_18%_8%,rgba(124,92,255,0.18),transparent_34%),radial-gradient(circle_at_82%_12%,rgba(34,211,238,0.12),transparent_30%),linear-gradient(180deg,#07070b_0%,#0a0a12_46%,#07070b_100%)]" />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:48px_48px] opacity-45" />
      <Navbar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <Hero />
      <Capabilities />
      <HowToUse />
      <ArchitectureSection />
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
        <div className="hidden items-center gap-3 lg:flex">
          <a
            href={docsUrl}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-[#07070b] transition hover:bg-neutral-200"
          >
            Docs
            <BookOpen size={16} />
          </a>
        </div>
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
        <h1 className="max-w-5xl text-4xl font-semibold leading-[1.02] tracking-normal sm:text-5xl lg:text-6xl">
          Make AI coding agents observable, correctable, and cheaper to run
        </h1>
        <div className="mt-8 w-full max-w-6xl">
          <ComparisonCard />
        </div>
        <p className="mt-8 max-w-2xl text-lg leading-8 text-neutral-300">
          Agent Sidecar runs beside Codex and Claude Code, corrects failure modes mid-run, and proves whether the intervention helped
        </p>
      </div>
    </section>
  );
}

function Capabilities() {
  return (
    <section
      id="capabilities"
      className="mx-auto max-w-7xl px-5 py-16 sm:px-7 lg:px-10"
    >
      <Badge>Capabilities</Badge>
      <h2 className="mt-8 max-w-5xl text-4xl font-semibold leading-tight tracking-normal sm:text-5xl lg:text-6xl">
        Six controls, one local runtime
      </h2>
      <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {capabilities.map((capability, index) => {
          const Icon = capability.icon;
          return (
            <article
              key={capability.title}
              className="flex min-h-[300px] flex-col rounded-[24px] border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/10 backdrop-blur"
            >
              <div className="flex items-start justify-between">
                <span className="grid size-11 place-items-center rounded-xl border border-white/10 bg-[#050509] text-[#22d3ee]">
                  <Icon size={20} />
                </span>
                <span className="font-mono text-sm text-neutral-600">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="mt-10 text-2xl font-semibold">{capability.title}</h3>
              <p className="mt-5 text-base leading-8 text-neutral-400">{capability.body}</p>
              <p className="mt-auto rounded-xl border border-white/10 bg-[#050509] px-4 py-3 font-mono text-sm text-[#22d3ee]">
                {capability.detail}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function HowToUse() {
  return (
    <Section id="how-to-use" eyebrow="How to use" title="Run normally, review everything">
      <div className="mt-10 grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-lg leading-8 text-neutral-300">
            The dashboard is the control plane and replay UI. The core product is still the runtime pipeline: observe real agent runs, intervene on common failure modes, and measure whether interventions improve cost per successful task.
          </p>
          <div className="mt-5 grid gap-3">
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
        <DashboardMock />
      </div>
    </Section>
  );
}

function DashboardMock() {
  const nav = ["Traces", "Decisions", "Policies", "Lessons", "Analytics"];
  const runs = [
    ["auth-refresh-fix", "require validation", "healthy"],
    ["billing-webhook", "inject lesson", "watching"],
    ["worker-memory-leak", "block repeat", "review"]
  ];

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.035] p-3 shadow-2xl shadow-[#7c5cff]/10">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#050509]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-red-400/80" />
            <span className="size-2 rounded-full bg-amber-300/80" />
            <span className="size-2 rounded-full bg-emerald-300/80" />
          </div>
          <span className="font-mono text-xs text-neutral-500">Acme account dashboard</span>
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
              {nav.map((item, index) => (
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
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#22d3ee]">Live runs</p>
                <h3 className="mt-2 text-2xl font-semibold">Runtime control plane</h3>
              </div>
              <span className="w-fit rounded-full border border-emerald-300/25 bg-emerald-300/[0.08] px-3 py-1 font-mono text-xs text-emerald-200">
                daemon connected
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                ["guarded runs", "18"],
                ["decisions", "43"],
                ["saved lessons", "9"]
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-500">{label}</p>
                  <p className="mt-2 text-2xl font-semibold">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.065] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-emerald-200">total cost saved</p>
                  <p className="mt-2 text-3xl font-semibold text-emerald-100">$4,820</p>
                </div>
                <p className="max-w-xs text-sm leading-6 text-emerald-50/70">
                  Estimated from guarded runs compared with matched baseline traces
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="mb-2 flex items-center justify-between px-2 font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-500">
                  <span>trace</span>
                  <span>decision</span>
                </div>
                <div className="grid gap-2">
                  {runs.map(([name, decision, status]) => (
                    <div key={name} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-white/10 bg-[#090910] px-3 py-3">
                      <div>
                        <p className="text-sm font-medium">{name}</p>
                        <p className="mt-1 font-mono text-[11px] text-neutral-500">{status}</p>
                      </div>
                      <span className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[11px] text-neutral-300">
                        {decision}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-[#22d3ee]/20 bg-[#22d3ee]/[0.045] p-4">
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#22d3ee]">selected trace</p>
                <h4 className="mt-3 text-lg font-semibold">auth-refresh-fix</h4>
                <div className="mt-4 grid gap-2 text-sm text-neutral-300">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">policy: validation after edit</div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">lesson: refresh token callback</div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">action: require continuation</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ArchitectureSection() {
  return (
    <Section id="architecture" eyebrow="Architecture" title="Local sidecar, runtime decisions">
      <div className="mt-10 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.035] p-3 shadow-2xl shadow-[#7c5cff]/10">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#050509]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-red-400/80" />
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">monitor: validation after edit</div>
              <span className="size-2 rounded-full bg-emerald-300/80" />
            </div>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-neutral-500">runtime pipeline</span>
          </div>
          <SystemDiagram />
        </div>
      </div>
    </Section>
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
            ["Decide", "Apply prompt shaping, hard rules, and steering"],
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

function ComparisonCard() {
  return (
    <div className="relative mx-auto w-full max-w-6xl overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-left text-white shadow-2xl shadow-[#7c5cff]/10 backdrop-blur">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(124,92,255,0.22),transparent_32%),radial-gradient(circle_at_84%_82%,rgba(34,211,238,0.13),transparent_32%)]" />
      <div className="relative flex min-h-[520px] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#07070b]/84 p-5 sm:min-h-[430px] lg:min-h-[360px]">
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
            lines={["adds task contract", "blocks premature final", "verifies login flow"]}
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
                                "monitor: validation after edit",
