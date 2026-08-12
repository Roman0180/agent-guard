// The persistence boundary. Exactly two tables, both keyed by a hash:
//   devices(token_hash PK, sub_hash, last_seen_at)
//   snapshots(sub_hash PK, data, updated_at)   -- one row per user, upserted
// No sessions, no identities, no history. See docs/CLOUD_DASHBOARD_AUTH_PLAN.md.
import type { SnapshotData } from "./snapshot";

export type StoredSnapshot = { data: SnapshotData; updatedAt: string };

export interface CloudStore {
  /** Bind a device token hash to an account (sub hash). Called once, at pairing. */
  putDevice(tokenHash: string, subHash: string): Promise<void>;
  /** Resolve a device token hash to its account, bumping last_seen. Null if unknown/revoked. */
  deviceSub(tokenHash: string, nowIso: string): Promise<string | null>;
  /** Upsert the single latest snapshot for an account. */
  upsertSnapshot(subHash: string, data: SnapshotData, nowIso: string): Promise<void>;
  /** Read an account's latest snapshot, or null if none pushed yet. */
  getSnapshot(subHash: string): Promise<StoredSnapshot | null>;
}

/** In-memory store for tests and local dev. */
export class MemoryStore implements CloudStore {
  private devices = new Map<string, { subHash: string; lastSeenAt: string }>();
  private snapshots = new Map<string, StoredSnapshot>();

  async putDevice(tokenHash: string, subHash: string): Promise<void> {
    this.devices.set(tokenHash, { subHash, lastSeenAt: "" });
  }

  async deviceSub(tokenHash: string, nowIso: string): Promise<string | null> {
    const device = this.devices.get(tokenHash);
    if (!device) return null;
    device.lastSeenAt = nowIso;
    return device.subHash;
  }

  async upsertSnapshot(subHash: string, data: SnapshotData, nowIso: string): Promise<void> {
    this.snapshots.set(subHash, { data, updatedAt: nowIso });
  }

  async getSnapshot(subHash: string): Promise<StoredSnapshot | null> {
    return this.snapshots.get(subHash) ?? null;
  }
}

// Minimal shape of a `pg` Pool — kept structural so tests (and typecheck) need no pg dependency.
export interface SqlPool {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS devices (
  token_hash   TEXT PRIMARY KEY,
  sub_hash     TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS snapshots (
  sub_hash   TEXT PRIMARY KEY,
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
`;

/** Thin Postgres-backed store for production. Logic is validated against MemoryStore. */
export function pgStore(pool: SqlPool): CloudStore {
  return {
    async putDevice(tokenHash, subHash) {
      await pool.query(
        `INSERT INTO devices (token_hash, sub_hash) VALUES ($1, $2)
         ON CONFLICT (token_hash) DO UPDATE SET sub_hash = EXCLUDED.sub_hash`,
        [tokenHash, subHash]
      );
    },
    async deviceSub(tokenHash, nowIso) {
      const result = await pool.query(
        `UPDATE devices SET last_seen_at = $2 WHERE token_hash = $1 RETURNING sub_hash`,
        [tokenHash, nowIso]
      );
      const row = result.rows[0];
      return row ? String(row.sub_hash) : null;
    },
    async upsertSnapshot(subHash, data, nowIso) {
      await pool.query(
        `INSERT INTO snapshots (sub_hash, data, updated_at) VALUES ($1, $2, $3)
         ON CONFLICT (sub_hash) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
        [subHash, JSON.stringify(data), nowIso]
      );
    },
    async getSnapshot(subHash) {
      const result = await pool.query(`SELECT data, updated_at FROM snapshots WHERE sub_hash = $1`, [subHash]);
      const row = result.rows[0];
      if (!row) return null;
      const data = typeof row.data === "string" ? JSON.parse(row.data) : (row.data as SnapshotData);
      return { data, updatedAt: String(row.updated_at) };
    },
  };
}
