// Runtime wiring for the cloud edges: the HMAC secret and the store singleton.
// The store is Postgres when DATABASE_URL is set, otherwise an in-memory store
// for local dev (data does not survive a restart — that's intended for dev).
import { MemoryStore, pgStore, SCHEMA_SQL, type CloudStore, type SqlPool } from "./store";

export function tokenSecret(): string {
  const secret = process.env.CLOUD_TOKEN_SECRET;
  if (!secret) throw new Error("CLOUD_TOKEN_SECRET is not set");
  return secret;
}

export const CLAIM_TTL_SECONDS = 600; // 10 minutes

let store: CloudStore | null = null;

// Next compiles each route into its own module graph, so a plain module-level
// singleton is NOT shared between /api/link/claim and /api/ingest. For the
// DB-less dev store, pin it to globalThis so both routes (and HMR reloads) see
// the same in-memory data. Postgres needs none of this — it is shared external state.
const devStoreKey = Symbol.for("agent-sidecar.cloud.devStore");
type DevStoreGlobal = typeof globalThis & { [devStoreKey]?: CloudStore };

export async function getStore(): Promise<CloudStore> {
  if (store) return store;
  const url = process.env.DATABASE_URL;
  if (!url) {
    const globalRef = globalThis as DevStoreGlobal;
    globalRef[devStoreKey] ??= new MemoryStore();
    store = globalRef[devStoreKey]!;
    return store;
  }
  // Non-literal specifier so the bundler/tsc doesn't hard-require `pg` at build time;
  // the driver is a deploy-only dependency.
  const specifier = "pg";
  const pg = (await import(specifier)) as { Pool: new (config: { connectionString: string }) => SqlPool };
  const pool = new pg.Pool({ connectionString: url });
  await pool.query(SCHEMA_SQL);
  store = pgStore(pool);
  return store;
}
