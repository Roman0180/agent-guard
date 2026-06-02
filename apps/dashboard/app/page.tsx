import type { ReactNode } from "react";
import { BookOpen, Code2, Route, ShieldCheck, Zap } from "lucide-react";

const detections = [
  "Repeated failed tool calls",
  "Context bloat and oversized outputs",
  "Excessive file reads",
  "Weak planning before edits",
  "Risky deployment/auth/config/security/migration edits",
  "Implementation without validation",
  "High token usage without progress"
];

const neverLeaves = [
  "Provider API keys",
  "Full raw system prompts",
  "Secrets and connection strings",
  "Unrelated source code",
  "Files the agent did not read",
  "Raw end-user PII"
];

const trajectoryExample = `{
  "sessionId": "migration-demo",
  "stepId": "step-42",
  "agentName": "demo-coding-agent",
  "provider": "openai",
  "model": "gpt-5.5",
  "stepType": "tool_call",
  "toolName": "read_file",
  "toolArguments": { "path": "src/migrations/index.ts" },
  "toolOutput": "...truncated sanitized output...",
  "tokenCounts": { "totalTokens": 1840 },
  "filesTouched": ["src/migrations/index.ts"],
  "tags": ["migration", "context"]
}`;

const interventionExample = `{
  "severity": "warning",
  "category": "loop",
  "message": "Repeated failed tool call detected.",
  "recommended_action": "Stop rereading broad files. Summarize current state, search for registration points, and validate with targeted tests.",
  "should_block": false,
  "confidence": 0.9
}`;

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#07070b] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_18%_8%,rgba(124,92,255,0.18),transparent_34%),radial-gradient(circle_at_82%_12%,rgba(34,211,238,0.12),transparent_30%),linear-gradient(180deg,#07070b_0%,#0a0a12_46%,#07070b_100%)]" />
      <Nav />
      <Hero />
      <Architecture />
      <Detects />
      <Privacy />
      <Demo />
      <Developer />
    </main>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#07070b]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-7 lg:px-10">
        <a href="#" className="flex items-center gap-3 font-semibold">
          <span className="grid size-9 place-items-center rounded-xl bg-[#22d3ee] text-[#07070b]"><ShieldCheck size={18} /></span>
          Agent Sidecar
        </a>
        <nav className="hidden items-center gap-6 text-sm text-neutral-300 md:flex">
          <a href="#architecture" className="hover:text-white">Architecture</a>
          <a href="#detects" className="hover:text-white">Detects</a>
          <a href="#demo" className="hover:text-white">Demo</a>
          <a href="#developer" className="hover:text-white">Developers</a>
        </nav>
        <a href="/docs" className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#07070b]">
          Docs <BookOpen size={16} />
        </a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-7 lg:grid-cols-[1.05fr_0.95fr] lg:px-10 lg:py-28">
      <div>
        <p className="inline-flex rounded-full border border-[#22d3ee]/25 bg-[#22d3ee]/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.22em] text-[#22d3ee]">
          Provider-agnostic coding-agent middleware
        </p>
        <h1 className="mt-7 max-w-5xl text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
          Stop coding agents from burning tokens in loops.
        </h1>
        <p className="mt-7 max-w-3xl text-xl leading-9 text-neutral-300">
          Agent Sidecar observes compact trajectory slices, detects wasteful agent behavior, and returns targeted interventions without seeing your API keys, full system prompts, or unnecessary private code.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <a href="#developer" className="rounded-xl bg-[#22d3ee] px-5 py-3 font-semibold text-[#050509]">Add middleware</a>
          <a href="#demo" className="rounded-xl border border-white/10 px-5 py-3 font-semibold text-neutral-100">See demo flow</a>
        </div>
      </div>
      <div className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5 shadow-2xl shadow-black/30">
        <div className="rounded-2xl border border-white/10 bg-[#050509] p-5 font-mono text-sm leading-7 text-neutral-200">
          <p className="text-[#22d3ee]">agent loop → sidecar.observeStep(slice)</p>
          <p className="mt-4 text-neutral-400">normal LLM provider call continues directly to OpenAI, Anthropic, or your chosen provider</p>
          <p className="mt-4 text-amber-200">intervention: repeated failed tool call detected</p>
          <p className="mt-4 text-emerald-200">recommended next step: summarize state, search registration point, run targeted tests</p>
        </div>
      </div>
    </section>
  );
}

