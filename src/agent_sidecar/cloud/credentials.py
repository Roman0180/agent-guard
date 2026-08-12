"""Per-user cloud credentials for the hosted savings dashboard.

Holds only what a headless sidecar needs to authenticate its aggregate pushes:
the ingest URL and an opaque device token. Never Google identity, never prompt
text. Stored at ~/.agent-sidecar/credentials.json with 0600 permissions so other
local users cannot read the device token.
"""
from __future__ import annotations

import json
import os
import stat
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class CloudCredentials:
    ingest_url: str
    device_token: str


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
    return CloudCredentials(ingest_url=ingest_url, device_token=device_token)


def save_cloud_credentials(credentials: CloudCredentials) -> Path:
    path = credentials_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"ingest_url": credentials.ingest_url, "device_token": credentials.device_token}, indent=2) + "\n",
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
