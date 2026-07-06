"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Code2,
  Menu,
  Pause,
  Play,
  RotateCcw,
  X
} from "lucide-react";

const navItems = [
  ["Dashboard", "/dashboard"],
  ["Demo", "#demo"],
  ["Privacy", "#privacy"],
  ["How to use", "#how-to-use"]
] as const;

const workflow = [
  "Install the sidecar package with pip",
  "Start the daemon from your terminal",
  "Code in Codex like normal while Agent Sidecar runs in the background",
  "Sidecar optimizes prompt metadata, context, model routing, and telemetry behind the scenes",
  "Review prompt hashes, cost evidence, result quality, decisions, and evidence-labeled analytics"
];

export default function HomePage() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <main className="website-shell min-h-screen overflow-x-hidden bg-[#07070b] text-white">
      <Navbar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <Hero />
      <DemoSection />
      <PrivacySection />
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
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07070b]/80 backdrop-blur-xl">
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
    <section className="mx-auto flex min-w-0 max-w-7xl flex-col items-center overflow-hidden px-3 pb-16 pt-14 text-center sm:px-7 sm:pt-16 lg:px-10 lg:pb-20 lg:pt-20">
      <div className="flex w-full min-w-0 max-w-7xl flex-col items-center">
        <h1 className="hero-headline max-w-full break-words text-3xl font-semibold leading-[1.08] tracking-normal sm:max-w-5xl sm:text-5xl sm:leading-[1.02] lg:text-6xl">
          Stop Tokenmaxxing. Start Proving Savings.
        </h1>
        <p className="hero-subcopy mt-6 max-w-2xl break-words text-base leading-7 text-neutral-300 sm:max-w-3xl sm:text-xl sm:leading-9">
          Agent Sidecar lowers Codex and Claude Code costs by turning every run into measurable, validated task economics.
        </p>
        <div className="mt-8 w-full min-w-0 max-w-6xl overflow-hidden">
          <HeroComparisonCard />
        </div>
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
            The dashboard is the separate control plane for cost, timing, and quality evidence. Developers keep coding in Codex while Agent Sidecar optimizes sanitized task context, routing, and telemetry in the background, then measures whether those optimizations improve cost per successful task.
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
        <DashboardPreview />
      </div>
    </Section>
  );
}

function DashboardPreview() {
  const nav = ["Costs", "Timing", "Quality", "Runs", "Evidence"];

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

        <div className="dashboard-preview-bg grid min-h-[520px] md:grid-cols-[190px_1fr]">
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
                <h3 className="mt-2 text-2xl font-semibold">Economics dashboard</h3>
              </div>
              <span className="w-fit rounded-full border border-emerald-300/25 bg-emerald-300/[0.08] px-3 py-1 font-mono text-xs text-emerald-200">
                daemon connected
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                ["default cost", "$9.28"],
                ["sidecar cost", "$5.11"],
                ["quality", "100%"]
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
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-emerald-200">validated cost reduction</p>
                  <p className="mt-2 text-3xl font-semibold text-emerald-100">$4,820</p>
                </div>
                <p className="max-w-xs text-sm leading-6 text-emerald-50/70">
                  Estimated from successful traces, observed cost movement, timing, and quality gates.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {[
                ["prompt contract", "scope and validation extracted before Codex runs"],
                ["model route", "narrow edits stay on the cheaper viable path"],
                ["validated delta", "cost movement counted after the task succeeds"]
              ].map(([label, copy]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#22d3ee]">{label}</p>
                  <p className="mt-3 text-sm leading-6 text-neutral-300">{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DemoSection() {
  const demoDuration = 25;
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
  const capabilityEvents: Array<[string, string]> = [
    ["Prompt", "Send refined task contract into Codex"],
    ["Repo memory", "Reuse auth-refresh plan instead of rereading files"],
    ["Model route", "Use cheaper model for narrow edit step"],
    ["Validation", "Reserve stronger model for failure analysis"]
  ];
  const optimizedPromptLines = [
    "Task: Fix auth refresh so users stay signed in after token renewal",
    "Constraints: Keep the change narrow and follow AGENTS.md",
    "Acceptance: Token renewal persists before redirect",
    "PR boundary: No unrelated auth refactors",
    "Tests: Run targeted auth refresh and login flow checks"
  ];
  const messyPromptLines = [
    "Full chat history pasted into next call",
    "Repeated session.ts and tokens.ts reads",
    "Verbose reasoning from earlier attempts",
    "Generic request: figure it out and fix anything"
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
  const finalSceneClass = demoTime >= 19 ? "grid opacity-100" : "hidden opacity-0";
  const showAt = (time: number) => demoTime >= time;
  const promptProgress = Math.min(Math.max((demoTime - 0.7) / 2.8, 0), 1);
  const promptText = "Login keeps breaking after token refresh. Can you figure it out and fix whatever is wrong?";
  const typedPrompt = promptText.slice(0, Math.max(1, Math.round(promptText.length * promptProgress)));
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
            className={`demo-stage-bg relative p-4 sm:p-6 ${
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
              className="demo-video-frame relative block w-full cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-[#07070b]/90 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[#22d3ee]/70"
            >
              <div className={`${sceneClass(0, 5)} absolute inset-0 place-items-center p-5 transition-opacity duration-300`}>
                <div className="w-full max-w-6xl">
                  <PhaseHeading title="Codex coding session" body="Agent cost accrues while the task is still unresolved." />
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
                        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#22d3ee]">Codex</p>
                        <h3 className="mt-1 text-lg font-semibold">Working task</h3>
                      </div>
                      <span className="rounded-full border border-[#22d3ee]/25 bg-[#22d3ee]/[0.06] px-3 py-1 font-mono text-[11px] text-[#22d3ee]">
                        reading files
                      </span>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="font-mono text-xs uppercase tracking-[0.16em] text-neutral-500">Agent prompt</p>
                      <div className="mt-3 rounded-xl border border-white/10 bg-[#050509] p-3 text-sm leading-6 text-neutral-100">
                        <span>{typedPrompt}</span>
                        <span className="ml-0.5 inline-block h-4 w-1 translate-y-0.5 bg-[#22d3ee]" />
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 rounded-2xl border border-white/10 bg-black/20 p-4 font-mono text-xs text-neutral-300">
                      <p className={`${showAt(1.2) ? "opacity-100" : "opacity-0"} transition`}>read src/auth/session.ts</p>
                      <p className={`${showAt(2.1) ? "opacity-100" : "opacity-0"} transition`}>inspect tests/auth-refresh.test.ts</p>
                      <p className={`${showAt(3.0) ? "opacity-100" : "opacity-0"} transition text-amber-200`}>plan narrow token persistence fix</p>
                    </div>
                  </aside>
                </div>
                </div>
              </div>

              <div className={`${sceneClass(5, 9)} absolute inset-0 place-items-center p-5 transition-opacity duration-300`}>
                <div className="w-full max-w-5xl">
                  <PhaseHeading title="Coding-specific waste" body="Bloated prompts. Repeated context. Hidden spend." />
                  <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_0.8fr]">
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#08080d] shadow-2xl shadow-black/30">
                      <div className="border-b border-white/10 bg-[#050509] px-4 py-3">
                        <p className="font-mono text-xs uppercase tracking-[0.18em] text-neutral-500">Codex loop</p>
                      </div>
                      <div className="grid gap-2 p-5 font-mono text-sm">
                        {[
                          ["read src/auth/session.ts", "text-neutral-300"],
                          ["read src/auth/session.ts again", "text-amber-200"],
                          ["attach full chat history", "text-amber-200"],
                          ["route simple edit to expensive model", "text-red-200"]
                        ].map(([line, color], index) => (
                          <p
                            key={line}
                            className={`${color} transition duration-300 ${
                              showAt(5.4 + index * 0.65) ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
                            }`}
                          >
                            $ {line}
                          </p>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-red-300/20 bg-red-300/[0.045] p-5">
                      <p className="font-mono text-xs uppercase tracking-[0.18em] text-red-200">Waste detected</p>
                      <div className="mt-4 grid gap-3">
                        {["costly repeated context", "3 duplicated file reads", "model route: overpowered"].map((item, index) => (
                          <div
                            key={item}
                            className={`rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-neutral-200 transition duration-300 ${
                              showAt(6.1 + index * 0.65) ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
                            }`}
                          >
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${sceneClass(9, 14)} absolute inset-0 place-items-center p-5 transition-opacity duration-300`}>
                <div className="w-full max-w-5xl">
                  <PhaseHeading title="Prompt Refiner" body="Prompt Refiner improves the task path before more cost accrues." />
                  <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#050509] shadow-2xl shadow-black/30">
                    <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#22d3ee]">Agent Sidecar</p>
                        <h3 className="mt-2 text-2xl font-semibold">Bloated prompt becomes a focused coding task</h3>
                      </div>
                      <span className="w-fit rounded-full border border-emerald-300/20 bg-emerald-300/[0.06] px-3 py-1 font-mono text-xs text-emerald-200">
                        lower task cost
                      </span>
                    </div>
                    <div className="grid gap-4 p-5 lg:grid-cols-[0.9fr_1.1fr]">
                      <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                        <p className="font-mono text-xs uppercase tracking-[0.16em] text-neutral-500">Before</p>
                        <div className="mt-3 grid gap-2">
                          {messyPromptLines.map((line, index) => (
                            <p
                              key={line}
                              className={`rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm leading-6 text-neutral-300 transition duration-300 ${
                                showAt(9.4 + index * 0.35) ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
                              }`}
                            >
                              {line}
                            </p>
                          ))}
                        </div>
                        <p className="mt-4 font-mono text-xs text-red-200">high-cost prompt context</p>
                      </div>
                      <div className="rounded-2xl border border-[#22d3ee]/25 bg-[#22d3ee]/[0.045] p-4">
                        <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#22d3ee]">Refined prompt</p>
                        <div className="mt-3 grid gap-2">
                          {optimizedPromptLines.map((line, index) => (
                            <p
                              key={line}
                              className={`rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm leading-6 text-neutral-200 transition duration-300 ${
                                showAt(10.8 + index * 0.45) ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
                              }`}
                            >
                              {line}
                            </p>
                          ))}
                        </div>
                        <p className="mt-4 font-mono text-xs text-emerald-200">focused task contract</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${sceneClass(14, 19)} absolute inset-0 place-items-center p-5 transition-opacity duration-300`}>
                <div className="w-full max-w-4xl">
                  <PhaseHeading title="Steering applied to coding" body="Refine prompts. Reuse memory. Route smarter." />
                <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#050509] shadow-2xl shadow-black/30">
                  <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#22d3ee]">Agent Sidecar runtime</p>
                      <h3 className="mt-2 text-2xl font-semibold">Next Codex step gets a cleaner route</h3>
                    </div>
                    <span className="w-fit rounded-full border border-emerald-300/20 bg-emerald-300/[0.06] px-3 py-1 font-mono text-xs text-emerald-200">
                      steering active
                    </span>
                  </div>
                  <div className="grid gap-3 p-5 sm:grid-cols-2">
                    {capabilityEvents.map(([label, body], index) => (
                      <div
                        key={label}
                        className={`rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition duration-300 ${
                          showAt(14.5 + index * 0.75) ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
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

              <div className={`${sceneClass(16.6, 19)} absolute inset-0 place-items-end p-5 transition-opacity duration-300`}>
                <div className="w-full max-w-5xl">
                <div className="grid overflow-hidden rounded-2xl border border-white/10 bg-[#08080d] shadow-2xl shadow-black/30 lg:grid-cols-[230px_1fr]">
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
                        narrow edit
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
                    title="Dashboard and coding outcome"
                    body="Lower spend. Same engineering output."
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
                      <section className="demo-dashboard-bg min-w-0 p-4">
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
                            ["Cost/task", "-50%"],
                            ["Quality", "validated"],
                            ["Scope", "unchanged"]
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
                              <p className="font-mono text-xs uppercase tracking-[0.18em] text-emerald-200">Validated cost reduction</p>
                              <p className="mt-2 text-4xl font-semibold text-emerald-100">$4,820</p>
                            </div>
                            <p className="text-sm leading-7 text-neutral-300">
                              Prompt Refiner removed repeated context, memory avoided duplicate file reads, and routing kept simple edits off the strongest model.
                            </p>
                            <div className="rounded-xl border border-emerald-300/20 bg-black/20 p-3">
                              <p className="font-mono text-xs uppercase tracking-[0.14em] text-emerald-200">This successful run</p>
                              <p className="mt-2 text-2xl font-semibold text-emerald-100">$1.43</p>
                              <p className="mt-1 font-mono text-[11px] text-neutral-500">$2.84 to $1.41</p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-3 lg:grid-cols-3">
                          {[
                            ["prompt contract", "original and optimized prompt hashes recorded"],
                            ["route steering", "simple session fix kept off the strongest model"],
                            ["quality gate", "savings counted after auth tests pass"]
                          ].map(([label, copy]) => (
                            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                              <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#22d3ee]">{label}</p>
                              <p className="mt-3 text-sm leading-6 text-neutral-300">{copy}</p>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
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
              <span className="font-mono text-xs text-neutral-500">00:25</span>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

function PrivacySection() {
  return (
    <section id="privacy" className="mx-auto max-w-7xl px-5 py-16 sm:px-7 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-3xl">
          <Badge>Privacy boundary</Badge>
          <h2 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">What Teams Can Read, What Stays Private</h2>
        </div>
      </div>
      <div className="mt-10">
        <PrivacyComparisonCard />
      </div>
    </section>
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

function HeroComparisonCard() {
  const baselineSteps = [
    "Reads session.ts again",
    "Explores stale callback path",
    "Routes simple edit to strongest model",
    "Needs follow-up validation"
  ];
  const sidecarSteps = [
    "Refines into a task contract",
    "Routes narrow edit to cheaper model",
    "Counts result only after tests pass"
  ];

  return (
    <div
      role="img"
      aria-label="Animated prompt-to-cost flow showing a coding-agent prompt entering Agent Sidecar, model steering steps, and final lower cost per successful task."
      className="reason-hero-card relative mx-auto min-w-0 max-w-full overflow-hidden border border-white/10 p-3 text-left shadow-2xl shadow-[#7c5cff]/10 sm:max-w-6xl sm:p-4"
    >
      <div className="reason-grid-bg absolute inset-0" />
      <div className="relative grid min-w-0 gap-3 sm:gap-4">
        <div className="grid min-w-0 gap-3 lg:grid-cols-[0.82fr_1.18fr] lg:items-stretch">
          <div className="reason-copy-panel flex min-h-[340px] min-w-0 flex-col justify-center border border-white/10 bg-[#0b0b12]/90 p-5 sm:p-7">
            <h3 className="max-w-md text-3xl font-semibold leading-[1.04] tracking-normal text-white sm:text-5xl">
              Provable cost savings for coding agents.
            </h3>
          </div>

          <div className="reason-terminal min-h-[430px] min-w-0 overflow-hidden border border-white/12 bg-[#08080d] text-white shadow-[0_24px_70px_rgba(34,211,238,0.08)]">
            <div className="border-b border-white/10 p-3">
              <div className="flex min-h-9 min-w-0 items-center overflow-hidden border border-white/12 bg-black/35 px-3 font-mono text-xs text-neutral-100">
                <span className="mr-2 shrink-0 text-[#67e8f9]">Prompt:</span>
                <span className="reason-prompt-feed">fix auth refresh; preserve unrelated session behavior</span>
                <span className="reason-cursor ml-1 inline-block h-4 w-1 bg-[#22d3ee]" />
              </div>
            </div>
            <div className="grid border-b border-white/10 bg-[#11111a] font-mono text-[10px] uppercase tracking-[0.16em] sm:grid-cols-2">
              <div className="flex items-center justify-between border-b border-white/10 px-3 py-3 sm:border-b-0 sm:border-r">
                <span className="text-neutral-500">Without sidecar</span>
                <span className="reason-cost-bad text-lg font-semibold text-red-300">$2.84</span>
              </div>
              <div className="flex items-center justify-between px-3 py-3">
                <span className="text-neutral-500">+ Agent Sidecar</span>
                <span className="reason-cost-good text-lg font-semibold text-emerald-300">$1.41</span>
              </div>
            </div>
            <div className="grid min-h-[290px] sm:grid-cols-2">
              <div className="grid content-start gap-3 border-b border-white/10 p-4 sm:border-b-0 sm:border-r">
                {baselineSteps.map((step, index) => (
                  <HeroCostStep key={step} tone="bad" index={index} label={step} />
                ))}
              </div>
              <div className="grid content-start gap-3 p-4">
                {sidecarSteps.map((step, index) => (
                  <HeroCostStep key={step} tone="good" index={index} label={step} />
                ))}
              </div>
            </div>
            <div className="reason-terminal-result grid gap-2 border-t border-white/10 bg-[#050509] px-4 py-3 text-white sm:grid-cols-[1fr_auto] sm:items-center">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-neutral-400">Final cost delta after validation</p>
              <p className="font-mono text-xl font-semibold text-emerald-300">-$1.43 per successful task</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function HeroCostStep({ tone, index, label }: { tone: "bad" | "good"; index: number; label: string }) {
  const toneClass = tone === "good" ? "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100" : "border-red-300/20 bg-red-300/[0.06] text-red-100";
  const markerClass = tone === "good" ? "bg-emerald-300" : "bg-red-300";

  return (
    <div
      className={`reason-cost-step grid grid-cols-[22px_1fr] items-center gap-3 border px-3 py-2 font-mono text-xs ${toneClass}`}
      style={{ "--delay": `${1.25 + index * 0.95}s` } as CSSProperties}
    >
      <span className={`size-2.5 ${markerClass}`} />
      <span>{label}</span>
    </div>
  );
}

function PrivacyComparisonCard() {
  const readableItems = [
    ["Run timeline", "Tool calls, timestamps, exit states, and validation status"],
    ["Cost evidence", "Token estimates, model usage, validated traces, and task-cost calculations"],
    ["Policy outcomes", "Allowed actions, blocked waste, and reason codes for audit"]
  ] as const;
  const privateItems = [
    ["Source contents", "Repository files stay on the developer machine unless explicitly shared"],
    ["Secrets", "Environment variables, credentials, and protected paths are never exposed"],
    ["Raw prompts", "Sensitive task text remains local while rollups use hashes and metadata"]
  ] as const;

  return (
    <div className="relative mx-auto w-full max-w-6xl overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.035] p-4 text-left text-white shadow-2xl shadow-[#7c5cff]/10 backdrop-blur">
      <div className="card-radial-overlay absolute inset-0" />
      <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[#07070b]/90 p-5">
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
    <span className="relative grid size-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04]">
      <Bot size={19} />
      <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[#22d3ee]" />
    </span>
  );
}
