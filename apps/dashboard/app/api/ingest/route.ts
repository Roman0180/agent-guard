// Aggregate push (device-authed → write plane). Authenticated by the Bearer device
// token ONLY — never a browser cookie. The incoming report is reduced to the snapshot
// allowlist before storage, so nothing unlisted (e.g. prompt text) can ever be persisted.
import { NextResponse } from "next/server";

import { getStore } from "../../cloud/lib/config";
import { sanitizeSnapshot } from "../../cloud/lib/snapshot";
import { hashDeviceToken } from "../../cloud/lib/tokens";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return NextResponse.json({ error: "missing bearer token" }, { status: 401 });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "payload too large" }, { status: 413 });

  let payload: { snapshot?: unknown };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const store = await getStore();
  const nowIso = new Date().toISOString();
  const subHash = await store.deviceSub(hashDeviceToken(token), nowIso);
  if (!subHash) return NextResponse.json({ error: "unknown device" }, { status: 401 });

  const snapshot = sanitizeSnapshot(payload.snapshot);
  await store.upsertSnapshot(subHash, snapshot, nowIso);
  return NextResponse.json({ ok: true });
}
