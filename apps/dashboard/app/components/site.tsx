"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Bot, Code2, Menu, X } from "lucide-react";

export const BOOKING_URL = "https://cal.com/roman-gasiorowski/30min";
export const CONTACT_EMAIL = "contact@agent-sidecar.com";

export const navItems = [
  ["Product", "/#product"],
  ["How it works", "/#how-it-works"],
  ["Pricing", "/#pricing"],
  ["Privacy", "/#privacy"],
  ["Compare", "/#compare"],
  ["Company", "/company"],
  ["Investors", "/investors"]
] as const;

export const sourceFootnotes = [
  "1. Deloitte Insights, “AI agents are scaling faster than their guardrails,” Apr 2026 (State of AI in the Enterprise, Jan 2026)",
  "2. Linux Foundation / FinOps Foundation press release, Feb 19 2026",
  "3. Regulation (EU) 2024/1689 as amended by Regulation (EU) 2026/1744 (AI Omnibus, in force 27 Jul 2026). Annex III high-risk obligations apply from 2 Dec 2027"
] as const;

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07070b]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-7 lg:px-10">
        <a href="/" className="flex items-center gap-3">
          <LogoMark />
          <span className="text-sm font-semibold tracking-wide">Agent Sidecar</span>
        </a>
        <nav className="hidden items-center gap-6 text-sm text-neutral-300 lg:flex">
          {navItems.map(([label, href]) => (
            <a key={label} href={href} className="transition hover:text-white">
              {label}
            </a>
          ))}
          <a
            href={BOOKING_URL}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#07070b] transition hover:bg-neutral-200"
          >
            Book a setup call
          </a>
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
            <a
              href={BOOKING_URL}
              className="rounded-lg bg-white px-4 py-3 text-center text-sm font-semibold text-[#07070b]"
            >
              Book a setup call
            </a>
          </div>
        </div>
      ) : null}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#050509]">
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-7 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.9fr_0.9fr]">
          <div>
            <div className="flex items-center gap-3">
              <LogoMark />
              <span className="text-sm font-semibold tracking-wide">Agent Sidecar, Inc.</span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-6 text-neutral-400">
              Governance and cost controls for your team&apos;s AI agents, running inside your own cloud.
            </p>
          </div>
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-neutral-500">Navigate</p>
            <div className="mt-4 grid gap-2 text-sm text-neutral-300">
              {navItems.map(([label, href]) => (
                <a key={label} href={href} className="w-fit transition hover:text-white">
                  {label}
                </a>
              ))}
            </div>
          </div>
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-neutral-500">Contact</p>
            <div className="mt-4 grid gap-2 text-sm text-neutral-300">
              <a href={`mailto:${CONTACT_EMAIL}`} className="w-fit transition hover:text-white">
                {CONTACT_EMAIL}
              </a>
              <a href={BOOKING_URL} className="w-fit transition hover:text-white">
                Book a setup call
              </a>
            </div>
          </div>
        </div>
        <div className="mt-10 border-t border-white/10 pt-6">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-neutral-500">Sources</p>
          <div className="mt-3 grid gap-1.5">
            {sourceFootnotes.map((note) => (
              <p key={note} className="text-xs leading-5 text-neutral-500">
                {note}
              </p>
            ))}
          </div>
          <p className="mt-6 text-xs text-neutral-600">
            &copy; {new Date().getFullYear()} Agent Sidecar, Inc.
          </p>
        </div>
      </div>
    </footer>
  );
}

export function CtaButtons({ center }: { center?: boolean }) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row ${center ? "justify-center" : ""}`}>
      <a
        href={BOOKING_URL}
        className="rounded-xl bg-white px-6 py-3 text-center text-sm font-semibold text-[#07070b] transition hover:bg-neutral-200"
      >
        Book a setup call
      </a>
      <a
        href={`mailto:${CONTACT_EMAIL}`}
        className="rounded-xl border border-white/15 bg-white/[0.04] px-6 py-3 text-center text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/[0.08]"
      >
        Contact us
      </a>
    </div>
  );
}

export function MockupCaption() {
  return (
    <p className="mt-3 text-center font-mono text-[11px] text-neutral-500">
      Mockup. Names and numbers are illustrative.
    </p>
  );
}

export function Section({
  id,
  eyebrow,
  title,
  sub,
  children
}: {
  id: string;
  eyebrow: string;
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mx-auto max-w-7xl px-5 py-16 sm:px-7 lg:px-10">
      <div className="max-w-3xl">
        <Badge>{eyebrow}</Badge>
        <h2 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">{title}</h2>
        {sub ? <p className="mt-4 text-base leading-7 text-neutral-300 sm:text-lg">{sub}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-xs text-neutral-200">
      <Code2 size={12} className="text-[#22d3ee]" />
      {children}
    </span>
  );
}

export function LogoMark() {
  return (
    <span className="relative grid size-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04]">
      <Bot size={19} />
      <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[#22d3ee]" />
    </span>
  );
}
