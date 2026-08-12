// Device pairing (browser-authed → write plane). The signed-in user's claim code
// is verified by signature + expiry; on success we mint a device token, store only
// sha256(token) → sub_hash, and return the token once. Nothing about the claim code
// is persisted.
import { NextResponse } from "next/server";

import { getStore, tokenSecret } from "../../../cloud/lib/config";
import { hashDeviceToken, mintDeviceToken, verifyClaim } from "../../../cloud/lib/tokens";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  let code: string;
  try {
    const body = (await request.json()) as { code?: unknown };
    code = String(body.code ?? "").trim();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!code) return NextResponse.json({ error: "missing code" }, { status: 400 });

  const claim = verifyClaim(code, tokenSecret(), Math.floor(Date.now() / 1000));
  if (!claim) return NextResponse.json({ error: "invalid or expired code" }, { status: 401 });

  const deviceToken = mintDeviceToken();
  const store = await getStore();
  await store.putDevice(hashDeviceToken(deviceToken), claim.subHash);

  const ingestUrl = new URL("/api/ingest", request.url).toString();
  return NextResponse.json({ ingest_url: ingestUrl, device_token: deviceToken });
}
