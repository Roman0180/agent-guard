"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bot,
  FileText,
  GitBranch,
  Menu,
  Pause,
  Play,
  Route,
  Scissors,
  ShieldCheck,
  Sparkles,
  X
} from "lucide-react";

const navItems = [
  ["Justification", "#justification"],
  ["Capabilities", "#capabilities"],
  ["Demo", "#demo"],
  ["Boundaries", "#boundaries"],
  ["How to use", "#how-to-use"],
  ["Architecture", "#architecture"]
] as const;

const wasteDrivers = [
  "Bloated prompts accumulate as agents reread files and carry stale context.",
  "Premium models get used for routine lookup, routing, and validation steps.",
  "Teams struggle to connect agent spend to repos, PRs, tools, and outcomes."
];

const capabilities = [
  ["Observe-only telemetry", "Baseline usage without changing agent behavior."],
  ["Local steering", "Optimize runs where private context is already visible."],
  ["Context compression", "Trim prompts before expensive model calls."],
  ["Repo-aware memory", "Reuse architecture, test, and reviewer knowledge."],
  ["Model routing", "Reserve stronger models for harder reasoning."],
  ["Repeated-work detection", "Catch repeated file reads and duplicated reasoning."],
  ["Cost attribution", "Break down spend by repo, PR, model, tool, and agent."]
] as const;

const staysLocal = [
  "Source code",
  "Full prompts",
  "System instructions",
  "API keys",
  "Secrets",
  "Raw PII",
  "Unsanitized tool outputs"
];

const crossesBoundary = [
  "Token counts",
  "Model usage",
  "Latency",
  "Cost signals",
  "Routing metadata",
  "Run status",
  "Optional sanitized or truncated tool traces"
];

const workflow = [
  "Install Sidecar locally beside the coding agent.",
  "Run in observe-only mode to establish a usage baseline.",
  "Review cost and usage signals in the dashboard.",
  "Enable local steering when the team is ready."
];

const dashboardMetrics = [
  ["Tokens saved", "48%"],
  ["Spend", "$2.84 → $1.41"],
  ["Top driver", "read_file repeats"],
  ["Routing", "simple steps cheaper"]
] as const;

const architectureNodes = ["Local Policy + Sanitization", "Context Compression", "Repo Memory", "Model Routing"];

const demoScenes = [
  {
    start: 0,
    end: 5,
    overlay: "Coding agents burn tokens while they work.",
    title: "Codex-style coding session",
    body: "A coding agent works through an auth-refresh PR by reading files, inspecting diffs, and planning changes.",
    visual: "coding"
  },
  {
    start: 5,
    end: 9,
    overlay: "Bloated prompts. Repeated context. Hidden spend.",
    title: "Coding-specific waste",
    body: "The session starts rereading the same files and sending a premium model too much context for a simple edit.",
    visual: "waste"
  },
  {
    start: 9,
    end: 14,
    overlay: "Prompt Refiner cuts the waste before the next call.",
    title: "Prompt Refiner",
    body: "Agent Sidecar turns a sprawling request into a focused coding task with fewer tokens and clearer acceptance criteria.",
    visual: "refiner"
  },
  {
    start: 14,
    end: 19,
    overlay: "Refine prompts. Reuse memory. Route smarter.",
    title: "Steering applied to coding",
    body: "The refined prompt drives the next coding step, repo memory avoids repeated reads, and simple edits route cheaper.",
    visual: "steering"
  },
  {
    start: 19,
    end: 25,
    overlay: "Lower spend. Same engineering output.",
    title: "Dashboard and coding outcome",
    body: "The coding run stabilizes while the dashboard shows token savings, lower spend, Prompt Refiner impact, and routing decisions.",
    visual: "outcome"
  }
] as const;

