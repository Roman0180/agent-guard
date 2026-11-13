"use client";

import { BOOKING_URL, Footer, Navbar, Section } from "../components/site";

const marketTiles: Array<[string, string, string]> = [
  ["$3T", "TAM", "Global enterprise software and AI spend."],
  [
    "$185B",
    "SAM (2029)",
    "Paid AI coding tools and agentic platform seats. $90B today, growing about 27% a year as agents spread from coding to office work."
  ],
  [
    "$3B",
    "SOM",
    "Enterprise spend on agentic coding and production agent workflows at large enterprises, the accounts we can reach: about 750K seats (people using agents or models, plus production workflows) × about $4,000/yr."
  ]
];

const burnRows: Array<[string, string, string]> = [
  ["Engineering", "$9,000", "US contract engineer, about 110 hrs/mo at $75–90/hr"],
  ["Go-to-market", "$4,000", "Apollo $150, enterprise travel $1.5K, events and content $1K, campaigns $1.35K"],
  ["Onboarding and support", "$2,000", "Setup calls, customer service; about 25 hrs/mo contract at about $80/hr"],
  ["Legal and accounting", "$1,000", "Including insurance"],
  ["Our cloud", "$1,000", "Seat checks, usage counts, builds, demo site"],
  ["Model inference", "$0", "All models run locally in the customer's cloud"],
  ["Serving customers", "about $0", "Roughly $0.50 per seat for logs and control plane"]
];

const oneTimeCosts: Array<[string, string]> = [
  ["Product design (dashboard, onboarding, rule editor; fixed fee, about 350 hrs)", "$30K up front"],
  ["SOC 2 Type I → II, at first regulated contract", "$20K"],
  ["Security review and pen test", "$5–15K"],
  ["Legal (contracts, trademark, fundraising counsel)", "$50K"]
];

const keyNumbers: Array<[string, string]> = [
  ["about 14 months", "runway on $350K after one-time costs"],
  ["about 900 seats", "to break even (about eighteen customers of 50 seats)"],
  ["about 97%", "gross margin per seat"],
  ["about $5K", "CAC per 50-seat account"],
  ["$456K ARR", "at 2,000 seats"],
  ["about $250K", "net profit per year at 2,000 seats"]
];

const raiseTiles: Array<[string, string]> = [
  ["$350K", "Pre-seed on a post-money SAFE. Standard terms, no board seat. Closing this quarter."],
  ["$5M", "Post-money valuation cap. Priced for a pre-revenue, regulated-first infrastructure company."],
  ["7%", "Stake to this round ($350K ÷ $5M). Founders carry the dilution; the accelerator's 2% sits outside the SAFE."]
];

export default function InvestorsPage() {
  return (
    <main className="website-shell min-h-screen overflow-x-hidden bg-[#07070b] text-white">
      <Navbar />

      <Section
        id="market"
        eyebrow="Market"
        title="A growing spend line with an owner"
        sub="Enterprise AI spend is compounding, and agent seats are now billed per token."
      >
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {marketTiles.map(([value, label, body]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-neutral-500">{label}</p>
              <p className="mt-2 text-4xl font-semibold text-[#22d3ee]">{value}</p>
              <p className="mt-4 text-sm leading-6 text-neutral-300">{body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="unit-economics" eyebrow="Unit economics" title="Monthly burn, $17,000 total">
        <div className="mt-10 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
            {burnRows.map(([label, value, detail]) => (
              <div
                key={label}
                className="grid gap-1 border-b border-white/5 px-5 py-4 last:border-b-0 sm:grid-cols-[180px_90px_1fr] sm:items-baseline"
              >
                <p className="text-sm font-semibold text-white">{label}</p>
                <p className="font-mono text-sm text-[#22d3ee]">{value}</p>
                <p className="text-sm leading-6 text-neutral-400">{detail}</p>
              </div>
            ))}
          </div>
          <div className="grid content-start gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-neutral-500">One-time costs</p>
              <div className="mt-4 grid gap-3">
                {oneTimeCosts.map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-4">
                    <p className="text-sm leading-6 text-neutral-300">{label}</p>
                    <p className="shrink-0 font-mono text-sm text-neutral-100">{value}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-[#22d3ee]/20 bg-[#22d3ee]/[0.05] p-5">
              <p className="text-sm leading-6 text-neutral-200">
                Target customers buy hundreds to thousands of seats.
              </p>
              <p className="mt-3 text-sm leading-6 text-neutral-200">
                The customer&apos;s cloud covers inference, compute, and logs. We never host a
                model.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {keyNumbers.map(([value, label]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
              <p className="text-xl font-semibold text-white">{value}</p>
              <p className="mt-1 text-sm leading-6 text-neutral-400">{label}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="raise"
        eyebrow="The raise"
        title="$350K pre-seed at a $5M post-money cap"
        sub="Fourteen months of runway to a working MVP, SOC 2, and first paid seats in a regulated account."
      >
        <p className="mt-8 max-w-3xl text-base leading-7 text-neutral-200">
          What it buys: the first 5,000 seats on a validated, fully working, enterprise-grade
          product, end to end.
        </p>
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {raiseTiles.map(([value, body]) => (
            <div key={value} className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
              <p className="text-4xl font-semibold text-[#22d3ee]">{value}</p>
              <p className="mt-4 text-sm leading-6 text-neutral-300">{body}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-sm leading-6 text-neutral-300">
          Use of funds: MVP, SOC 2, onboarding, and the first regulated pilots.
        </p>
        <a
          href={BOOKING_URL}
          className="mt-6 inline-block rounded-xl bg-white px-6 py-3 text-sm font-semibold text-[#07070b] transition hover:bg-neutral-200"
        >
          Talk to the founder
        </a>
      </Section>

      <Footer />
    </main>
  );
}
