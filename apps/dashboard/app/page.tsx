"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Minus, Pause, Play, RotateCcw } from "lucide-react";

import {
  Badge,
  CtaButtons,
  Footer,
  MockupCaption,
  Navbar,
  Section,
  sourceFootnotes
} from "./components/site";

export default function HomePage() {
  return (
    <main className="website-shell min-h-screen overflow-x-hidden bg-[#07070b] text-white">
      <Navbar />
      <Hero />
      <ProblemSection />
      <WhyNowSection />
      <WhatItIsSection />
      <HowItWorksSection />
      <GettingStartedSection />
      <RunSection />
      <DashboardSection />
      <PrivacySection />
      <CostToRunSection />
      <CompareSection />
      <PricingSection />
      <WhoItsForSection />
      <ClosingSection />
      <Footer />
    </main>
  );
}

/* 1. Hero */

const heroTerminalLines: Array<[string, string]> = [
  ["watching 3 workflows", ""],
  ["calls checked", "4,812"],
  ["blocked by rule", "17"],
  ["repaired, not retried", "41"],
  ["paused for approval", "3"],
  ["cost vs default", "-51%"]
];

function Hero() {
  return (
    <section className="mx-auto flex min-w-0 max-w-7xl flex-col items-center overflow-hidden px-3 pb-16 pt-14 text-center sm:px-7 sm:pt-16 lg:px-10 lg:pb-20 lg:pt-20">
      <div className="flex w-full min-w-0 max-w-7xl flex-col items-center">
        <h1 className="hero-headline max-w-full break-words text-3xl font-semibold leading-[1.08] tracking-normal sm:max-w-5xl sm:text-5xl sm:leading-[1.02] lg:text-6xl">
          Governance and cost controls for your team&apos;s AI agents.
        </h1>
        <p className="hero-subcopy mt-6 max-w-2xl break-words text-base leading-7 text-neutral-300 sm:max-w-3xl sm:text-xl sm:leading-9">
          Agent Sidecar runs inside your own cloud. It works with the models and frameworks you
          already use, and nothing leaves your environment.
        </p>
        <div className="mt-8">
          <CtaButtons center />
        </div>
        <div className="mt-10 w-full min-w-0 max-w-2xl overflow-hidden">
          <HeroTerminalCard />
          <MockupCaption />
        </div>
      </div>
    </section>
  );
}

function HeroTerminalCard() {
  return (
    <div className="reason-terminal min-w-0 overflow-hidden rounded-2xl border border-white/12 bg-[#08080d] text-left shadow-[0_24px_70px_rgba(34,211,238,0.08)]">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="size-2 rounded-full bg-red-400/80" />
        <span className="size-2 rounded-full bg-amber-300/80" />
        <span className="size-2 rounded-full bg-emerald-300/80" />
        <span className="ml-3 font-mono text-xs text-neutral-500">sidecar</span>
      </div>
      <div className="grid gap-1.5 p-5 font-mono text-sm leading-6">
        <p className="text-neutral-100">
          <span className="text-[#67e8f9]">$</span> sidecar supervise --cloud aws
        </p>
        {heroTerminalLines.map(([label, value]) => (
          <p key={label} className="flex justify-between text-neutral-300">
            <span>{label}</span>
            {value ? (
              <span className={value === "-51%" ? "text-emerald-300" : "text-neutral-100"}>{value}</span>
            ) : null}
          </p>
        ))}
        <p className="text-neutral-100">
          <span className="reason-cursor ml-0.5 inline-block h-4 w-2 translate-y-0.5 bg-[#22d3ee]" />
        </p>
      </div>
    </div>
  );
}

/* 2. The problem */

const problemStats: Array<[string, string, string]> = [
  [
    "21%",
    "of 3,235 IT and business leaders say their organization has a mature governance model for agentic AI.",
    "Deloitte, State of AI in the Enterprise 2026 [1]"
  ],
  [
    "98%",
    "of FinOps teams now manage AI spend, up from 31% two years earlier.",
    "FinOps Foundation, State of FinOps 2026 (n = 1,192) [2]"
  ],
  [
    "Dec 2027",
    "EU AI Act high-risk obligations (credit scoring, hiring, critical infrastructure) now land 2 Dec 2027 after the July 2026 Omnibus delay. A fixed date, and bank procurement cycles are long.",
    "Regulation (EU) 2024/1689, as amended [3]"
  ]
];

