import Link from "next/link";

import { devLoginEnabled, signIn } from "../../auth";
import { getStore } from "./lib/config";
import { currentSubHash } from "./lib/session";
import type { SnapshotData } from "./lib/snapshot";

export const dynamic = "force-dynamic";

function formatTokens(value: number | undefined): string {
  if (!value) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function formatUsd(value: number | undefined): string {
  return `$${(value ?? 0).toFixed(2)}`;
}

function Card({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.025] p-4">
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {detail ? <p className="mt-1 text-sm text-neutral-400">{detail}</p> : null}
    </div>
  );
}

export default async function CloudDashboardPage() {
  const subHash = await currentSubHash();

  if (!subHash) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-neutral-100">
        <h1 className="text-2xl font-semibold">Agent Sidecar — your savings</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-400">
          Sign in with Google to see your plan capacity and API-equivalent value. We store only aggregate numbers,
          keyed to a hash of your account — never your email, prompts, or code.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn(devLoginEnabled ? "dev" : "google", { redirectTo: "/cloud" });
          }}
        >
          <button className="mt-6 rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold hover:border-[#67e8f9]">
            {devLoginEnabled ? "Dev preview sign-in" : "Sign in with Google"}
          </button>
        </form>
      </main>
    );
  }

  const snapshot = await getStore().then((store) => store.getSnapshot(subHash));

  if (!snapshot) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-neutral-100">
        <h1 className="text-2xl font-semibold">No data yet</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-400">
          You&apos;re signed in, but this account has no linked machine. Link your local Agent Sidecar to start
          seeing aggregate savings here.
        </p>
        <Link href="/cloud/link" className="mt-6 inline-block rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold hover:border-[#67e8f9]">
          Link a machine
        </Link>
      </main>
    );
  }

  const data: SnapshotData = snapshot.data;
  return (
    <main className="mx-auto max-w-4xl px-6 py-12 text-neutral-100">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-[#67e8f9]">Cloud dashboard</p>
          <h1 className="mt-2 text-3xl font-semibold">Your savings</h1>
        </div>
        <Link href="/cloud/link" className="rounded-lg border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.16em] text-neutral-400 hover:border-white/25">
          Link another machine
        </Link>
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Tokens used" value={formatTokens(data.tokensUsed)} detail={`across ${data.sessions ?? 0} sessions`} />
        <Card label="API-equiv. value" value={formatUsd(data.apiEquivalentUsd ?? data.measuredCostUsd)} detail="work delivered, at API prices" />
        <Card label="Refinements" value={String(data.refinementsDelivered ?? 0)} detail={`${data.steeringRecommendations ?? 0} steering`} />
        <Card label="Shadow detections" value={String(data.shadowDetections ?? 0)} detail="waste caught in control arm" />
      </section>

      <p className="mt-8 text-xs text-neutral-500">
        Aggregates only — updated {snapshot.updatedAt}. Your prompts and code never leave your machine.
      </p>
    </main>
  );
}
