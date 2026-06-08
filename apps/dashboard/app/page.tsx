"use client";

import type { ReactNode } from "react";
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
  ["Demo", "#demo"],
  ["Impact", "#impact"],
  ["Privacy", "#privacy"],
  ["How to use", "#how-to-use"]
] as const;

const impactCards = [
  {
    title: "AI budgets stop drifting",
    body: "Agent Sidecar ties every expensive coding-agent run to measurable task outcomes, giving finance and platform teams the evidence they need to defend, tune, or rein in spend."
  },
  {
    title: "Engineering velocity stays protected",
    body: "The sidecar removes low-value context, remembers useful repo lessons, and steers agents away from loops so senior engineers spend less time rescuing bloated runs."
  },
  {
    title: "Adoption becomes governable",
    body: "Leaders get a local-first audit trail of model usage, validation evidence, and policy outcomes without forcing developers to abandon the coding tools they already use."
  }
];

const workflow = [
  "A lightweight daemon runs beside Codex or Claude Code",
  "Agent Sidecar tightens the prompt and scopes the right repo context",
  "Lower-cost steering keeps the agent focused before expensive tokens pile up",
  "Run evidence rolls into the dashboard automatically",
  "Teams get spend, quality, and governance signals without manual writeups"
];

export default function HomePage() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#07070b] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_18%_8%,rgba(124,92,255,0.18),transparent_34%),radial-gradient(circle_at_82%_12%,rgba(34,211,238,0.12),transparent_30%),linear-gradient(180deg,#07070b_0%,#0a0a12_46%,#07070b_100%)]" />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:48px_48px] opacity-45" />
      <Navbar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <Hero />
      <DemoSection />
      <ImpactSection />
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
          The era of tokenmaxxing is over.
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-neutral-300 sm:text-xl sm:leading-9">
          Agent Sidecar cuts wasted coding-agent tokens, proves where AI spend turns into engineering output, and keeps Codex, Claude Code, and other agentic tools under enterprise control.
        </p>
        <div className="mt-8 w-full max-w-6xl">
          <HeroComparisonCard />
        </div>
      </div>
    </section>
  );
}

function ImpactSection() {
  return (
    <section
      id="impact"
      className="mx-auto max-w-7xl px-5 py-16 sm:px-7 lg:px-10"
    >
      <Badge>Impact</Badge>
      <h2 className="mt-8 max-w-5xl text-4xl font-semibold leading-tight tracking-normal sm:text-5xl lg:text-6xl">
        Enterprises get control without slowing agentic development
      </h2>
      <p className="mt-6 max-w-4xl text-xl leading-9 text-neutral-300">
        Agent Sidecar does the prompt tightening, routing discipline, context pruning, and run measurement in the background, enabling teams to scale coding agents with lower waste and clearer accountability.
      </p>
      <div className="mt-12 grid gap-5 lg:grid-cols-3">
        {impactCards.map((card) => (
          <article key={card.title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
            <h3 className="text-2xl font-semibold">{card.title}</h3>
            <p className="mt-4 text-base leading-8 text-neutral-400">{card.body}</p>
          </article>
        ))}
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
            Agent Sidecar becomes the control plane and replay UI around everyday coding-agent work. It optimizes prompt context, routing, and telemetry in the background, then shows whether each optimization improved cost per successful task.
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
              <div className={`${sceneClass(0, 5)} absolute inset-0 place-items-center p-5 transition-opacity duration-300`}>
                <div className="w-full max-w-6xl">
                  <PhaseHeading title="Codex coding session" body="Coding agents burn tokens while they work." />
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
                        {["+18k repeated tokens", "3 duplicated file reads", "model route: overpowered"].map((item, index) => (
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
                  <PhaseHeading title="Prompt Refiner" body="Prompt Refiner cuts the waste before the next call." />
                  <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#050509] shadow-2xl shadow-black/30">
                    <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#22d3ee]">Agent Sidecar</p>
                        <h3 className="mt-2 text-2xl font-semibold">Bloated prompt becomes a focused coding task</h3>
                      </div>
                      <span className="w-fit rounded-full border border-emerald-300/20 bg-emerald-300/[0.06] px-3 py-1 font-mono text-xs text-emerald-200">
                        fewer tokens
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
                        <p className="mt-4 font-mono text-xs text-red-200">~24k prompt tokens</p>
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
                        <p className="mt-4 font-mono text-xs text-emerald-200">~8k prompt tokens</p>
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
                            ["Tokens saved", "66%"],
                            ["Spend", "-50%"],
                            ["Output", "validated"]
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
                              Prompt Refiner removed repeated context, memory avoided duplicate file reads, and routing kept simple edits off the strongest model.
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
                                ["auth-refresh-fix", "validated", "prompt refined"],
                                ["session.ts edit", "complete", "cheaper route"],
                                ["auth tests", "passed", "strong model kept idle"]
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
                                "Prompt Refiner impact: 24k to 8k",
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
  return (
    <div
      role="img"
      aria-label="Hero image comparing a coding-agent run without Agent Sidecar at $2.84 per run against a run with Agent Sidecar at $1.41 per run."
      className="relative mx-auto w-full max-w-6xl overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.035] p-4 text-left text-white shadow-2xl shadow-[#7c5cff]/10 backdrop-blur"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(124,92,255,0.22),transparent_32%),radial-gradient(circle_at_84%_82%,rgba(34,211,238,0.13),transparent_32%)]" />
      <div className="relative flex min-h-[520px] flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[#07070b]/84 p-5 sm:min-h-[430px] lg:min-h-[360px]">
        <div className="border-b border-white/10 pb-5">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-neutral-500">User prompt</p>
            <h3 className="mt-2 text-xl font-semibold leading-tight">
              The auth refresh flow keeps breaking after token renewal; can you look through the session code, figure out what is going on, and fix it without changing unrelated auth behavior?
            </h3>
          </div>
        </div>

        <div className="mt-5 grid flex-1 gap-4 lg:grid-cols-2">
          <RunComparisonPanel
            title="Without Agent Sidecar"
            tone="red"
            cost="$2.84"
            outcome="wasteful run"
            lines={[
              "bloated prompt drifts from user goal",
              "same repo context reread repeatedly",
              "expensive model handles simple edits"
            ]}
          />
          <RunComparisonPanel
            title="With Agent Sidecar"
            tone="emerald"
            cost="$1.41"
            outcome="steered run"
            lines={[
              "condensed prompt aligned to user goals",
              "repo memory prevents duplicate reads",
              "smart routing matches task difficulty"
            ]}
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
        <div className="col-span-2 flex items-baseline gap-2">
          <p className={`text-4xl font-semibold leading-none ${accent}`}>{cost}</p>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-neutral-500">per run</p>
        </div>
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

function PrivacyComparisonCard() {
  const readableItems = [
    ["Engineering throughput", "Highlights stalls, loops, and skipped validation so leaders can protect delivery quality without policing individual developers"],
    ["Spend accountability", "Connects token usage and model choice to completed work so finance reviewers can judge ROI instead of raw AI bills"],
    ["Governance evidence", "Records policy decisions and validation status so platform teams can prove guardrails are working"]
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
            title="Operational evidence"
            tone="emerald"
            summary="The sidecar turns raw agent activity into business-relevant signals for engineering, platform, and finance leaders."
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
