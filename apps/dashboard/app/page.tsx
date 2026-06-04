"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
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
  ["Capabilities", "#capabilities"],
  ["Demo", "#demo"],
  ["How to use", "#how-to-use"]
] as const;

const capabilities = [
  {
    icon: Sparkles,
    title: "Prompt compression",
    body: "Compress vague requests into precise task contracts with only the repo context, acceptance criteria, boundaries, and tests the coding agent needs.",
    detail: "Fewer broad instructions means fewer exploratory tokens."
  },
  {
    icon: GitBranch,
    title: "Cheap-model steering",
    body: "Use an ensemble of lower-cost models for narrow steering decisions, such as where to look next, what to validate, and when a run is drifting.",
    detail: "Expensive models spend tokens on implementation, not routine routing."
  },
  {
    icon: FileText,
    title: "Selective memory",
    body: "Apply specialized importance algorithms to decide which lessons, files, diffs, and prior outcomes are worth remembering for the current task.",
    detail: "Queries become more precise because irrelevant history stays out."
  }
];

const workflow = [
  "Install the sidecar package with pip",
  "Start the daemon from your terminal",
  "Run Codex through Agent Sidecar",
  "Sidecar retrieves context, rewrites the task, and submits the optimized prompt",
  "Review original prompts, optimized prompts, token estimates, result quality, decisions, and evidence-labeled analytics"
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
      <DemoSection />
      <HowToUse />
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
          Enterprise telemetry and cost controls for agentic coding tools
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-neutral-300 sm:text-xl sm:leading-9">
          Agent Sidecar gives teams a local-first control layer for Codex, Claude Code, and other coding agents: log every run, surface cost evidence, and cut wasted tokens before they become enterprise budget drift.
        </p>
        <div className="mt-8 w-full max-w-6xl">
          <ComparisonCard />
        </div>
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
        Three simple techniques that make agent queries more precise
      </h2>
      <p className="mt-6 max-w-4xl text-xl leading-9 text-neutral-300">
        Agent Sidecar reduces tokens by making each query more precise before the expensive coding agent starts working. It keeps the process to three focused capabilities.
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

function DemoSection() {
  const demoDuration = 48;
  const [demoPaused, setDemoPaused] = useState(true);
  const [demoRunId, setDemoRunId] = useState(0);
  const [demoTime, setDemoTime] = useState(0);
  const progressRef = useRef<any>(null);
  const files = ["src/auth/session.ts", "src/auth/tokens.ts", "tests/auth-refresh.test.ts", "agent-sidecar.yml"];
  const preEditCodeLines: Array<[string, string, string]> = [
    ["01", "import { cookies } from \"next/headers\"", "text-neutral-500"],
    ["02", "import { redirect } from \"next/navigation\"", "text-neutral-500"],
    ["03", "import { refreshToken, readSession } from \"./tokens\"", "text-neutral-500"],
    ["04", "import { saveSession, clearSession } from \"./store\"", "text-neutral-500"],
    ["05", "import { validateSessionCookie } from \"./validation\"", "text-neutral-500"],
    ["06", "", "text-neutral-700"],
    ["07", "type User = {", "text-neutral-400"],
    ["08", "  id: string", "text-neutral-400"],
    ["09", "  email: string", "text-neutral-400"],
    ["10", "  session: string", "text-neutral-400"],
    ["11", "}", "text-neutral-400"],
    ["12", "", "text-neutral-700"],
    ["13", "export async function loadCurrentUser() {", "text-neutral-300"],
    ["14", "  const session = cookies().get(\"sid\")?.value", "text-neutral-300"],
    ["15", "  if (!session) return null", "text-neutral-300"],
    ["16", "  return readSession(session)", "text-neutral-300"],
    ["17", "}", "text-neutral-300"],
    ["18", "", "text-neutral-700"],
    ["19", "export async function refreshSession(user: User) {", "text-neutral-300"],
    ["20", "  const token = await refreshToken(user.session)", "text-neutral-300"],
    ["21", "  saveSession(user.id, token)", "text-red-200"],
    ["22", "  return redirectAfterLogin(user)", "text-neutral-300"],
    ["23", "}", "text-neutral-300"],
    ["24", "", "text-neutral-700"],
    ["25", "function redirectAfterLogin(user: User) {", "text-neutral-300"],
    ["26", "  return redirect(`/account/${user.id}`)", "text-neutral-300"],
    ["27", "}", "text-neutral-300"],
    ["28", "", "text-neutral-700"],
    ["29", "export async function signOut() {", "text-neutral-400"],
    ["30", "  await clearSession()", "text-neutral-400"],
    ["31", "}", "text-neutral-400"]
  ];
  const codeLines: Array<[string, string, string]> = [
    ["18", "export async function refreshSession(user: User) {", "text-neutral-300"],
    ["19", "  const token = await refreshToken(user.session)", "text-neutral-300"],
    ["20", "- saveSession(user.id, token)", "text-red-200"],
    ["20", "+ await saveSession(user.id, token)", "text-emerald-200"],
    ["21", "+ await validateSessionCookie(user.id)", "text-emerald-200"],
    ["22", "  return redirectAfterLogin(user)", "text-neutral-300"],
    ["23", "}", "text-neutral-300"]
  ];
  const terminalLines = [
    "python -m pip install agent-sidecar",
    "agent-sidecar daemon start",
    "agent-sidecar codex \"Fix the auth refresh bug\""
  ];
  const capabilityEvents: Array<[string, string]> = [
    ["Repo type", "Detect Next.js TypeScript app"],
    ["AGENTS.md", "Load local validation instructions"],
    ["Previous plans", "Reuse prior auth-refresh plan"],
    ["File tree", "Summarize src/auth and tests"],
    ["Active branch", "Record feature/auth-refresh"],
    ["Relevant diffs", "Attach current session.ts edits"]
  ];
  const optimizedPromptLines = [
    "Task: Fix auth refresh so users stay signed in after token renewal",
    "Constraints: Keep the change narrow and follow AGENTS.md",
    "Acceptance: Token renewal persists before redirect",
    "PR boundary: No unrelated auth refactors",
    "Tests: Run targeted auth refresh and login flow checks"
  ];
  const narrationSegments: Array<[number, number, string]> = [
    [0, 8, "First, Agent Sidecar starts beside the coding agent and becomes the task intake layer."],
    [8, 16, "The user enters a plain-language request, and Sidecar prepares to make it more precise."],
    [16, 24, "Prompt compression pulls in only the relevant repo context, constraints, acceptance criteria, and tests."],
    [24, 32, "Cheap steering models help decide what to validate and where expensive agent tokens should go."],
    [32, 40, "Selective memory keeps important lessons and diffs while dropping irrelevant history."],
    [40, 48, "The result is a validated fix with fewer tokens, a clearer trace, and lower cost per run."]
  ];
  const restartDemo = () => {
    setDemoPaused(false);
    setDemoTime(0);
    setDemoRunId((runId) => runId + 1);
  };
  const toggleDemoPlayback = () => {
    if (demoPaused && demoTime >= demoDuration) {
      restartDemo();
      return;
    }

    setDemoPaused((paused) => !paused);
  };
  const seekDemo = (clientX: number) => {
    const rect = progressRef.current?.getBoundingClientRect();
    if (!rect) return;

    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    setDemoTime(ratio * demoDuration);
  };
  const sceneClass = (start: number, end: number) =>
    demoTime >= start && demoTime < end ? "grid opacity-100" : "hidden opacity-0";
  const finalSceneClass = demoTime >= 40 ? "grid opacity-100" : "hidden opacity-0";
  const showAt = (time: number) => demoTime >= time;
  const promptProgress = Math.min(Math.max((demoTime - 8.7) / 3.8, 0), 1);
  const promptText = "Login keeps breaking after token refresh. Can you figure it out and fix whatever is wrong?";
  const typedPrompt = promptText.slice(0, Math.max(1, Math.round(promptText.length * promptProgress)));
  const activeNarration =
    narrationSegments.find(([start, end]) => demoTime >= start && demoTime < end)?.[2] ??
    "The result is a validated fix with fewer tokens, a clearer trace, and lower cost per run.";

  useEffect(() => {
    if (demoPaused) return undefined;

    const interval = setInterval(() => {
      setDemoTime((time) => {
        const nextTime = Math.min(time + 0.1, demoDuration);
        if (nextTime >= demoDuration) {
          clearInterval(interval);
          setTimeout(() => setDemoPaused(true), 0);
        }
        return nextTime;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [demoDuration, demoPaused, demoRunId]);

  return (
    <Section id="demo" eyebrow="Demo" title="Agent Sidecar inside a Codex workspace">
      <div className="mt-10 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.035] p-3 shadow-2xl shadow-[#22d3ee]/10">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#050509]">
          <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-red-400/80" />
              <span className="size-2 rounded-full bg-amber-300/80" />
              <span className="size-2 rounded-full bg-emerald-300/80" />
              <span className="ml-3 font-mono text-xs uppercase tracking-[0.18em] text-neutral-500">agent-sidecar-demo</span>
            </div>
            <span className="w-fit rounded-full border border-[#22d3ee]/25 bg-[#22d3ee]/[0.06] px-3 py-1 font-mono text-xs text-[#22d3ee]">
              Sidecar task intake active
            </span>
          </div>

          <div
            className={`relative bg-[radial-gradient(circle_at_28%_18%,rgba(124,92,255,0.2),transparent_30%),radial-gradient(circle_at_82%_72%,rgba(34,211,238,0.14),transparent_34%),#050509] p-4 sm:p-6 ${
              demoPaused ? "demo-video-paused" : ""
            }`}
          >
            <div
              role="button"
              tabIndex={0}
              aria-label={demoPaused ? "Play demo" : "Pause demo"}
              onClick={toggleDemoPlayback}
              onKeyDown={(event: any) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggleDemoPlayback();
                }
              }}
              className="demo-video-frame relative block min-h-[640px] w-full cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-[#07070b]/88 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[#22d3ee]/70"
            >
              <div className={`${sceneClass(0, 8)} absolute inset-0 place-items-center p-5 transition-opacity duration-300`}>
                <div className="w-full max-w-3xl">
                  <PhaseHeading title="Phase 1 Sidecar setup" body="Install the sidecar, start the daemon, and submit Codex tasks through Agent Sidecar" />
                  <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#050509] shadow-2xl shadow-black/30">
                    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                      <span className="font-mono text-xs uppercase tracking-[0.18em] text-neutral-500">Terminal</span>
                      <span className="rounded-full border border-[#22d3ee]/25 bg-[#22d3ee]/[0.06] px-3 py-1 font-mono text-[11px] text-[#22d3ee]">
                        setup
                      </span>
                    </div>
                    <div className="grid gap-3 p-5 font-mono text-sm text-neutral-200">
                    {terminalLines.map((line, index) => (
                      <p
                        key={line}
                        className={`truncate transition duration-300 ${
                          showAt(1 + index * 1.1) ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
                        }`}
                      >
                        $ {line}
                      </p>
                    ))}
                    <p
                      className={`truncate text-emerald-200 transition duration-300 ${
                        showAt(4.5) ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
                      }`}
                    >
                      task intake ready
                    </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${sceneClass(8, 16)} absolute inset-0 place-items-center p-5 transition-opacity duration-300`}>
                <div className="w-full max-w-6xl">
                  <PhaseHeading title="Phase 2 User enters task in Sidecar" body="The user enters a task into Agent Sidecar instead of typing directly into Codex" />
                <div className="mt-4 grid overflow-hidden rounded-2xl border border-white/10 bg-[#08080d] shadow-2xl shadow-black/30 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <section className="min-w-0 bg-[#0b0b12]">
                    <div className="flex items-center gap-1 border-b border-white/10 bg-[#050509] px-3 pt-3">
                      <div className="rounded-t-lg border border-b-0 border-white/10 bg-[#0b0b12] px-4 py-2 font-mono text-xs text-neutral-200">
                        session.ts
                      </div>
                    </div>
                    <div className="p-5">
                      <p className="mb-4 font-mono text-xs text-neutral-500">src/auth/session.ts</p>
                      <div className="max-h-[430px] overflow-hidden rounded-xl border border-white/10 bg-[#050509] p-4 font-mono text-[13px] leading-6">
                        {preEditCodeLines.map(([lineNumber, code, color]) => (
                          <p key={`${lineNumber}-${code}`} className={`grid grid-cols-[42px_1fr] gap-4 ${color}`}>
                            <span className="select-none text-right text-neutral-600">{lineNumber}</span>
                            <span className="truncate">{code}</span>
                          </p>
                        ))}
                      </div>
                    </div>
                  </section>
                  <aside className="border-t border-white/10 bg-[#08080d] p-4 lg:border-l lg:border-t-0">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#22d3ee]">Agent Sidecar</p>
                        <h3 className="mt-1 text-lg font-semibold">New Codex task</h3>
                      </div>
                      <span className="rounded-full border border-[#22d3ee]/25 bg-[#22d3ee]/[0.06] px-3 py-1 font-mono text-[11px] text-[#22d3ee]">
                        task intake
                      </span>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="font-mono text-xs uppercase tracking-[0.16em] text-neutral-500">User prompt</p>
                      <div className="mt-3 rounded-xl border border-white/10 bg-[#050509] p-3 text-sm leading-6 text-neutral-100">
                        <span>{typedPrompt}</span>
                        <span className="ml-0.5 inline-block h-4 w-1 translate-y-0.5 bg-[#22d3ee]" />
                      </div>
                    </div>
                  </aside>
                </div>
                </div>
              </div>

              <div className={`${sceneClass(16, 24)} absolute inset-0 place-items-center p-5 transition-opacity duration-300`}>
                <div className="w-full max-w-4xl">
                  <PhaseHeading
                    title="Phase 3 Context retrieval and rewrite"
                    body="Agent Sidecar loads repo type, AGENTS.md, previous plans, file tree, branch, and relevant diffs before rewriting the prompt"
                  />
                  <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#050509] shadow-2xl shadow-black/30">
                    <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#22d3ee]">Prompt optimizer</p>
                        <h3 className="mt-2 text-2xl font-semibold">Task becomes a Codex-ready contract</h3>
                      </div>
                      <span className="w-fit rounded-full border border-emerald-300/20 bg-emerald-300/[0.06] px-3 py-1 font-mono text-xs text-emerald-200">
                        submitted to Codex
                      </span>
                    </div>
                    <div className="grid gap-4 p-5 lg:grid-cols-[0.88fr_1.12fr]">
                      <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                        <p className="font-mono text-xs uppercase tracking-[0.16em] text-neutral-500">Original prompt</p>
                        <p className="mt-3 text-sm leading-7 text-neutral-300">{promptText}</p>
                      </div>
                      <div className="rounded-2xl border border-[#22d3ee]/25 bg-[#22d3ee]/[0.045] p-4">
                        <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#22d3ee]">Optimized contract</p>
                        <div className="mt-3 grid gap-2">
                          {optimizedPromptLines.map((line, index) => (
                            <p
                              key={line}
                              className={`rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm leading-6 text-neutral-200 transition duration-300 ${
                                showAt(16.6 + index * 0.7) ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
                              }`}
                            >
                              {line}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${sceneClass(24, 32)} absolute inset-0 place-items-center p-5 transition-opacity duration-300`}>
                <div className="w-full max-w-4xl">
                  <PhaseHeading title="Phase 4 Sidecar submits and supervises" body="The optimized prompt goes to Codex, then Agent Sidecar watches runtime events for loops, risky tools, validation gaps, and budget pressure" />
                <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#050509] shadow-2xl shadow-black/30">
                  <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#22d3ee]">Agent Sidecar runtime</p>
                      <h3 className="mt-2 text-2xl font-semibold">Retrieved context anchors the Codex run</h3>
                    </div>
                    <span className="w-fit rounded-full border border-emerald-300/20 bg-emerald-300/[0.06] px-3 py-1 font-mono text-xs text-emerald-200">
                      evaluating run
                    </span>
                  </div>
                  <div className="grid gap-3 p-5 sm:grid-cols-2">
                    {capabilityEvents.map(([label, body], index) => (
                      <div
                        key={label}
                        className={`rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition duration-300 ${
                          showAt(24.6 + index * 0.65) ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-mono text-xs uppercase tracking-[0.14em] text-[#22d3ee]">{label}</p>
                            <p className="mt-2 text-sm leading-6 text-neutral-300">{body}</p>
                          </div>
                          <span className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-emerald-300/12 text-xs text-emerald-200">
                            OK
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                </div>
              </div>

              <div className={`${sceneClass(32, 40)} absolute inset-0 place-items-center p-5 transition-opacity duration-300`}>
                <div className="w-full max-w-5xl">
                  <PhaseHeading
                    title="Phase 5 Codex edits from contract"
                    body="Codex applies the narrow fix using the sidecar-submitted task contract and runtime decisions"
                  />
                <div className="mt-4 grid overflow-hidden rounded-2xl border border-white/10 bg-[#08080d] shadow-2xl shadow-black/30 lg:grid-cols-[230px_1fr]">
                  <aside className="hidden border-r border-white/10 bg-[#090910] p-4 lg:block">
                    <p className="font-mono text-xs uppercase tracking-[0.18em] text-neutral-500">Explorer</p>
                    <div className="mt-5 grid gap-2">
                      {files.map((file) => (
                        <div
                          key={file}
                          className={`rounded-lg px-3 py-2 font-mono text-xs ${
                            file === "src/auth/session.ts" ? "bg-[#22d3ee]/[0.08] text-[#22d3ee]" : "text-neutral-400"
                          }`}
                        >
                          {file}
                        </div>
                      ))}
                    </div>
                  </aside>
                  <section className="min-w-0 bg-[#0b0b12]">
                    <div className="flex items-center justify-between border-b border-white/10 bg-[#050509] px-4 py-3">
                      <span className="font-mono text-xs text-neutral-500">src/auth/session.ts</span>
                      <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.06] px-3 py-1 font-mono text-[11px] text-emerald-200">
                        steered by sidecar
                      </span>
                    </div>
                    <div className="p-5">
                      <div className="rounded-xl border border-white/10 bg-[#050509] p-4 font-mono text-sm leading-7">
                        {codeLines.map(([lineNumber, code, color]) => (
                          <p
                            key={`${lineNumber}-${code}`}
                            className={`grid grid-cols-[42px_1fr] gap-4 ${color}`}
                          >
                            <span className="select-none text-right text-neutral-600">{lineNumber}</span>
                            <span className="truncate">{code}</span>
                          </p>
                        ))}
                      </div>
                    </div>
                  </section>
                </div>
                </div>
              </div>

              <div className={`${finalSceneClass} absolute inset-0 place-items-center p-5 transition-opacity duration-300`}>
                <div className="w-full max-w-6xl">
                  <PhaseHeading
                    title="Phase 6 Dashboard records the result"
                    body="The control plane records original prompt, optimized prompt, token estimate, result quality, validation requirement, and cost evidence"
                  />
                  <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#050509] shadow-2xl shadow-black/30">
                    <div className="grid min-h-[430px] lg:grid-cols-[200px_1fr]">
                      <aside className="hidden border-r border-white/10 bg-[#07070b] p-4 lg:block">
                        <div className="flex items-center gap-3">
                          <span className="relative grid size-10 place-items-center rounded-xl border border-white/20 bg-white/[0.04]">
                            <Bot size={20} />
                            <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-[#22d3ee]" />
                          </span>
                          <div>
                            <p className="text-sm font-semibold">Agent Sidecar</p>
                            <p className="font-mono text-xs text-neutral-500">Acme workspace</p>
                          </div>
                        </div>
                        <nav className="mt-6 grid gap-2 text-sm">
                          {["Traces", "Decisions", "Policies", "Lessons", "Analytics"].map((item, index) => (
                            <div
                              key={item}
                              className={`rounded-xl px-3 py-2.5 ${
                                index === 0 ? "border border-[#22d3ee]/30 bg-[#22d3ee]/[0.08] text-white" : "text-neutral-500"
                              }`}
                            >
                              {item}
                            </div>
                          ))}
                        </nav>
                      </aside>
                      <section className="min-w-0 bg-[radial-gradient(circle_at_88%_12%,rgba(34,211,238,0.1),transparent_26%),#050509] p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-mono text-xs uppercase tracking-[0.25em] text-[#22d3ee]">Live runs</p>
                            <h3 className="mt-2 text-2xl font-semibold">Runtime control plane</h3>
                          </div>
                          <span className="w-fit rounded-full border border-emerald-300/25 bg-emerald-300/[0.08] px-4 py-2 font-mono text-xs text-emerald-200">
                            daemon connected
                          </span>
                        </div>

                        <div className="mt-5 grid gap-3 sm:grid-cols-3">
                          {[
                            ["Guarded runs", "18"],
                            ["Decisions", "43"],
                            ["Saved lessons", "9"]
                          ].map(([label, value]) => (
                            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                              <p className="font-mono text-xs uppercase tracking-[0.16em] text-neutral-500">{label}</p>
                              <p className="mt-3 text-3xl font-semibold">{value}</p>
                            </div>
                          ))}
                        </div>

                        <div className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.055] p-3">
                          <div className="grid gap-3 sm:grid-cols-[210px_1fr_170px] sm:items-center">
                            <div>
                              <p className="font-mono text-xs uppercase tracking-[0.18em] text-emerald-200">Total cost saved</p>
                              <p className="mt-2 text-4xl font-semibold text-emerald-100">$4,820</p>
                            </div>
                            <p className="text-sm leading-7 text-neutral-300">
                              Estimated from guarded runs compared with matched baseline traces, including the auth-refresh fix shown in this demo
                            </p>
                            <div className="rounded-xl border border-emerald-300/20 bg-black/20 p-3">
                              <p className="font-mono text-xs uppercase tracking-[0.14em] text-emerald-200">This run saved</p>
                              <p className="mt-2 text-2xl font-semibold text-emerald-100">$1.43</p>
                              <p className="mt-1 font-mono text-[11px] text-neutral-500">$2.84 to $1.41</p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
                          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">
                            <div className="grid grid-cols-[1fr_170px] gap-3 px-2 font-mono text-xs uppercase tracking-[0.16em] text-neutral-500">
                              <span>Trace</span>
                              <span>Decision</span>
                            </div>
                            <div className="mt-3 grid gap-3">
                              {[
                                ["auth-refresh-fix", "validated", "require validation"],
                                ["billing-webhook", "watching", "inject lesson"],
                                ["worker-memory-leak", "review", "block repeat"]
                              ].map(([trace, status, decision]) => (
                                <div key={trace} className="grid grid-cols-[1fr_170px] items-center gap-3 rounded-xl border border-white/10 bg-[#08080d] p-2.5">
                                  <div>
                                    <p className="text-base font-semibold">{trace}</p>
                                    <p className="mt-1 font-mono text-xs text-neutral-500">{status}</p>
                                  </div>
                                  <span className="rounded-full border border-white/10 bg-black/25 px-3 py-2 text-center font-mono text-xs text-neutral-300">
                                    {decision}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-[#22d3ee]/25 bg-[#22d3ee]/[0.045] p-3">
                            <p className="font-mono text-xs uppercase tracking-[0.22em] text-[#22d3ee]">Selected trace</p>
                            <h3 className="mt-4 text-2xl font-semibold">auth-refresh-fix</h3>
                            <div className="mt-4 grid gap-3">
                              {[
                                "original + optimized prompt recorded",
                                "token estimate: original vs optimized",
                                "result quality: validated"
                              ].map((item) => (
                                <div key={item} className="rounded-xl border border-white/10 bg-[#071012] p-3 text-sm leading-6 text-neutral-200">
                                  {item}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </section>
                    </div>
                  </div>
                </div>
              </div>
              <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-2xl border border-[#22d3ee]/25 bg-[#050509]/92 p-4 shadow-2xl shadow-black/30 backdrop-blur">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border border-[#22d3ee]/25 bg-[#22d3ee]/[0.08] text-[#22d3ee]">
                    <Volume2 size={15} />
                  </span>
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#22d3ee]">AI narration</p>
                    <p className="mt-1 text-sm leading-6 text-neutral-200">{activeNarration}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/30 p-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={demoPaused ? "Play demo" : "Pause demo"}
                  onClick={toggleDemoPlayback}
                  className="grid size-10 place-items-center rounded-full bg-white text-[#07070b] transition hover:bg-neutral-200"
                >
                  {demoPaused ? <Play size={17} fill="currentColor" /> : <Pause size={17} fill="currentColor" />}
                </button>
                <button
                  type="button"
                  aria-label="Restart demo from beginning"
                  onClick={restartDemo}
                  className="grid size-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-neutral-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                >
                  <RotateCcw size={17} />
                </button>
              </div>
              <button
                ref={progressRef}
                type="button"
                aria-label="Seek demo timeline"
                onClick={(event: any) => seekDemo(event.clientX)}
                className="h-5 flex-1 rounded-full py-1"
              >
                <span className="block h-2 overflow-hidden rounded-full bg-white/10">
                  <span
                    className="block h-full rounded-full bg-[#22d3ee] transition-[width] duration-100"
                    style={{ width: `${(demoTime / demoDuration) * 100}%` }}
                  />
                </span>
              </button>
              <span className="font-mono text-xs text-neutral-500">00:48</span>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

function PhaseHeading({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 shadow-lg shadow-black/20">
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#22d3ee]">{title}</p>
      <p className="mt-1 text-sm leading-6 text-neutral-300">{body}</p>
    </div>
  );
}

function ComparisonCard() {
  const readableItems = [
    ["Run timeline", "Tool calls, timestamps, exit states, and validation status"],
    ["Cost evidence", "Token estimates, model usage, and matched baseline savings"],
    ["Policy outcomes", "Allowed actions, blocked waste, and reason codes for audit"]
  ] as const;
  const privateItems = [
    ["Source contents", "Repository files stay on the developer machine unless explicitly shared"],
    ["Secrets", "Environment variables, credentials, and protected paths are never exposed"],
    ["Raw prompts", "Sensitive task text can remain local while metadata rolls up for teams"]
  ] as const;

  return (
    <div className="relative mx-auto w-full max-w-6xl overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.035] p-4 text-left text-white shadow-2xl shadow-[#7c5cff]/10 backdrop-blur">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(124,92,255,0.22),transparent_32%),radial-gradient(circle_at_84%_82%,rgba(34,211,238,0.13),transparent_32%)]" />
      <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[#07070b]/84 p-5">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-neutral-500">Local-first telemetry boundary</p>
            <h3 className="mt-2 max-w-2xl text-2xl font-semibold leading-tight">Enterprise visibility without opening the whole workspace</h3>
          </div>
          <div className="w-fit rounded-full border border-[#22d3ee]/25 bg-[#22d3ee]/[0.08] px-3 py-1 font-mono text-xs text-[#9be8f4]">
            coded access map
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <VisibilityPanel
            title="Accessible / readable"
            tone="emerald"
            summary="Safe operational telemetry for engineering leaders, platform teams, and finance reviewers."
            items={readableItems}
          />
          <VisibilityPanel
            title="Kept private"
            tone="red"
            summary="Sensitive code, credentials, and raw workspace context remain local by default."
            items={privateItems}
          />
        </div>
      </div>
    </div>
  );
}

function VisibilityPanel({
  title,
  tone,
  summary,
  items
}: {
  title: string;
  tone: "emerald" | "red";
  summary: string;
  items: readonly (readonly [string, string])[];
}) {
  const isReadable = tone === "emerald";
  const panel = isReadable ? "border-emerald-300/30 bg-emerald-300/[0.075]" : "border-red-400/30 bg-red-400/[0.075]";
  const label = isReadable ? "bg-emerald-300 text-[#03170b]" : "bg-red-400 text-[#210505]";
  const dot = isReadable ? "bg-emerald-300 shadow-emerald-300/30" : "bg-red-400 shadow-red-400/30";
  const text = isReadable ? "text-emerald-100" : "text-red-100";

  return (
    <article className={`flex min-h-full flex-col rounded-xl border p-4 ${panel}`}>
      <div className="border-b border-white/10 pb-4">
        <p className={`w-fit rounded-full px-3 py-1 font-mono text-xs font-semibold uppercase tracking-[0.18em] ${label}`}>{title}</p>
        <p className={`mt-4 text-lg font-semibold leading-7 ${text}`}>{summary}</p>
      </div>
      <div className="mt-4 grid gap-3">
        {items.map(([name, detail]) => (
          <div key={name} className="grid grid-cols-[14px_1fr] gap-3 rounded-lg border border-white/10 bg-[#07070b]/60 px-3 py-3">
            <span className={`mt-2 size-2 rounded-full shadow-lg ${dot}`} />
            <div>
              <p className="text-sm font-semibold text-white">{name}</p>
              <p className="mt-1 text-sm leading-6 text-neutral-400">{detail}</p>
            </div>
          </div>
        ))}
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
