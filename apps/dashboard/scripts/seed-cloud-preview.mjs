// Dev-only: seed a sample savings snapshot so /cloud shows populated data.
// Exercises the real claim + ingest endpoints (no Google needed). Signs a claim
// for the dev-preview account ("dev-user"), claims a device token, and pushes a
// snapshot — matching app/cloud/lib/tokens.ts byte-for-byte.
//
// Usage:  CLOUD_TOKEN_SECRET=dev-secret node scripts/seed-cloud-preview.mjs
import { createHmac } from "node:crypto";

const BASE = process.env.CLOUD_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.CLOUD_TOKEN_SECRET;
const SUB = process.env.CLOUD_DEV_SUB ?? "dev-user";

if (!SECRET) {
  console.error("Set CLOUD_TOKEN_SECRET (same value the dev server runs with).");
  process.exit(1);
}

const b64url = (s) => Buffer.from(s).toString("base64url");
const hmacHex = (value) => createHmac("sha256", SECRET).update(value).digest("hex");
const hashSub = (sub) => hmacHex(`sub:${sub}`);

function signClaim(subHash, ttlSeconds, nowSec) {
  const body = b64url(JSON.stringify({ subHash, exp: nowSec + ttlSeconds }));
  return `${body}.${hmacHex(body)}`;
}

const SAMPLE = {
  tokensUsed: 181760,
  measuredCostUsd: 3.61,
  apiEquivalentUsd: 3.61,
  sessions: 3,
  refinementsDelivered: 4,
  steeringRecommendations: 2,
  shadowDetections: 3,
  generatedAt: new Date().toISOString(),
};

async function main() {
  const code = signClaim(hashSub(SUB), 600, Math.floor(Date.now() / 1000));

  const claim = await fetch(`${BASE}/api/link/claim`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!claim.ok) throw new Error(`claim failed: ${claim.status} ${await claim.text()}`);
  const { device_token, ingest_url } = await claim.json();

  const ingest = await fetch(ingest_url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${device_token}` },
    body: JSON.stringify({ kind: "savings_snapshot", snapshot: SAMPLE }),
  });
  if (!ingest.ok) throw new Error(`ingest failed: ${ingest.status} ${await ingest.text()}`);

  console.log(`Seeded a snapshot for "${SUB}".`);
  console.log(`Now open ${BASE}/cloud and click "Dev preview sign-in".`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
