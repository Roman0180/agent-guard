import { devLoginEnabled, signIn } from "../../../auth";
import { CLAIM_TTL_SECONDS, tokenSecret } from "../lib/config";
import { currentSubHash } from "../lib/session";
import { signClaim } from "../lib/tokens";

export const dynamic = "force-dynamic";

export default async function LinkPage() {
  const subHash = await currentSubHash();

  if (!subHash) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-neutral-100">
        <h1 className="text-2xl font-semibold">Link a machine</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-400">Sign in first to generate a link code.</p>
        <form
          action={async () => {
            "use server";
            await signIn(devLoginEnabled ? "dev" : "google", { redirectTo: "/cloud/link" });
          }}
        >
          <button className="mt-6 rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold hover:border-[#67e8f9]">
            {devLoginEnabled ? "Dev preview sign-in" : "Sign in with Google"}
          </button>
        </form>
      </main>
    );
  }

  const code = signClaim(subHash, tokenSecret(), CLAIM_TTL_SECONDS, Math.floor(Date.now() / 1000));

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-neutral-100">
      <h1 className="text-2xl font-semibold">Link this machine</h1>
      <p className="mt-3 text-sm leading-6 text-neutral-400">
        Run this in the terminal on the machine where Agent Sidecar is installed. The code expires in{" "}
        {Math.round(CLAIM_TTL_SECONDS / 60)} minutes and links aggregate savings numbers only — your prompts and code
        never leave your machine.
      </p>
      <pre className="mt-6 overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-4 font-mono text-sm text-neutral-100">
        agent-sidecar link --code {code}
      </pre>
      <p className="mt-4 text-xs text-neutral-500">
        The command exchanges this code for a device token stored locally at ~/.agent-sidecar/credentials.json (0600).
      </p>
    </main>
  );
}