function ProblemSection() {
  return (
    <section id="problem" className="mx-auto max-w-7xl px-5 py-16 sm:px-7 lg:px-10">
      <div className="max-w-3xl">
        <Badge>The problem</Badge>
        <p className="mt-6 text-2xl font-semibold leading-snug text-neutral-100 sm:text-3xl">
          AI agents are acting on real systems faster than teams can govern them or control what
          they cost.
        </p>
        <h2 className="mt-8 text-3xl font-semibold leading-tight sm:text-5xl">
          Governance and cost control are lagging adoption
        </h2>
        <p className="mt-4 text-base leading-7 text-neutral-300 sm:text-lg">
          Two questions block every rollout in healthcare and finance: what is this agent allowed
          to do, and what did it cost?
        </p>
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        {problemStats.map(([stat, body, source]) => (
          <div key={stat} className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-4xl font-semibold text-[#22d3ee]">{stat}</p>
            <p className="mt-4 flex-1 text-sm leading-6 text-neutral-200">{body}</p>
            <p className="mt-4 font-mono text-[11px] leading-5 text-neutral-500">{source}</p>
          </div>
        ))}
      </div>

      <p className="mt-8 max-w-3xl text-base leading-7 text-neutral-300">
        What buyers do today: set spend caps and ban tools. That stops the bill, not the waste,
        and it stops the agents too. A prior-auth or claims agent that nobody can bound or audit
        never clears compliance. The gap is a layer that lets cheap models do real work safely,
        with proof.
      </p>

      <div className="mt-8 grid gap-1.5 border-t border-white/10 pt-5">
        {sourceFootnotes.map((note) => (
          <p key={note} className="text-xs leading-5 text-neutral-500">
            {note}
          </p>
        ))}
      </div>
    </section>
  );
}

/* 3. Why now */

const whyNowCards: Array<[string, string]> = [
  [
    "Agents act",
    "Tool-calling agents are in production workflows: claims, prior auth, deployments. A mistake is now a transaction, not a wrong answer."
  ],
  [
    "Rules arrived",
    "EU AI Act high-risk rules land Dec 2027, and credit scoring is on the list; sector guidance in healthcare and finance. Governance is a procurement checkbox."
  ],
  [
    "Spend is visible",
    "Enterprise agent seats bill per token. 98% of FinOps teams now track AI spend, so there's an owner for the line."
  ],
  [
    "In-cloud is enough",
    "Small open models, and an open-weight frontier model (Muse Spark Open) that runs inside Bedrock, Vertex or Azure, make “nothing leaves your environment” real."
  ]
];

function WhyNowSection() {
  return (
    <Section
      id="why-now"
      eyebrow="Why now"
      title="Four shifts, one window"
      sub="All four happened in the last 18 months; together they make an in-cloud supervisor both necessary and possible."
    >
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {whyNowCards.map(([title, body]) => (
          <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#22d3ee]">{title}</p>
            <p className="mt-3 text-sm leading-6 text-neutral-300">{body}</p>
          </div>
        ))}
      </div>
      <p className="mt-8 max-w-3xl text-base leading-7 text-neutral-300">
        Two years ago this couldn&apos;t be built. Two years from now the gateways will have copied
        it. The window is 12&ndash;18 months.
      </p>
    </Section>
  );
}

/* 4. What Agent Sidecar is */

const pillars: Array<[string, string]> = [
  [
    "Governs",
    "You set the rules: which tools, which data, how much budget, when a human must approve. Sidecar enforces them on every step."
  ],
  [
    "Controls cost",
    "Each step runs on the smallest model that can do it. Loops and blind retries are stopped before they're billed."
  ],
  [
    "Proves it",
    "Every decision is logged: who, what, which rule, which model, what it cost. The audit trail compliance asks for."
  ]
];

function WhatItIsSection() {
  return (
    <Section
      id="product"
      eyebrow="Product"
      title="What Agent Sidecar is"
      sub="A platform that provides governance and cost controls for your team's AI agents, running inside your own cloud."
    >
      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        {pillars.map(([title, body]) => (
          <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-xl font-semibold text-white">{title}</p>
            <p className="mt-3 text-sm leading-6 text-neutral-300">{body}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-2xl border border-[#22d3ee]/20 bg-[#22d3ee]/[0.05] p-5">
        <p className="text-sm leading-6 text-neutral-200">
          Not just for developers: for anyone at the company using agentic tools who needs
          governance and cost controls. Works with the models and frameworks you already use;
          nothing leaves your environment.
        </p>
      </div>
    </Section>
  );
}

/* 5. How it works */

const components: Array<[string, string]> = [
  [
    "Router",
    "Reads each step and picks who handles it: the workflow's own model, or Muse Spark Open."
  ],
  [
    "Ensemble",
    "One small model per workflow, fine-tuned on your own traffic. Day one, everything goes to Muse Spark Open."
  ],
  [
    "Governance model",
    "Watches every call and tool use. Enforces your rules; blocks, pauses, or repairs; writes the log."
  ]
];

function HowItWorksSection() {
  return (
    <Section
      id="how-it-works"
      eyebrow="How it works"
      title="In the loop on every step, not on the sidelines"
      sub="A router, an ensemble learned from your workflows, and a governance model over it all."
    >
      <div className="mt-10 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.035] p-3">
        <div className="rounded-2xl border border-white/10 bg-[#050509] p-5 sm:p-6">
          <p className="w-fit rounded-full border border-[#22d3ee]/25 bg-[#22d3ee]/[0.06] px-3 py-1 font-mono text-xs text-[#22d3ee]">
            Your cloud account
          </p>
          <div className="mt-5 grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
            {components.map(([title, body], index) => (
              <div key={title} className="contents">
                {index > 0 ? (
                  <div className="grid place-items-center font-mono text-lg text-neutral-500">
                    <span className="hidden lg:block">&rarr;</span>
                    <span className="lg:hidden">&darr;</span>
                  </div>
                ) : null}
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                  <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#22d3ee]">{title}</p>
                  <p className="mt-3 text-sm leading-6 text-neutral-300">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

/* 6. Getting started */

const gettingStartedSteps: Array<[string, string]> = [
  [
    "Sign up, book a call",
    "Sign up on the site and pick a time. We deploy Sidecar in your account with you on the call."
  ],
  [
    "Set rules",
    "One YAML per workflow: allowed tools, what needs a human, budget per run. Your security team can read it."
  ],
  [
    "Hydrate",
    "Day one runs on Muse Spark Open. Each workflow then earns its own small model from your traffic."
  ]
];

const rulesFileLines: Array<[string, string]> = [
  ["workflow: claims-intake", "text-neutral-100"],
  ["allowed_tools:", "text-neutral-300"],
  ["  - read_claim", "text-emerald-200"],
  ["  - verify_coverage", "text-emerald-200"],
  ["  - draft_letter", "text-emerald-200"],
  ["needs_approval:", "text-neutral-300"],
  ["  - issue_payment   # over $500", "text-amber-200"],
  ["never_allowed:", "text-neutral-300"],
  ["  - export_csv", "text-red-200"],
  ["budget_per_run: $2.00", "text-neutral-100"]
];

const hydrationProgress: Array<[string, number]> = [
  ["Day 1", 0],
  ["Day 6", 24],
  ["Day 12", 52],
  ["Day 18", 71]
];

function GettingStartedSection() {
  return (
    <Section
      id="getting-started"
      eyebrow="Getting started"
      title="Install, then hydrate"
      sub="One setup call to install. Then Sidecar learns your workflows from your own traffic and takes over the routine steps."
    >
      <div className="mt-10 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="grid content-start gap-3">
          {gettingStartedSteps.map(([title, body], index) => (
            <div
              key={title}
              className="grid grid-cols-[42px_1fr] items-start gap-3 rounded-xl border border-white/10 bg-[#050509] p-4"
            >
              <span className="grid size-8 place-items-center rounded-lg bg-white/[0.04] font-mono text-xs text-neutral-400">
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="mt-1 text-sm leading-6 text-neutral-300">{body}</p>
              </div>
            </div>
          ))}
        </div>
        <div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#050509]">
              <div className="border-b border-white/10 px-4 py-3">
                <p className="font-mono text-xs text-neutral-500">claims-intake.rules.yml</p>
              </div>
              <div className="grid gap-1 p-4 font-mono text-xs leading-5">
                {rulesFileLines.map(([line, color]) => (
                  <p key={line} className={`whitespace-pre ${color}`}>
                    {line}
                  </p>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#050509] p-4">
              <p className="font-mono text-xs text-neutral-500">Hydration &middot; claims-intake</p>
              <p className="mt-3 text-sm leading-6 text-neutral-300">
                Share of steps on the workflow&apos;s own model
              </p>
              <div className="mt-4 grid gap-3">
                {hydrationProgress.map(([label, pct]) => (
                  <div key={label} className="grid grid-cols-[52px_1fr_38px] items-center gap-3">
                    <span className="font-mono text-[11px] text-neutral-500">{label}</span>
                    <span className="block h-2 overflow-hidden rounded-full bg-white/10">
                      <span
                        className="block h-full rounded-full bg-[#22d3ee]"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="text-right font-mono text-[11px] text-neutral-300">{pct}%</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs leading-5 text-neutral-500">
                71% of claims-intake steps on its own model by day 18.
              </p>
            </div>
          </div>
          <MockupCaption />
        </div>
      </div>
    </Section>
  );
}

/* 7. A run, end to end */

const runSteps: Array<[string, string]> = [
  [
    "Prompt",
    "The user types what they always type. Same chat, same tools; Sidecar shows up only when a rule fires."
  ],
  [
    "Route",
    "The router sends each step to the workflow's own model, or to Muse Spark Open when confidence is low."
  ],
  [
    "Govern and log",
    "The governance model allows, blocks, or pauses every call. Each step is logged with rule, model, and cost."
  ]
];

function RunSection() {
  const demoDuration = 25;
  const [demoPaused, setDemoPaused] = useState(true);
  const [demoRunId, setDemoRunId] = useState(0);
  const [demoTime, setDemoTime] = useState(0);
  const progressRef = useRef<any>(null);
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
  const finalSceneClass = demoTime >= 18 ? "grid opacity-100" : "hidden opacity-0";
  const showAt = (time: number) => demoTime >= time;
  const promptProgress = Math.min(Math.max((demoTime - 0.7) / 2.8, 0), 1);
  const promptText = "Work through today's claims queue and draft the denial letters.";
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

  const routedSteps: Array<[string, string, string, string]> = [
    ["triage claim #4411", "claims-intake model", "$0.02", "text-emerald-200"],
    ["verify coverage", "claims-intake model", "$0.03", "text-emerald-200"],
    ["summarize history", "claims-intake model", "$0.02", "text-emerald-200"],
    ["draft denial letter · low confidence", "Muse Spark Open", "$0.38", "text-[#67e8f9]"]
  ];

  const logRows: Array<[string, string, string, string]> = [
    ["triage claim #4411", "allowed", "claims-intake model · $0.02", "text-emerald-200"],
    ["draft denial letter", "routed up", "Muse Spark Open · $0.38", "text-[#67e8f9]"],
    ["export_csv", "blocked · deny list", "no model call · $0.00", "text-red-200"],
    ["issue_payment $740", "approved by K. Patel", "from Slack · $0.01", "text-amber-200"]
  ];

  return (
    <Section
      id="demo"
      eyebrow="A run, end to end"
      title="One prompt, end to end"
      sub="The user types a prompt. The router picks a model per step, the governance model watches every call, the log keeps it all."
    >
      <div className="mt-8 grid gap-3 lg:grid-cols-3">
        {runSteps.map(([title, body], index) => (
          <div
            key={title}
            className="grid grid-cols-[42px_1fr] items-start gap-3 rounded-xl border border-white/10 bg-[#050509] p-4"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-white/[0.04] font-mono text-xs text-neutral-400">
              {index + 1}
            </span>
            <div>
              <p className="text-sm font-semibold text-white">{title}</p>
              <p className="mt-1 text-sm leading-6 text-neutral-300">{body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.035] p-3 shadow-2xl shadow-[#22d3ee]/10">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#050509]">
          <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-red-400/80" />
              <span className="size-2 rounded-full bg-amber-300/80" />
              <span className="size-2 rounded-full bg-emerald-300/80" />
              <span className="ml-3 font-mono text-xs uppercase tracking-[0.18em] text-neutral-500">claims desk</span>
            </div>
            <span className="w-fit rounded-full border border-[#22d3ee]/25 bg-[#22d3ee]/[0.06] px-3 py-1 font-mono text-xs text-[#22d3ee]">
              Sidecar supervising
            </span>
          </div>

          <div className={`demo-stage-bg relative p-4 sm:p-6 ${demoPaused ? "demo-video-paused" : ""}`}>
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
              <div className={`${sceneClass(0, 6)} absolute inset-0 place-items-center p-5 transition-opacity duration-300`}>
                <div className="w-full max-w-4xl">
                  <PhaseHeading
                    title="Prompt"
                    body="The user types what they always type. Same chat, same tools."
                  />
                  <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#08080d] shadow-2xl shadow-black/30">
                    <div className="border-b border-white/10 bg-[#050509] px-4 py-3">
                      <p className="font-mono text-xs uppercase tracking-[0.18em] text-neutral-500">claims assistant</p>
                    </div>
                    <div className="p-5">
                      <div className="rounded-xl border border-white/10 bg-[#050509] p-4 text-sm leading-6 text-neutral-100">
                        <span>{typedPrompt}</span>
                        <span className="ml-0.5 inline-block h-4 w-1 translate-y-0.5 bg-[#22d3ee]" />
                      </div>
                      <div className="mt-3 grid gap-2 rounded-2xl border border-white/10 bg-black/20 p-4 font-mono text-xs text-neutral-300">
                        <p className={`${showAt(3.6) ? "opacity-100" : "opacity-0"} transition`}>12 claims in queue</p>
                        <p className={`${showAt(4.4) ? "opacity-100" : "opacity-0"} transition`}>2 flagged for denial letters</p>
                        <p className={`${showAt(5.2) ? "opacity-100" : "opacity-0"} transition text-[#67e8f9]`}>
                          sidecar: run plan built, 14 steps
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${sceneClass(6, 12)} absolute inset-0 place-items-center p-5 transition-opacity duration-300`}>
                <div className="w-full max-w-4xl">
                  <PhaseHeading
                    title="Route"
                    body="Routine steps stay on the workflow's own model at cents each. Low-confidence steps go to Muse Spark Open."
                  />
                  <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#050509] shadow-2xl shadow-black/30">
                    <div className="border-b border-white/10 px-5 py-3">
                      <p className="font-mono text-xs uppercase tracking-[0.18em] text-neutral-500">router</p>
                    </div>
                    <div className="grid gap-2 p-5">
                      {routedSteps.map(([step, model, cost, color], index) => (
                        <div
                          key={step}
                          className={`grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3 transition duration-300 sm:grid-cols-[1fr_200px_60px] ${
                            showAt(6.6 + index * 0.9) ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
                          }`}
                        >
                          <span className="font-mono text-xs text-neutral-200">{step}</span>
                          <span className={`hidden font-mono text-xs sm:block ${color}`}>{model}</span>
                          <span className="text-right font-mono text-xs text-neutral-300">{cost}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${sceneClass(12, 18)} absolute inset-0 place-items-center p-5 transition-opacity duration-300`}>
                <div className="w-full max-w-4xl">
                  <PhaseHeading
                    title="Govern"
                    body="The governance model allows, blocks, or pauses every call against your rules."
                  />
                  <div className="mt-4 grid gap-3">
                    <div
                      className={`rounded-2xl border border-red-300/20 bg-red-300/[0.05] p-4 transition duration-300 ${
                        showAt(12.6) ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
                      }`}
                    >
                      <p className="font-mono text-xs uppercase tracking-[0.16em] text-red-200">blocked</p>
                      <p className="mt-2 font-mono text-sm text-neutral-100">export_csv</p>
                      <p className="mt-1 text-sm leading-6 text-neutral-300">
                        On the deny list for claims-intake. The call never runs; the run continues.
                      </p>
                    </div>
                    <div
                      className={`rounded-2xl border border-amber-300/20 bg-amber-300/[0.05] p-4 transition duration-300 ${
                        showAt(14.2) ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
                      }`}
                    >
                      <p className="font-mono text-xs uppercase tracking-[0.16em] text-amber-200">paused for approval</p>
                      <p className="mt-2 font-mono text-sm text-neutral-100">issue_payment &middot; $740</p>
                      <p className="mt-1 text-sm leading-6 text-neutral-300">
                        Over the $500 approval line. A person is notified in Slack.
                      </p>
                      <p
                        className={`mt-3 w-fit rounded-full border border-emerald-300/25 bg-emerald-300/[0.08] px-3 py-1 font-mono text-xs text-emerald-200 transition duration-300 ${
                          showAt(16.2) ? "opacity-100" : "opacity-0"
                        }`}
                      >
                        approved from Slack
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${finalSceneClass} absolute inset-0 place-items-center p-5 transition-opacity duration-300`}>
                <div className="w-full max-w-5xl">
                  <PhaseHeading title="Logged" body="The run ends. Every decision is in the log." />
                  <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#050509] shadow-2xl shadow-black/30">
                    <div className="grid gap-2 p-5">
                      {logRows.map(([step, outcome, detail, color], index) => (
                        <div
                          key={step}
                          className={`grid gap-1 rounded-xl border border-white/10 bg-black/25 px-4 py-3 transition duration-300 sm:grid-cols-[1fr_190px_210px] sm:items-center ${
                            showAt(18.6 + index * 0.6) ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
                          }`}
                        >
                          <span className="font-mono text-xs text-neutral-200">{step}</span>
                          <span className={`font-mono text-xs ${color}`}>{outcome}</span>
                          <span className="font-mono text-xs text-neutral-500 sm:text-right">{detail}</span>
                        </div>
                      ))}
                    </div>
                    <div
                      className={`grid gap-2 border-t border-white/10 bg-emerald-300/[0.05] px-5 py-4 transition duration-300 sm:grid-cols-[1fr_auto] sm:items-center ${
                        showAt(21.4) ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-neutral-400">
                        Run total &middot; vs $2.10 if every step had gone to Muse Spark Open
                      </p>
                      <p className="font-mono text-xl font-semibold text-emerald-300">$1.03</p>
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
      <MockupCaption />

      <div className="mt-6 rounded-2xl border border-[#22d3ee]/20 bg-[#22d3ee]/[0.05] p-5">
        <p className="text-sm leading-6 text-neutral-200">
          Humans only when needed. The governance model and your hard rules decide when a person
          must step in. People are notified when something needs intervention, not asked to
          approve everything.
        </p>
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

/* 8. The dashboard */

const dashboardFeatures: Array<[string, string]> = [
  [
    "Cost and routing",
    "Spend against the all-frontier default, and how much of each workflow its own model now carries."
  ],
  [
    "Approvals",
    "Paused actions wait here or in Slack. One click; the decision and who made it go in the log."
  ],
  [
    "Decision log",
    "Every call: who, what, which rule, which model, cost. One button exports it for the auditor."
  ]
];

function DashboardSection() {
  return (
    <Section
      id="dashboard"
      eyebrow="Dashboard"
      title="Everything, on one screen"
      sub="What the platform team and the auditor see: seats, spend vs default, routing, approvals, and every decision logged."
    >
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {dashboardFeatures.map(([title, body]) => (
          <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#22d3ee]">{title}</p>
            <p className="mt-3 text-sm leading-6 text-neutral-300">{body}</p>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <DashboardMockup />
        <MockupCaption />
      </div>
    </Section>
  );
}

function DashboardMockup() {
  const nav = ["Overview", "Routing", "Approvals", "Decision log", "Settings"];
  const statTiles: Array<[string, string]> = [
    ["seats", "180"],
    ["cost vs default", "-51%"],
    ["steps on workflow models", "71%"],
    ["calls checked", "4,812"],
    ["blocked / repaired", "17 / 41"],
    ["approvals waiting", "3"]
  ];
  const spendDays: Array<[number, number]> = [
    [78, 44],
    [84, 46],
    [72, 38],
    [90, 47],
    [82, 40],
    [66, 31],
    [74, 35]
  ];
  const routingRows: Array<[string, number]> = [
    ["claims-intake", 71],
    ["prior-auth", 54],
    ["deploy-helper", 38]
  ];
  const logRows: Array<[string, string, string, string]> = [
    ["j.alvarez", "draft_letter", "claims-intake · $0.02", "allowed"],
    ["agent:prior-auth", "export_csv", "deny list · $0.00", "blocked"],
    ["k.patel", "issue_payment $740", "approval rule · $0.01", "approved"]
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
          <span className="font-mono text-xs text-neutral-500">Agent Sidecar console</span>
        </div>

        <div className="dashboard-preview-bg grid min-h-[520px] md:grid-cols-[190px_1fr]">
          <aside className="border-b border-white/10 p-4 md:border-b-0 md:border-r">
            <div className="flex items-center gap-3">
              <span className="relative grid size-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04]">
                <span className="font-mono text-xs text-[#22d3ee]">AS</span>
              </span>
              <div>
                <p className="text-sm font-semibold">Agent Sidecar</p>
                <p className="font-mono text-[11px] text-neutral-500">platform team</p>
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
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {statTiles.map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-500">{label}</p>
                  <p className="mt-2 text-lg font-semibold">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-500">
                  spend vs default, by day
                </p>
                <div className="mt-4 flex h-28 items-end gap-2">
                  {spendDays.map(([defaultH, actualH], index) => (
                    <div key={index} className="flex flex-1 items-end justify-center gap-1">
                      <span className="w-2.5 rounded-t bg-white/15" style={{ height: `${defaultH}%` }} />
                      <span className="w-2.5 rounded-t bg-[#22d3ee]" style={{ height: `${actualH}%` }} />
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-4 font-mono text-[10px] text-neutral-500">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-sm bg-white/15" /> all-frontier default
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-sm bg-[#22d3ee]" /> with Sidecar
                  </span>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-500">
                  routing by workflow &middot; share on own model
                </p>
                <div className="mt-4 grid gap-3">
                  {routingRows.map(([workflow, pct]) => (
                    <div key={workflow} className="grid grid-cols-[110px_1fr_38px] items-center gap-3">
                      <span className="font-mono text-[11px] text-neutral-300">{workflow}</span>
                      <span className="block h-2 overflow-hidden rounded-full bg-white/10">
                        <span className="block h-full rounded-full bg-[#22d3ee]" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="text-right font-mono text-[11px] text-neutral-300">{pct}%</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-amber-200">approvals queue</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-neutral-200">issue_payment &middot; $740 &middot; claims-intake</span>
                    <span className="rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 font-mono text-[10px] text-neutral-200">
                      Approve
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-500">decision log</p>
                <span className="rounded-lg border border-[#22d3ee]/25 bg-[#22d3ee]/[0.08] px-3 py-1.5 font-mono text-[10px] text-[#9be8f4]">
                  Export for auditor
                </span>
              </div>
              <div className="mt-3 grid gap-2">
                {logRows.map(([who, what, detail, status]) => (
                  <div
                    key={`${who}-${what}`}
                    className="grid gap-1 rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 font-mono text-[11px] sm:grid-cols-[120px_1fr_170px_80px] sm:items-center"
                  >
                    <span className="text-neutral-400">{who}</span>
                    <span className="text-neutral-200">{what}</span>
                    <span className="text-neutral-500">{detail}</span>
                    <span
                      className={
                        status === "blocked"
                          ? "text-red-200"
                          : status === "approved"
                            ? "text-amber-200"
                            : "text-emerald-200"
                      }
                    >
                      {status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* 9. Privacy */

function PrivacySection() {
  const staysItems = [
    ["Prompts", "Every prompt and completion stays inside your cloud account"],
    ["Data and keys", "Customer data, credentials, and API keys never transit to us"],
    ["Tool calls", "Agent tool calls run and are checked inside your environment"],
    ["All models", "Every model, including Muse Spark Open, runs on your compute"],
    ["Fine-tuned weights", "Workflow models trained on your traffic stay yours, in your account"],
    ["Logs", "The decision log is stored in your cloud, exported only by you"]
  ] as const;
  const reachesItems = [
    ["Usage counts", "Seat and usage counts for billing. Nothing else. We never host a model."]
  ] as const;

  return (
    <section id="privacy" className="mx-auto max-w-7xl px-5 py-16 sm:px-7 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-3xl">
          <Badge>Privacy boundary</Badge>
          <h2 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            Nothing leaves your environment
          </h2>
          <p className="mt-4 text-base leading-7 text-neutral-300 sm:text-lg">
            Prompts, data, keys, tool calls, and every model, including the fine-tuned weights,
            stay in your cloud account. Only usage counts reach us. We never host a model.
          </p>
        </div>
      </div>
      <div className="mt-10">
        <div className="relative mx-auto w-full max-w-6xl overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.035] p-4 text-left text-white shadow-2xl shadow-[#7c5cff]/10 backdrop-blur">
          <div className="card-radial-overlay absolute inset-0" />
          <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[#07070b]/90 p-5">
            <div className="grid gap-4 lg:grid-cols-2">
              <VisibilityPanel
                title="Stays in your cloud"
                tone="emerald"
                summary="Everything the agents see, do, and learn stays in your account."
                items={staysItems}
              />
              <VisibilityPanel
                title="Reaches Agent Sidecar"
                tone="cyan"
                summary="Usage counts only."
                items={reachesItems}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function VisibilityPanel({
  title,
  tone,
  summary,
  items
}: {
  title: string;
  tone: "emerald" | "cyan";
  summary: string;
  items: readonly (readonly [string, string])[];
}) {
  const isEmerald = tone === "emerald";
  const panel = isEmerald ? "border-emerald-300/30 bg-emerald-300/[0.075]" : "border-[#22d3ee]/30 bg-[#22d3ee]/[0.075]";
  const label = isEmerald ? "bg-emerald-300 text-[#03170b]" : "bg-[#22d3ee] text-[#032026]";
  const dot = isEmerald ? "bg-emerald-300 shadow-emerald-300/30" : "bg-[#22d3ee] shadow-[#22d3ee]/30";
  const text = isEmerald ? "text-emerald-100" : "text-[#c3f2fb]";

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

/* 10. What it costs to run */

const costCards: Array<[string, string]> = [
  [
    "Small models",
    "Most steps run on 1–8B open models. They're cheap to run and more than enough for sorting, checking, and routine work; Muse Spark Open is reserved for the hard few percent."
  ],
  [
    "Your existing compute",
    "Configured on what you already run: Bedrock, SageMaker, Vertex Model Garden, Azure Foundry, or your own GPUs. Muse Spark Open is hosted there too. No data leaving, no bill from us for inference."
  ],
  [
    "Near zero",
    "What Sidecar adds is a small supervisor service and log storage. On capacity you've already paid for, the added cost is close to nothing, and the model work it removes is far larger."
  ]
];

function CostToRunSection() {
  return (
    <Section
      id="cost-to-run"
      eyebrow="Running cost"
      title="Near-zero added cost on your own cloud"
      sub="Small models, configured to run on your existing compute. Nothing new to buy, nothing hosted by us."
    >
      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        {costCards.map(([title, body]) => (
          <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-xl font-semibold text-white">{title}</p>
            <p className="mt-3 text-sm leading-6 text-neutral-300">{body}</p>
          </div>
        ))}
      </div>
      <p className="mt-8 text-base leading-7 text-neutral-300">
        It runs on your cloud, on small models, at near-zero added cost.
      </p>
    </Section>
  );
}

/* 11. Compare */

const compareColumns = [
  "Understudy Labs (YC S26)",
  "ReasonBlocks (YC S26)",
  "Routers (OpenRouter, LiteLLM)",
  "Agent Sidecar"
] as const;

const compareRows: Array<[string, boolean, boolean, boolean, boolean]> = [
  ["Small models trained on your own workflows", true, false, false, true],
  ["Works across vendors and frameworks", true, true, true, true],
  ["Savings shown per request vs the default model", true, true, false, true],
  ["Steers and repairs a failing run", false, true, false, true],
  ["Runs inside the customer's cloud", true, false, false, true],
  ["Hard rules on tools, data, budgets, approvals", false, false, false, true],
  ["A governance model watching every tool call", false, false, false, true]
];

function CompareSection() {
  return (
    <Section
      id="compare"
      eyebrow="Compare"
      title="Others cut the bill. Nobody adds governance"
      sub="Understudy and ReasonBlocks cut the bill. Routers pick a model. None of them govern what the agent may do."
    >
      <div className="mt-10 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.035]">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-4 py-4 font-mono text-xs font-normal uppercase tracking-[0.14em] text-neutral-500">
                Capability
              </th>
              {compareColumns.map((column) => (
                <th
                  key={column}
                  className={`px-4 py-4 text-xs font-semibold ${
                    column === "Agent Sidecar" ? "text-[#22d3ee]" : "text-neutral-300"
                  }`}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {compareRows.map(([capability, ...values]) => (
              <tr key={capability} className="border-b border-white/5 last:border-b-0">
                <td className="px-4 py-3.5 text-sm leading-6 text-neutral-200">{capability}</td>
                {values.map((value, index) => (
                  <td
                    key={`${capability}-${compareColumns[index]}`}
                    className={`px-4 py-3.5 ${index === values.length - 1 ? "bg-[#22d3ee]/[0.04]" : ""}`}
                  >
                    {value ? (
                      <Check size={16} className="text-emerald-300" aria-label="Yes" />
                    ) : (
                      <Minus size={16} className="text-neutral-600" aria-label="No" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/* 12. Pricing */

const pricingFlow: Array<[string, string]> = [
  ["Install", "A setup call with our team; Sidecar goes in front of your models and tools."],
  ["Subscribe", "Per seat, month to month or annual paid up front."],
  ["Expand", "Every new person or agent workflow is one more seat."]
];

const whyThisPrice: Array<[string, string]> = [
  [
    "51% lower model cost on SWE-bench Lite",
    "At $100/mo of agent spend, about $50 saved for $19, paid back in two weeks."
  ],
  [
    "Governance comes with the seat",
    "Rules, approvals, and the audit log, the part compliance needs before anything ships. Not a second product to buy."
  ],
  [
    "Usage allowance included",
    "Each seat includes a usage allowance; heavy workloads step up a tier."
  ]
];

function PricingSection() {
  return (
    <Section
      id="pricing"
      eyebrow="Pricing"
      title="Per-seat subscriptions"
      sub="A seat is one person using AI agents or models, or one production agent workflow. Monthly or annual."
    >
      <div className="mt-10 grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
        {pricingFlow.map(([title, body], index) => (
          <div key={title} className="contents">
            {index > 0 ? (
              <div className="grid place-items-center font-mono text-lg text-neutral-500">
                <span className="hidden lg:block">&rarr;</span>
                <span className="lg:hidden">&darr;</span>
              </div>
            ) : null}
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#22d3ee]">{title}</p>
              <p className="mt-3 text-sm leading-6 text-neutral-300">{body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[28px] border border-[#22d3ee]/25 bg-[#22d3ee]/[0.05] p-7">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#22d3ee]">Enterprise</p>
          <p className="mt-4 text-5xl font-semibold">
            $19
            <span className="ml-2 text-base font-normal text-neutral-400">per seat / month</span>
          </p>
          <p className="mt-3 text-sm leading-6 text-neutral-300">
            Anyone using agents or models, plus production agents.
          </p>
          <div className="mt-5 grid gap-2.5">
            {["Rules, budgets, approvals", "Repair", "Audit export", "SSO", "In-cloud install"].map((item) => (
              <p key={item} className="flex items-center gap-2.5 text-sm text-neutral-200">
                <Check size={15} className="shrink-0 text-emerald-300" />
                {item}
              </p>
            ))}
          </div>
          <p className="mt-5 text-xs leading-5 text-neutral-500">
            Monthly or annual. Matches Copilot Business.
          </p>
          <div className="mt-6">
            <CtaButtons />
          </div>
        </div>
        <div className="grid content-start gap-3">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-neutral-500">Why this price</p>
          {whyThisPrice.map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
              <p className="text-sm font-semibold text-white">{title}</p>
              <p className="mt-2 text-sm leading-6 text-neutral-300">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* 13. Who it's for */

function WhoItsForSection() {
  return (
    <Section id="who-its-for" eyebrow="Who it's for" title="Built for regulated enterprises">
      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#22d3ee]">The company</p>
          <p className="mt-3 text-sm leading-7 text-neutral-300">
            Large enterprises, healthcare and financial services first, with cloud infrastructure
            already in place (AWS, Azure, or GCP) and AI agents acting on real systems: claims,
            prior auth, customer data, internal tools.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#22d3ee]">The buyer</p>
          <p className="mt-3 text-sm leading-7 text-neutral-300">
            The platform or security leader who owns agent rollout; the gatekeeper is compliance,
            who needs an audit trail before anything ships.
          </p>
        </div>
      </div>
    </Section>
  );
}

/* 14. Closing call to action */

function ClosingSection() {
  return (
    <section className="mx-auto max-w-7xl px-5 py-20 text-center sm:px-7 lg:px-10">
      <h2 className="mx-auto max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">
        Sidecar is a platform that provides governance and cost controls for your team&apos;s AI
        agents.
      </h2>
      <div className="mt-8 flex justify-center">
        <CtaButtons center />
      </div>
    </section>
  );
}