function Architecture() {
  return (
    <Section id="architecture" eyebrow="Architecture" title="A sidecar boundary for agent loops, not a replacement LLM provider.">
      <div className="grid gap-5 lg:grid-cols-3">
        <Card icon={<Code2 />} title="Your infrastructure" body="The coding agent loop keeps provider API keys, full prompts, repo checkout, and provider calls inside your environment." />
        <Card icon={<Route />} title="SDK / middleware" body="The local SDK redacts and truncates each compact trajectory slice before it crosses the Sidecar boundary." />
        <Card icon={<Zap />} title="Sidecar API" body="The API receives sanitized slices, runs the intervention engine, and returns warnings, prompt patches, validation suggestions, or blocks." />
      </div>
      <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <p className="font-mono text-sm text-[#22d3ee]">Crosses boundary: state summary, tool name/args, truncated output, token counts, timing, files touched, errors, selected tags.</p>
        <p className="mt-3 font-mono text-sm text-rose-200">Never intentionally crosses: provider keys, full raw system prompts, secrets, raw PII, unread files, unrelated repo contents, unnecessary full source files.</p>
      </div>
    </Section>
  );
}

function Detects() {
  return (
    <Section id="detects" eyebrow="What Agent Sidecar detects" title="Rule-based MVP detectors for expensive or risky agent behavior.">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {detections.map((item) => <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 text-neutral-200">{item}</div>)}
      </div>
    </Section>
  );
}

function Privacy() {
  return (
    <Section id="privacy" eyebrow="Privacy boundary" title="What never leaves your environment by design.">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {neverLeaves.map((item) => <div key={item} className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.06] p-5 text-rose-100">{item}</div>)}
      </div>
    </Section>
  );
}

function Demo() {
  return (
    <Section id="demo" eyebrow="Demo" title="Before: loops and rereads. After: a targeted intervention.">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
          <h3 className="text-2xl font-semibold text-rose-100">Before Sidecar</h3>
          <p className="mt-4 text-neutral-300">A demo agent starts a migration task, reads broad directories, repeats a failing command, and burns context without changing strategy.</p>
          <p className="mt-6 font-mono text-sm text-rose-200">Demo metrics: 9 wasted steps · 18.4k avoidable tokens · 3 repeated failures</p>
        </div>
        <div className="rounded-3xl border border-[#22d3ee]/20 bg-[#22d3ee]/[0.06] p-6">
          <h3 className="text-2xl font-semibold text-[#22d3ee]">After Sidecar</h3>
          <p className="mt-4 text-neutral-200">Sidecar receives sanitized trajectory slices and returns: “Stop rereading broad files. Summarize current state, search for registration points, and validate with targeted tests.”</p>
          <p className="mt-6 font-mono text-sm text-emerald-200">Demo metrics: 4 fewer wasteful steps · 8.1k sample tokens avoided · targeted validation added</p>
        </div>
      </div>
    </Section>
  );
}

function Developer() {
  return (
    <Section id="developer" eyebrow="Developer setup" title="Observe steps locally, keep provider calls direct, receive interventions.">
      <div className="grid gap-6 lg:grid-cols-2">
        <pre className="overflow-x-auto rounded-3xl border border-white/10 bg-[#050509] p-5 text-sm leading-7 text-neutral-200"><code>{`pnpm install
pnpm dev:daemon

import { createAgentSidecar } from "@agent-sidecar/sdk";

const sidecar = createAgentSidecar({
  apiUrl: "http://localhost:4319",
  apiKey: process.env.AGENT_SIDECAR_API_KEY,
  localOnly: false,
  redact: true,
  maxFieldLength: 4000
});

const intervention = await sidecar.observeStep({
  sessionId,
  stepId,
  agentName: "demo-coding-agent",
  provider: "openai",
  model: "gpt-5.5",
  stepType: "tool_call",
  toolName: "read_file",
  toolArguments: { path: "src/index.ts" },
  toolOutput: fileContent,
  tokenCounts,
  timingMs,
  filesTouched: ["src/index.ts"],
  tags: ["debugging", "context"]
});`}</code></pre>
        <div className="grid gap-4">
          <CodeBlock title="Trajectory slice" code={trajectoryExample} />
          <CodeBlock title="Intervention" code={interventionExample} />
        </div>
      </div>
    </Section>
  );
}

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-7xl px-5 py-16 sm:px-7 lg:px-10">
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-[#22d3ee]">{eyebrow}</p>
      <h2 className="mt-5 max-w-5xl text-4xl font-semibold leading-tight sm:text-5xl">{title}</h2>
      <div className="mt-10">{children}</div>
    </section>
  );
}

function Card({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
      <div className="grid size-11 place-items-center rounded-xl border border-white/10 text-[#22d3ee]">{icon}</div>
      <h3 className="mt-8 text-2xl font-semibold">{title}</h3>
      <p className="mt-4 leading-8 text-neutral-300">{body}</p>
    </article>
  );
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-[#050509] p-5">
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-neutral-500">{title}</p>
      <pre className="overflow-x-auto text-sm leading-7 text-neutral-200"><code>{code}</code></pre>
    </div>
  );
}
