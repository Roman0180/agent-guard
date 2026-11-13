"use client";

import { Badge, CtaButtons, Footer, Navbar } from "../components/site";

const background: Array<[string, string]> = [
  ["Microsoft", "Software Engineer II, Sep 2023 – present, 3 years full-time"],
  ["Apple", "Software Engineering Intern, May – Aug 2023"],
  ["Stanford", "M.S. Computer Science, AI specialization, 2025 – 2027, current student"]
];

export default function CompanyPage() {
  return (
    <main className="website-shell min-h-screen overflow-x-hidden bg-[#07070b] text-white">
      <Navbar />
      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-7 lg:px-10">
        <div className="max-w-3xl">
          <Badge>Company</Badge>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            Agent Sidecar, Inc.
          </h1>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.035] p-7">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#22d3ee]">Founder</p>
            <h2 className="mt-3 text-2xl font-semibold">Roman Gasiorowski</h2>
            <p className="mt-1 text-sm text-neutral-400">Founder &amp; CEO, Agent Sidecar, Inc.</p>
            <a
              href="https://linkedin.com/in/rgasiorowski01"
              className="mt-3 inline-block text-sm text-[#22d3ee] transition hover:text-white"
            >
              LinkedIn
            </a>
            <div className="mt-6 grid gap-3">
              {background.map(([org, detail]) => (
                <div key={org} className="rounded-xl border border-white/10 bg-[#050509] p-4">
                  <p className="text-sm font-semibold text-white">{org}</p>
                  <p className="mt-1 text-sm leading-6 text-neutral-300">{detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid content-start gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-neutral-500">Team</p>
              <p className="mt-3 text-sm leading-6 text-neutral-300">Co-founder, in conversation.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-neutral-500">Accelerator</p>
              <p className="mt-3 text-sm leading-6 text-neutral-300">TheThinkTankVC.</p>
            </div>
            <div className="rounded-2xl border border-[#22d3ee]/20 bg-[#22d3ee]/[0.05] p-6">
              <p className="text-sm leading-6 text-neutral-200">
                Governance and cost controls for your team&apos;s AI agents, running inside your
                own cloud.
              </p>
              <div className="mt-5">
                <CtaButtons />
              </div>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
