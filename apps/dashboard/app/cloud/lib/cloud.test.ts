import { describe, expect, it } from "vitest";

import { sanitizeSnapshot } from "./snapshot";
import { MemoryStore, pgStore, type SqlPool } from "./store";
import {
  constantTimeEqualHex,
  hashDeviceToken,
  hashSub,
  mintDeviceToken,
  signClaim,
  verifyClaim,
} from "./tokens";

const SECRET = "test-secret";

describe("tokens", () => {
  it("hashes the Google sub without exposing it and is stable", () => {
    const a = hashSub("google-sub-123", SECRET);
    const b = hashSub("google-sub-123", SECRET);
    expect(a).toBe(b);
    expect(a).not.toContain("google-sub-123");
    expect(hashSub("other", SECRET)).not.toBe(a);
  });

  it("mints unique high-entropy device tokens and hashes them one-way", () => {
    const t1 = mintDeviceToken();
    const t2 = mintDeviceToken();
    expect(t1).not.toBe(t2);
    expect(t1.length).toBeGreaterThan(20);
    expect(hashDeviceToken(t1)).toHaveLength(64);
    expect(hashDeviceToken(t1)).not.toContain(t1);
  });

  it("round-trips a claim code and extracts the sub hash", () => {
    const subHash = hashSub("sub-abc", SECRET);
    const code = signClaim(subHash, SECRET, 600, 1000);
    const claim = verifyClaim(code, SECRET, 1200);
    expect(claim?.subHash).toBe(subHash);
    expect(claim?.exp).toBe(1600);
  });

  it("rejects expired, tampered, and wrong-secret claim codes", () => {
    const code = signClaim("sub", SECRET, 600, 1000);
    expect(verifyClaim(code, SECRET, 2000)).toBeNull(); // expired (exp=1600)
    expect(verifyClaim(code, "wrong-secret", 1200)).toBeNull();
    const [body] = code.split(".");
    expect(verifyClaim(`${body}.deadbeef`, SECRET, 1200)).toBeNull(); // tampered sig
    expect(verifyClaim("not-a-code", SECRET, 1200)).toBeNull();
  });

  it("constant-time hex compare handles mismatched lengths without throwing", () => {
    expect(constantTimeEqualHex("aa", "aa")).toBe(true);
    expect(constantTimeEqualHex("aa", "bb")).toBe(false);
    expect(constantTimeEqualHex("aa", "aabb")).toBe(false);
  });
});

describe("sanitizeSnapshot", () => {
  it("keeps only allowlisted numeric aggregates and drops everything else", () => {
    const result = sanitizeSnapshot({
      tokensUsed: 12345.9,
      measuredCostUsd: 2.5,
      planAssumed: true,
      generatedAt: "2026-08-11T00:00:00.000Z",
      // all of the below must be dropped:
      promptText: "fix the auth bug in packages/auth/src/refresh.ts",
      messages: [{ role: "user", content: "secret" }],
      arms: { assist: { tokens_input: 1 } },
      sessionId: "cc-123",
    });
    expect(result).toEqual({
      tokensUsed: 12345, // int-truncated
      measuredCostUsd: 2.5,
      planAssumed: true,
      generatedAt: "2026-08-11T00:00:00.000Z",
    });
    expect(JSON.stringify(result)).not.toContain("auth");
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("drops non-finite numbers, wrong types, non-ISO timestamps, and oversized strings", () => {
    expect(sanitizeSnapshot({ tokensUsed: Number.NaN })).toEqual({});
    expect(sanitizeSnapshot({ tokensUsed: "100" })).toEqual({});
    expect(sanitizeSnapshot({ planAssumed: "yes" })).toEqual({});
    expect(sanitizeSnapshot({ generatedAt: "not-a-date" })).toEqual({});
    expect(sanitizeSnapshot({ generatedAt: "x".repeat(500) })).toEqual({});
    expect(sanitizeSnapshot(null)).toEqual({});
    expect(sanitizeSnapshot("nope")).toEqual({});
  });
});

describe("MemoryStore", () => {
  it("binds a device to an account and resolves it, bumping last-seen", async () => {
    const store = new MemoryStore();
    await store.putDevice("tokhash", "subhash");
    expect(await store.deviceSub("tokhash", "2026-08-11T00:00:00Z")).toBe("subhash");
    expect(await store.deviceSub("unknown", "2026-08-11T00:00:00Z")).toBeNull();
  });

  it("upserts one snapshot per account (latest-only, no history)", async () => {
    const store = new MemoryStore();
    await store.upsertSnapshot("subhash", { tokensUsed: 10 }, "2026-08-11T00:00:00Z");
    await store.upsertSnapshot("subhash", { tokensUsed: 20 }, "2026-08-11T01:00:00Z");
    const snap = await store.getSnapshot("subhash");
    expect(snap?.data.tokensUsed).toBe(20);
    expect(snap?.updatedAt).toBe("2026-08-11T01:00:00Z");
    expect(await store.getSnapshot("nobody")).toBeNull();
  });
});

describe("pgStore", () => {
  it("issues upsert SQL and maps rows back through the same interface", async () => {
    const calls: Array<{ text: string; params?: unknown[] }> = [];
    const fakePool: SqlPool = {
      async query(text, params) {
        calls.push({ text, params });
        if (text.includes("RETURNING sub_hash")) return { rows: [{ sub_hash: "subhash" }] };
        if (text.startsWith("SELECT")) return { rows: [{ data: { tokensUsed: 5 }, updated_at: "2026-08-11T00:00:00Z" }] };
        return { rows: [] };
      },
    };
    const store = pgStore(fakePool);
    await store.putDevice("tokhash", "subhash");
    expect(await store.deviceSub("tokhash", "2026-08-11T00:00:00Z")).toBe("subhash");
    await store.upsertSnapshot("subhash", { tokensUsed: 5 }, "2026-08-11T00:00:00Z");
    expect((await store.getSnapshot("subhash"))?.data.tokensUsed).toBe(5);
    expect(calls.some((c) => c.text.includes("ON CONFLICT (token_hash)"))).toBe(true);
    expect(calls.some((c) => c.text.includes("ON CONFLICT (sub_hash)"))).toBe(true);
  });
});
