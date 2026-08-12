// Token + hashing primitives for the cloud dashboard. Dependency-free (node:crypto).
//
// Data-minimization: we store a *hash* of Google's opaque `sub` (never the raw id,
// never the email), and a *hash* of each device token (never the raw token). Claim
// codes are stateless HMAC-signed tokens, so there is nothing to persist for pairing.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmacHex(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

/** Keyed hash of Google's `sub`, the account key. Never reversible to a Gmail address. */
export function hashSub(sub: string, secret: string): string {
  return hmacHex(secret, `sub:${sub}`);
}

/** Device tokens are high-entropy random, so a plain sha256 is a sufficient lookup key. */
export function hashDeviceToken(token: string): string {
  return sha256Hex(token);
}

/** A fresh opaque device token to hand back to the sidecar exactly once. */
export function mintDeviceToken(): string {
  return base64url(randomBytes(32));
}

export type ClaimPayload = { subHash: string; exp: number };

/** Stateless pairing code: base64url(payload).hmac — verified by signature + expiry, stored nowhere. */
export function signClaim(subHash: string, secret: string, ttlSeconds: number, nowSec: number): string {
  const payload: ClaimPayload = { subHash, exp: nowSec + ttlSeconds };
  const body = base64url(JSON.stringify(payload));
  const sig = hmacHex(secret, body);
  return `${body}.${sig}`;
}

export function verifyClaim(code: string, secret: string, nowSec: number): ClaimPayload | null {
  const dot = code.indexOf(".");
  if (dot <= 0) return null;
  const body = code.slice(0, dot);
  const sig = code.slice(dot + 1);
  const expected = hmacHex(secret, body);
  if (!constantTimeEqualHex(sig, expected)) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof (payload as ClaimPayload).subHash !== "string" ||
    typeof (payload as ClaimPayload).exp !== "number"
  ) {
    return null;
  }
  const claim = payload as ClaimPayload;
  if (claim.exp <= nowSec) return null;
  return claim;
}

/** Constant-time comparison of two equal-length hex strings; false (not throw) on length mismatch. */
export function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}