export default function HomePage() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#07070b] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_18%_8%,rgba(124,92,255,0.18),transparent_34%),radial-gradient(circle_at_82%_12%,rgba(34,211,238,0.12),transparent_30%),linear-gradient(180deg,#07070b_0%,#0a0a12_46%,#07070b_100%)]" />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:48px_48px] opacity-45" />
      <Navbar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <Hero />
      <Justification />
      <Capabilities />
      <DemoSection />
      <Boundaries />
      <HowToUse />
      <Architecture />
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
        <h1 className="max-w-5xl text-4xl font-semibold leading-[1.02] tracking-normal sm:text-5xl lg:text-6xl">
          Cut coding-agent costs without exposing your codebase.
        </h1>
        <p className="mt-8 max-w-3xl text-lg leading-8 text-neutral-300">
          Agent Sidecar runs beside your coding agents, finds wasted tokens, and steers context, memory, prompts, and model routing while sensitive code, prompts, API keys, and system instructions stay inside your infrastructure.
        </p>
        <div className="mt-8 w-full max-w-6xl">
          <ComparisonCard />
        </div>
      </div>
    </section>
  );
}

function Justification() {
  return (
    <Section id="justification" title="Coding-agent adoption needs cost controls.">
      <div className="mt-10 grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-stretch">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <p className="text-lg leading-8 text-neutral-300">
            AI coding tools are moving from experiments to daily engineering workflows. As usage spreads across teams, unmanaged runs can quietly turn repeated reads, stale context, skipped validation, and expensive model choices into real infrastructure spend.
          </p>
          <div className="mt-6 grid gap-3">
            {wasteDrivers.map((item, index) => (
              <div key={item} className="grid grid-cols-[36px_1fr] items-start gap-3 rounded-xl border border-white/10 bg-[#050509] p-4">
                <span className="grid size-7 place-items-center rounded-lg bg-white/[0.04] font-mono text-xs text-neutral-400">
                  {index + 1}
                </span>
                <span className="text-sm leading-6 text-neutral-200">{item}</span>
              </div>
            ))}
          </div>
        </div>
        <article className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 text-[#07070b] shadow-2xl shadow-black/30">
          <div className="flex items-start justify-between gap-4 border-b border-neutral-200 pb-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-neutral-500">Market signal</p>
              <h3 className="mt-3 text-2xl font-semibold leading-tight">Enterprise AI coding-tool budget pressure is becoming a board-level question.</h3>
            </div>
            <span className="rounded-full border border-neutral-200 bg-white px-3 py-1 font-mono text-xs text-neutral-500">News clipping</span>
          </div>
          <p className="mt-5 text-base leading-8 text-neutral-700">
            Existing planning notes for the site reference Fortune coverage of enterprise AI coding-tool budget pressure. The point for Agent Sidecar is simple: teams need measurable governance and cost optimization without routing private code through another AI proxy.
          </p>
          <div className="mt-5 rounded-xl border border-neutral-200 bg-white p-4">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-neutral-500">Why it matters</p>
            <p className="mt-2 text-sm leading-6 text-neutral-700">
              Cost controls only work if teams can trust the boundary: sensitive context stays local while sanitized spend and routing signals become measurable.
            </p>
          </div>
        </article>
      </div>
    </Section>
  );
}

function Capabilities() {
  return (
    <Section id="capabilities" title="The cost-control loop is simple.">
      <p className="mt-6 max-w-4xl text-xl leading-9 text-neutral-300">
        Start by observing spend and behavior. Then enable local steering for the runs, repos, and workflows where savings are clear.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {capabilities.map(([title, body]) => (
          <article key={title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="mt-3 text-sm leading-6 text-neutral-400">{body}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}

function DemoSection() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [demoTime, setDemoTime] = useState(0);
  const duration = 25;

  useEffect(() => {
    if (!isPlaying) return undefined;

    const interval = window.setInterval(() => {
      setDemoTime((current) => {
        const next = current + 0.1;
        if (next >= duration) {
          setIsPlaying(false);
          return duration;
        }
        return next;
      });
    }, 100);

    return () => window.clearInterval(interval);
  }, [isPlaying]);

  const activeScene = demoScenes.find((scene) => demoTime >= scene.start && demoTime < scene.end) ?? demoScenes[demoScenes.length - 1]!;
  const togglePlayback = () => {
    if (demoTime >= duration) {
      setDemoTime(0);
      setIsPlaying(true);
      return;
    }

    setIsPlaying((playing) => !playing);
  };

  return (
    <Section id="demo" title="See the 25-second coding-agent cost-control flow.">
      <p className="mt-6 max-w-4xl text-xl leading-9 text-neutral-300">
        The demo starts paused. Press play to watch a Codex-style coding session, Prompt Refiner, local steering, and the cost dashboard outcome.
      </p>
      <div className="mt-10 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.035] p-3 shadow-2xl shadow-[#7c5cff]/10">
        <div className="demo-video-frame overflow-hidden rounded-2xl border border-white/10 bg-[#050509]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-red-400/80" />
              <span className="size-2 rounded-full bg-amber-300/80" />
              <span className="size-2 rounded-full bg-emerald-300/80" />
            </div>
            <span className="font-mono text-xs text-neutral-500">00:{String(Math.floor(demoTime)).padStart(2, "0")} / 00:25</span>
          </div>

          <div className="grid gap-6 p-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <DemoVisual scene={activeScene.visual} />
            <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#22d3ee]">Overlay</p>
              <h3 className="mt-4 text-3xl font-semibold leading-tight">{activeScene.overlay}</h3>
              <p className="mt-4 text-base leading-7 text-neutral-300">{activeScene.body}</p>
              <button
                type="button"
                aria-label={isPlaying ? "Pause demo animation" : "Play demo animation"}
                onClick={togglePlayback}
                className="mt-8 inline-flex items-center gap-3 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#07070b] transition hover:bg-neutral-200"
              >
                {isPlaying ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}
                {isPlaying ? "Pause demo" : demoTime >= duration ? "Replay demo" : "Play demo"}
              </button>
            </div>
          </div>
          <div className="h-1 bg-white/10">
            <div className="h-full bg-[#22d3ee] transition-[width] duration-100" style={{ width: `${(demoTime / duration) * 100}%` }} />
          </div>
        </div>
      </div>
    </Section>
  );
}

function Boundaries() {
  return (
    <Section id="boundaries" title="Clear boundaries by default.">
      <p className="mt-6 max-w-4xl text-xl leading-9 text-neutral-300">
        Agent Sidecar observes and optimizes locally. The dashboard receives sanitized cost and routing signals, not raw engineering context.
      </p>
      <BoundaryModelGlance />
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <BoundaryList title="What stays local by default" items={staysLocal} tone="emerald" />
        <BoundaryList title="What can cross the boundary" items={crossesBoundary} tone="cyan" />
      </div>
    </Section>
  );
}


function BoundaryModelGlance() {
  const blockedItems = ["source code", "full prompts", "API keys", "raw PII"];
  const telemetryItems = ["token counts", "latency", "cost signals", "routing metadata"];

  return (
    <div className="mt-10 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.035] p-4 shadow-2xl shadow-[#7c5cff]/10">
      <div className="grid gap-4 lg:grid-cols-[1fr_180px_0.78fr] lg:items-stretch">
        <div className="rounded-2xl border border-emerald-300/25 bg-emerald-300/[0.045] p-5">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-emerald-200">Boundary model at a glance</p>
          <h3 className="mt-3 text-2xl font-semibold">Customer infrastructure</h3>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {["Coding agent", "Local Agent Sidecar", "Prompt Refiner", "Repo memory"].map((item) => (
              <div key={item} className="rounded-xl border border-emerald-300/20 bg-black/20 px-4 py-3 text-sm text-emerald-50/90">
                {item}
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-400/[0.06] p-4">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-red-200">Does not cross</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {blockedItems.map((item) => (
                <span key={item} className="rounded-full border border-red-300/25 bg-black/20 px-3 py-1.5 text-xs text-red-100">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center gap-4 rounded-2xl border border-[#22d3ee]/20 bg-[#22d3ee]/[0.035] p-4 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#22d3ee]">sanitized stream</p>
          <div className="hidden h-px bg-gradient-to-r from-[#22d3ee] to-transparent lg:block" />
          <div className="grid gap-2">
            {telemetryItems.map((item) => (
              <span key={item} className="rounded-full border border-[#22d3ee]/20 bg-black/20 px-3 py-1.5 text-[11px] text-neutral-200">
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[#22d3ee]/20 bg-[#22d3ee]/[0.04] p-5">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#22d3ee]">Agent Sidecar dashboard</p>
          <h3 className="mt-3 text-2xl font-semibold">Cost control plane</h3>
          <p className="mt-4 text-sm leading-6 text-neutral-300">
            Receives sanitized telemetry and returns cost views, policies, and routing recommendations without processing raw code or full prompts.
          </p>
        </div>
      </div>
    </div>
  );
}

function HowToUse() {
  return (
    <Section id="how-to-use" title="Adoption is low-risk: observe first, steer later.">
      <div className="mt-10 grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-lg leading-8 text-neutral-300">
            Install Sidecar beside the agent and begin in observe-only mode. The dashboard helps teams review cost and usage signals before enabling local steering for context compression, repo memory, prompt rewriting, and model routing.
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

function Architecture() {
  return (
    <Section id="architecture" title="Sensitive context stays local. Sanitized cost and routing signals power the dashboard.">
      <div className="mt-10 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.035] p-4 shadow-2xl shadow-[#7c5cff]/10">
        <div className="grid gap-4 lg:grid-cols-[1fr_240px_0.92fr]">
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.035] p-5">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-emerald-200">Customer infrastructure boundary</p>
            <div className="mt-5 grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <ArchitectureNode icon={<Bot size={18} />} title="Coding Agent" body="Runs against the repo and tools." />
                <ArchitectureNode icon={<ShieldCheck size={18} />} title="Local Agent Sidecar" body="Observes and steers the run locally." />
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-neutral-500">Local optimization logic</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {architectureNodes.map((item) => (
                    <div key={item} className="rounded-xl border border-white/10 bg-[#050509] px-3 py-2 text-sm text-neutral-200">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-sm leading-6 text-emerald-50/75">
                Source code, full prompts, system instructions, API keys, secrets, raw PII, and unsanitized tool outputs remain inside this boundary by default.
              </p>
            </div>
          </div>

          <div className="grid gap-4">
            <FlowPill label="Configured model calls" direction="out" />
            <FlowPill label="Sanitized telemetry" direction="out" />
            <FlowPill label="Policies + cost views" direction="in" />
          </div>

          <div className="grid gap-4">
            <div className="rounded-2xl border border-white/10 bg-[#050509] p-5">
              <div className="flex items-center gap-3">
                <Route size={18} className="text-[#22d3ee]" />
                <h3 className="text-xl font-semibold">LLM Provider</h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-neutral-400">
                Model calls use the customer-configured provider path. Agent Sidecar cloud does not receive provider API keys.
              </p>
            </div>
            <div className="rounded-2xl border border-[#22d3ee]/20 bg-[#22d3ee]/[0.035] p-5">
              <div className="flex items-center gap-3">
                <Sparkles size={18} className="text-[#22d3ee]" />
                <h3 className="text-xl font-semibold">Agent Sidecar Dashboard</h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-neutral-300">
                Receives sanitized telemetry, cost signals, routing metadata, run status, and optional truncated traces. Returns policies, cost views, and routing recommendations.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

function DemoVisual({ scene }: { scene: (typeof demoScenes)[number]["visual"] }) {
  return (
    <div className="relative min-h-[430px] overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_20%_10%,rgba(124,92,255,0.2),transparent_32%),radial-gradient(circle_at_84%_78%,rgba(34,211,238,0.13),transparent_30%),#07070b] p-6">
      {scene === "coding" ? <CodingSessionVisual /> : null}
      {scene === "waste" ? <WasteVisual /> : null}
      {scene === "refiner" ? <PromptRefinerVisual /> : null}
      {scene === "steering" ? <SteeringVisual /> : null}
      {scene === "outcome" ? <OutcomeVisual /> : null}
    </div>
  );
}

function CodingSessionVisual() {
  const codeLines = [
    "export async function refreshSession(user) {",
    "  const token = await refreshToken(user.session)",
    "  saveSession(user.id, token)",
    "  return redirectAfterLogin(user)",
    "}"
  ];

  return (
    <div className="grid h-full min-h-[380px] gap-4 lg:grid-cols-[1fr_0.82fr]">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#050509]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#22d3ee]">Codex coding session</p>
          <span className="rounded-full border border-emerald-300/25 bg-emerald-300/[0.08] px-3 py-1 font-mono text-[11px] text-emerald-200">PR #428</span>
        </div>
        <div className="grid gap-2 p-4 font-mono text-xs leading-6">
          {codeLines.map((line, index) => (
            <p key={line} className="grid grid-cols-[32px_1fr] gap-3 rounded-lg bg-white/[0.025] px-3 py-1.5 text-neutral-300">
              <span className="text-neutral-600">{index + 18}</span>
              <span>{line}</span>
            </p>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-neutral-500">Agent activity</p>
        <div className="mt-4 grid gap-3 text-sm text-neutral-200">
          <div className="rounded-xl border border-white/10 bg-[#050509] p-3">read src/auth/session.ts</div>
          <div className="rounded-xl border border-white/10 bg-[#050509] p-3">inspect tests/auth-refresh.test.ts</div>
          <div className="rounded-xl border border-white/10 bg-[#050509] p-3">plan narrow token persistence fix</div>
        </div>
      </div>
    </div>
  );
}

function WasteVisual() {
  return (
    <div className="grid h-full min-h-[380px] place-items-center">
      <div className="w-full max-w-2xl rounded-2xl border border-red-400/20 bg-red-400/[0.055] p-5">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-red-200">Cost drivers inside the coding run</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {["re-reads src/auth/session.ts", "repeats prior auth reasoning", "carries full repo summary", "premium model for simple edit"].map((item) => (
            <div key={item} className="rounded-xl border border-red-300/15 bg-black/25 px-4 py-3 text-sm text-neutral-200">
              {item}
            </div>
          ))}
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-[84%] rounded-full bg-red-300" />
        </div>
        <p className="mt-3 font-mono text-xs text-red-100/80">token load rising before the next model call</p>
      </div>
    </div>
  );
}

function PromptRefinerVisual() {
  const refinedPrompt = [
    "Task: persist refreshed session before redirect",
    "Scope: src/auth/session.ts only",
    "Use repo memory: auth callback convention",
    "Validate: targeted auth-refresh test"
  ];

  return (
    <div className="grid h-full min-h-[380px] gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
      <div className="rounded-2xl border border-red-400/20 bg-red-400/[0.045] p-4">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-red-200">Bloated prompt</p>
        <p className="mt-4 text-sm leading-7 text-neutral-300">
          Fix the auth bug. Include the whole repo summary, previous attempts, all auth files, test logs, routing notes, and anything else that might help before editing...
        </p>
        <p className="mt-4 font-mono text-xs text-red-100/80">3,840 prompt tokens</p>
      </div>
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid size-12 place-items-center rounded-2xl border border-[#22d3ee]/25 bg-[#22d3ee]/[0.08] text-[#22d3ee]">
          <Scissors size={20} />
        </span>
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#22d3ee]">Prompt Refiner</p>
      </div>
      <div className="rounded-2xl border border-emerald-300/25 bg-emerald-300/[0.055] p-4">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-emerald-200">Refined coding task</p>
        <div className="mt-4 grid gap-2">
          {refinedPrompt.map((item) => (
            <div key={item} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-neutral-200">
              {item}
            </div>
          ))}
        </div>
        <p className="mt-4 font-mono text-xs text-emerald-100/80">1,260 prompt tokens</p>
      </div>
    </div>
  );
}

function SteeringVisual() {
  return (
    <div className="grid h-full min-h-[380px] place-items-center">
      <div className="w-full max-w-2xl rounded-2xl border border-[#22d3ee]/25 bg-[#22d3ee]/[0.045] p-5">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#22d3ee]">Steering the next coding step</p>
        <div className="mt-5 grid gap-3">
          {([
            [Scissors, "send refined prompt into the next edit"],
            [FileText, "reuse auth callback repo memory"],
            [GitBranch, "route simple saveSession edit cheaper"]
          ] as Array<[LucideIcon, string]>).map(([Icon, label]) => (
            <div key={label} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-neutral-200">
              <Icon size={16} className="text-[#22d3ee]" />
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OutcomeVisual() {
  return (
    <div className="grid h-full min-h-[380px] gap-4 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="rounded-2xl border border-emerald-300/25 bg-emerald-300/[0.055] p-5">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-emerald-200">Coding outcome</p>
        <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4 font-mono text-xs leading-6 text-neutral-200">
          <p>+ await saveSession(user.id, token)</p>
          <p>+ await validateSessionCookie(user.id)</p>
          <p className="mt-3 text-emerald-200">✓ targeted auth-refresh test passed</p>
        </div>
      </div>
      <div className="rounded-2xl border border-[#22d3ee]/25 bg-[#22d3ee]/[0.045] p-5">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#22d3ee]">Dashboard outcome</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm text-neutral-400">Tokens saved</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-100">48%</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm text-neutral-400">Spend</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-100">$2.84 → $1.41</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm text-neutral-400">Prompt Refiner</p>
            <p className="mt-2 text-xl font-semibold text-emerald-100">-2.6k tokens</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm text-neutral-400">Routing</p>
            <p className="mt-2 text-xl font-semibold text-emerald-100">simple edit cheaper</p>
          </div>
        </div>
      </div>
    </div>
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
          <span className="font-mono text-xs text-neutral-500">Observe-only baseline</span>
        </div>
        <div className="grid min-h-[480px] bg-[radial-gradient(circle_at_78%_18%,rgba(34,211,238,0.12),transparent_30%),#07070b] md:grid-cols-[170px_1fr]">
          <aside className="border-b border-white/10 p-4 md:border-b-0 md:border-r">
            <div className="flex items-center gap-3">
              <LogoMark />
              <div>
                <p className="text-sm font-semibold">Agent Sidecar</p>
                <p className="font-mono text-[11px] text-neutral-500">Acme workspace</p>
              </div>
            </div>
            <div className="mt-7 grid gap-2">
              {["Baseline", "Repos", "Models", "Tools"].map((item, index) => (
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
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#22d3ee]">Cost and usage signals</p>
                <h3 className="mt-2 text-2xl font-semibold">PR #428 observe-only run</h3>
              </div>
              <span className="w-fit rounded-full border border-emerald-300/25 bg-emerald-300/[0.08] px-3 py-1 font-mono text-xs text-emerald-200">
                sanitized telemetry
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {dashboardMetrics.map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-500">{label}</p>
                  <p className="mt-2 text-2xl font-semibold">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-[#22d3ee]/20 bg-[#22d3ee]/[0.045] p-4">
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#22d3ee]">Ready to enable</p>
              <div className="mt-4 grid gap-2 text-sm text-neutral-300">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">context compression for auth PRs</div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">repo memory for test conventions</div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">cheaper model routing for file lookup</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ArchitectureNode({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#050509] p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-[#22d3ee]">{icon}</span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <p className="mt-3 text-sm leading-6 text-neutral-400">{body}</p>
    </div>
  );
}

function FlowPill({ label, direction }: { label: string; direction: "in" | "out" }) {
  return (
    <div className="flex h-full min-h-28 flex-col items-center justify-center rounded-2xl border border-white/10 bg-black/20 p-4 text-center">
      <div className={`h-px w-full ${direction === "out" ? "bg-gradient-to-r" : "bg-gradient-to-l"} from-[#22d3ee] to-transparent`} />
      <p className="mt-3 font-mono text-xs uppercase tracking-[0.14em] text-neutral-400">{label}</p>
    </div>
  );
}

function BoundaryList({ title, items, tone }: { title: string; items: string[]; tone: "cyan" | "emerald" }) {
  const heading = tone === "cyan" ? "text-[#22d3ee]" : "text-emerald-200";
  const panel = tone === "cyan" ? "border-[#22d3ee]/20 bg-[#22d3ee]/[0.035]" : "border-emerald-300/20 bg-emerald-300/[0.035]";

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

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-7xl px-5 py-16 sm:px-7 lg:px-10">
      <div className="max-w-4xl">
        <h2 className="text-3xl font-semibold leading-tight sm:text-5xl">{title}</h2>
      </div>
      {children}
    </section>
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
