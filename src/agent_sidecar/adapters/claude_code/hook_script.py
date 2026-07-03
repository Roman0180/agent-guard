from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

from agent_sidecar.schema.events import ensure_session_id


DEFAULT_API_URL = "http://127.0.0.1:7433"
TIMEOUT_SECONDS = 0.2


def main() -> int:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw or "{}")
        session_id = ensure_session_id(str(payload.get("session_id") or payload.get("sessionId") or "unknown"))
        api_url = os.environ.get("AGENT_SIDECAR_API_URL", DEFAULT_API_URL).rstrip("/")
        request = urllib.request.Request(
            f"{api_url}/sessions/{session_id}/events",
            data=json.dumps(payload).encode("utf-8"),
            headers={"content-type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS).close()
    except (OSError, ValueError, urllib.error.URLError, TimeoutError):
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
