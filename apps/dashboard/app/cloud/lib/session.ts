import { auth } from "../../../auth";
import { tokenSecret } from "./config";
import { hashSub } from "./tokens";

/** The signed-in account key (hash of Google's sub), or null if not signed in. */
export async function currentSubHash(): Promise<string | null> {
  const session = (await auth()) as ({ sub?: string } & Record<string, unknown>) | null;
  if (!session?.sub) return null;
  return hashSub(session.sub, tokenSecret());
}
