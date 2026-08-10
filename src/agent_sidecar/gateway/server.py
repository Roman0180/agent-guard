from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from agent_sidecar.gateway.capture import build_trace, usage_from_response, _parse_json
from agent_sidecar.gateway.policies import evaluate_request_policies, finalize_decisions
from agent_sidecar.gateway.traces import RetryDetector, TraceStore, normalized_request_hash
from agent_sidecar.schema.config import SidecarConfig, load_config

HOP_HEADERS = {"host", "content-length", "connection", "accept-encoding", "x-sidecar-session"}
SESSION_HEADER = "x-sidecar-session"


class GatewayState:
    def __init__(self, repo_path: Path, config: SidecarConfig) -> None:
        self.repo_path = repo_path
        self.config = config
        self.store = TraceStore(repo_path, config.gateway.capture)
        self.detector = RetryDetector(config.gateway.capture.retry_window_seconds)


def make_handler(state: GatewayState) -> type[BaseHTTPRequestHandler]:
    class GatewayHandler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802
            started = time.monotonic()
            length = int(self.headers.get("content-length", "0") or 0)
            body = self.rfile.read(length) if length else b""
            request = _parse_json(body)
            session_id = str(self.headers.get(SESSION_HEADER) or (request or {}).get("session_id") or "unknown")

            request_hash, _chars = normalized_request_hash(request or {})
            retry_count = state.detector.count(session_id, request_hash, now=time.time())
            outcome = evaluate_request_policies(request, retry_count=retry_count, policies=state.config.gateway.policies)

            if outcome.block_response is not None:
                response_body = json.dumps(outcome.block_response).encode("utf-8")
                status = 429
            else:
                forward_body = body
                if outcome.modified_request is not None:
                    forward_body = json.dumps(outcome.modified_request).encode("utf-8")
                status, response_body = self._forward(forward_body)

            latency_ms = int((time.monotonic() - started) * 1000)
            usage = usage_from_response(_parse_json(response_body))
            record = build_trace(
                session_id=session_id,
                path=self.path,
                request_body=body,
                response_body=response_body,
                status=status,
                latency_ms=latency_ms,
                capture=state.config.gateway.capture,
                detector=state.detector,
                now=time.time(),
                policy_decisions=finalize_decisions(
                    outcome.decisions,
                    usage=usage,
                    model=(request or {}).get("model"),
                    config=state.config,
                    repo_path=state.repo_path,
                ),
            )
            state.store.append(record)
            self._respond(status, response_body)

        def do_GET(self) -> None:  # noqa: N802
            status, body = self._forward(None, method="GET")
            self._respond(status, body)

        def _forward(self, body: bytes | None, *, method: str = "POST") -> tuple[int, bytes]:
            url = f"{state.config.gateway.target_base.rstrip('/')}{self.path}"
            headers = {key: value for key, value in self.headers.items() if key.lower() not in HOP_HEADERS}
            request = urllib.request.Request(url, data=body, headers=headers, method=method)
            try:
                with urllib.request.urlopen(request, timeout=600) as response:
                    return response.status, response.read()
            except urllib.error.HTTPError as error:
                return error.code, error.read()
            except (urllib.error.URLError, OSError) as error:
                return 502, json.dumps({"error": {"type": "sidecar_upstream_unreachable", "message": str(error)}}).encode("utf-8")

        def _respond(self, status: int, body: bytes) -> None:
            self.send_response(status)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args) -> None:
            return

    return GatewayHandler


def serve(repo_path: Path, config: SidecarConfig | None = None) -> ThreadingHTTPServer:
    config = config or load_config(repo_path)
    state = GatewayState(repo_path, config)
    server = ThreadingHTTPServer((config.gateway.listen_host, config.gateway.listen_port), make_handler(state))
    return server
