from __future__ import annotations

import json
import os
import stat
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from agent_sidecar.cli import cloud_cmds
from agent_sidecar.cloud.credentials import (
    CloudCredentials,
    clear_cloud_credentials,
    load_cloud_credentials,
    save_cloud_credentials,
)


@pytest.fixture(autouse=True)
def _isolated_credentials(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENT_SIDECAR_CREDENTIALS_PATH", str(tmp_path / "credentials.json"))


def test_credential_store_round_trip_and_permissions(tmp_path: Path) -> None:
    assert load_cloud_credentials() is None
    path = save_cloud_credentials(CloudCredentials(ingest_url="https://x/api/ingest", device_token="dev-secret"))

    loaded = load_cloud_credentials()
    assert loaded == CloudCredentials(ingest_url="https://x/api/ingest", device_token="dev-secret")
    # Device token is a bearer secret — owner-only.
    assert stat.S_IMODE(os.stat(path).st_mode) == 0o600
    assert clear_cloud_credentials() is True
    assert load_cloud_credentials() is None


def test_credential_store_ignores_partial_payload(tmp_path: Path) -> None:
    path = Path(os.environ["AGENT_SIDECAR_CREDENTIALS_PATH"])
    path.write_text(json.dumps({"ingest_url": "https://x"}), encoding="utf-8")
    assert load_cloud_credentials() is None


class _ClaimHandler(BaseHTTPRequestHandler):
    received: dict = {}

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("content-length", "0"))
        _ClaimHandler.received = json.loads(self.rfile.read(length).decode("utf-8"))
        body = json.dumps({"ingest_url": "https://x/api/ingest", "device_token": "minted-token"}).encode("utf-8")
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args) -> None:
        return


def test_link_command_claims_and_stores_device_token() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", 0), _ClaimHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        cloud_cmds.link(code="  claim-token  ", claim_url=f"http://127.0.0.1:{server.server_port}/api/link/claim")
    finally:
        server.shutdown()
        server.server_close()

    # Only the (trimmed) claim code is sent — no local paths, no identity.
    assert _ClaimHandler.received == {"code": "claim-token"}
    stored = load_cloud_credentials()
    assert stored == CloudCredentials(ingest_url="https://x/api/ingest", device_token="minted-token")


class _IngestHandler(BaseHTTPRequestHandler):
    auth_header: str | None = None
    body: dict = {}

    def do_POST(self) -> None:  # noqa: N802
        _IngestHandler.auth_header = self.headers.get("authorization")
        length = int(self.headers.get("content-length", "0"))
        _IngestHandler.body = json.loads(self.rfile.read(length).decode("utf-8"))
        self.send_response(200)
        self.send_header("content-length", "0")
        self.end_headers()

    def log_message(self, *_args) -> None:
        return


def test_push_uses_bearer_and_ingest_url_when_linked(tmp_path: Path) -> None:
    from agent_sidecar.intel.measurement import push_measurement_report
    from agent_sidecar.schema.config import SidecarConfig
    from agent_sidecar.store.sessions import SessionManager

    server = ThreadingHTTPServer(("127.0.0.1", 0), _IngestHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    ingest_url = f"http://127.0.0.1:{server.server_port}/api/ingest"
    save_cloud_credentials(CloudCredentials(ingest_url=ingest_url, device_token="dev-abc"))

    (tmp_path / ".agent-sidecar").mkdir(parents=True)
    (tmp_path / ".agent-sidecar" / "config.json").write_text(SidecarConfig().model_dump_json(), encoding="utf-8")
    manager = SessionManager(tmp_path)
    try:
        assert push_measurement_report(manager) is True
    finally:
        server.shutdown()
        server.server_close()

    assert _IngestHandler.auth_header == "Bearer dev-abc"
    assert _IngestHandler.body["kind"] == "savings_snapshot"
    snapshot = _IngestHandler.body["snapshot"]
    # Snapshot is numeric aggregates only — no prompt text, no per-session detail.
    assert set(snapshot).issubset(
        {"tokensUsed", "measuredCostUsd", "apiEquivalentUsd", "sessions",
         "refinementsDelivered", "steeringRecommendations", "shadowDetections", "generatedAt"}
    )
