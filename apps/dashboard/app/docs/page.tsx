import { ArrowRight, Code2, Terminal } from "lucide-react";

const sdkSnippet = `import { createAgentSidecar } from "@agent-sidecar/sdk";

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
});`;

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-[#07070b] text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07070b]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-7 lg:px-10">
          <a href="/" className="flex items-center gap-3 font-semibold"><Code2 className="text-[#22d3ee]" /> Agent Sidecar Docs</a>
          <a href="/" className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-[#07070b]">Landing <ArrowRight size={16} /></a>
        </div>
      </header>

      <article className="mx-auto max-w-5xl px-5 py-12 sm:px-7 lg:px-10">
        <section className="rounded-[28px] border border-white/10 bg-white/[0.035] p-8">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-[#22d3ee]">Overview</p>
          <h1 className="mt-5 text-4xl font-semibold leading-tight sm:text-6xl">Middleware for coding-agent trajectories.</h1>
          <p className="mt-6 text-lg leading-8 text-neutral-300">
            Agent Sidecar observes compact, sanitized trajectory slices from agent loops and returns interventions for wasted tokens, loops, risky edits, weak planning, context bloat, and missing validation. Provider calls continue directly to OpenAI, Anthropic, local models, or your chosen provider.
          </p>
        </section>

        <section className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.035] p-8">
          <h2 className="text-3xl font-semibold">Install and run</h2>
          <pre className="mt-6 overflow-x-auto rounded-2xl border border-white/10 bg-[#050509] p-5 text-sm leading-7 text-neutral-200"><code>{`pnpm install
pnpm dev:daemon
pnpm dev:dashboard`}</code></pre>
          <p className="mt-4 text-neutral-400">The daemon exposes <code className="text-neutral-200">POST /api/trajectory-slices</code>. The SDK can also run the intervention engine locally with <code className="text-neutral-200">localOnly: true</code>.</p>
        </section>

        <section className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.035] p-8">
          <h2 className="text-3xl font-semibold">SDK usage</h2>
          <pre className="mt-6 overflow-x-auto rounded-2xl border border-white/10 bg-[#050509] p-5 text-sm leading-7 text-neutral-200"><code>{sdkSnippet}</code></pre>
        </section>

        <section className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-[28px] border border-[#22d3ee]/20 bg-[#22d3ee]/[0.055] p-8">
            <h2 className="text-2xl font-semibold">What crosses the boundary</h2>
            <ul className="mt-5 list-disc space-y-2 pl-5 text-neutral-200">
              <li>State summary</li>
              <li>Tool name and normalized arguments</li>
              <li>Truncated sanitized tool output</li>
              <li>Token counts and timing</li>
              <li>Files touched, errors, tags, metadata</li>
            </ul>
          </div>
          <div className="rounded-[28px] border border-rose-400/20 bg-rose-400/[0.055] p-8">
            <h2 className="text-2xl font-semibold">What should not leave</h2>
            <ul className="mt-5 list-disc space-y-2 pl-5 text-neutral-200">
              <li>Provider API keys</li>
              <li>Full raw system prompts</li>
              <li>Secrets, connection strings, raw PII</li>
              <li>Unread files or unrelated repo contents</li>
              <li>Unnecessary full source files</li>
            </ul>
          </div>
        </section>

        <section className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.035] p-8">
          <h2 className="flex items-center gap-3 text-3xl font-semibold"><Terminal className="text-[#22d3ee]" /> Demo flow</h2>
          <ol className="mt-6 list-decimal space-y-3 pl-5 text-neutral-300">
            <li>Agent starts a migration task.</li>
            <li>Agent reads too many files or repeats a failing command.</li>
            <li>Agent Sidecar receives sanitized trajectory slices.</li>
            <li>Sidecar detects loop or context bloat.</li>
            <li>Sidecar returns: “Stop rereading broad files. Summarize current state, search for registration points, and validate with targeted tests.”</li>
            <li>Agent follows a narrower plan and validates.</li>
          </ol>
        </section>
      </article>
    </main>
  );
}
