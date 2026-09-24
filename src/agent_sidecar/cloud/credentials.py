"""Per-user cloud credentials for the hosted savings dashboard.

Holds only what a headless sidecar needs to authenticate its aggregate pushes:
the ingest URL and an opaque device token. Never Google identity, never prompt
text. Stored at ~/.agent-sidecar/credentials.json with 0600 permissions so other
local users cannot read the device token.

The claim response may also carry an entitlement (tier + optional expiry) so the
sidecar knows which paid features this account may use. An account with no
entitlement — including every credentials file written before entitlements
existed — resolves to the free tier. Expiry is evaluated fail-closed: an expired
or unparseable expiry falls back to free rather than granting paid access.
"""
from __future__ import annotations

import json
import os
import stat
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


FREE_TIER = "free"


@dataclass(frozen=True)
class Entitlement:
    tier: str
    # ISO 8601 UTC timestamp; None means the entitlement does not expire.
    expires_at: str | None = None


@dataclass(frozen=True)
class CloudCredentials:
    ingest_url: str
    device_token: str
    entitlement: Entitlement | None = None


def credentials_path() -> Path:
    override = os.environ.get("AGENT_SIDECAR_CREDENTIALS_PATH", "").strip()
    if override:
        return Path(override)
    return Path.home() / ".agent-sidecar" / "credentials.json"


def load_cloud_credentials() -> CloudCredentials | None:
    path = credentials_path()
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    ingest_url = str(payload.get("ingest_url") or "").strip()
    device_token = str(payload.get("device_token") or "").strip()
    if not ingest_url or not device_token:
        return None
    return CloudCredentials(
        ingest_url=ingest_url,
        device_token=device_token,
        entitlement=entitlement_from_payload(payload.get("entitlement")),
    )


def save_cloud_credentials(credentials: CloudCredentials) -> Path:
    path = credentials_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    data: dict[str, object] = {"ingest_url": credentials.ingest_url, "device_token": credentials.device_token}
    if credentials.entitlement is not None:
        entitlement: dict[str, object] = {"tier": credentials.entitlement.tier}
        if credentials.entitlement.expires_at is not None:
            entitlement["expires_at"] = credentials.entitlement.expires_at
        data["entitlement"] = entitlement
    path.write_text(
        json.dumps(data, indent=2) + "\n",
        encoding="utf-8",
    )
    # Device token is a bearer secret — restrict to the owner (0600).
    os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
    return path


def clear_cloud_credentials() -> bool:
    path = credentials_path()
    try:
        path.unlink()
        return True
    except FileNotFoundError:
        return False
    except OSError:
        return False


def entitlement_from_payload(raw: object) -> Entitlement | None:
    """Parse an entitlement out of a claim response (or None when absent/invalid)."""
    if not isinstance(raw, dict):
        return None
    tier = str(raw.get("tier") or "").strip()
    if not tier:
        return None
    expires_raw = raw.get("expires_at")
    expires_at = str(expires_raw).strip() if isinstance(expires_raw, str) and expires_raw.strip() else None
    return Entitlement(tier=tier, expires_at=expires_at)


def active_entitlement(credentials: CloudCredentials | None, *, now: datetime | None = None) -> Entitlement | None:
    """Return the entitlement only while it is valid; None once expired or unverifiable.

    Fail-closed: a present-but-unparseable expiry is treated as expired, so a
    corrupted timestamp downgrades to free rather than granting paid access.
    """
    if credentials is None or credentials.entitlement is None:
        return None
    entitlement = credentials.entitlement
    if entitlement.expires_at is None:
        return entitlement
    expiry = _parse_iso_utc(entitlement.expires_at)
    if expiry is None:
        return None
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    return None if current >= expiry else entitlement


def entitled_tier(credentials: CloudCredentials | None, *, now: datetime | None = None) -> str:
    """The tier this machine may currently use: an active entitlement's tier, else 'free'."""
    entitlement = active_entitlement(credentials, now=now)
    return entitlement.tier if entitlement else FREE_TIER


def _parse_iso_utc(value: str) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed
