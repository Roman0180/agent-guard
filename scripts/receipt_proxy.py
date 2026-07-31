"""Serving-side receipt log for the laptop pilot.

Sits between `tailscale serve` and Ollama:

    tailnet :11434 -> tailscale serve -> this proxy :11435 -> Ollama 127.0.0.1:11434

Pilot traffic arrives via the tailnet and is receipted; the operator's own
localhost:11434 traffic never passes through. Receipts are append-only JSONL at
.agent-sidecar/receipts/receipts.jsonl and store NO prompt text — only hashes,
sizes, token counts, and timing — so the receipt file itself is low-sensitivity.

Usage:
    python3 scripts/receipt_proxy.py            # run the proxy (foreground)
    python3 scripts/receipt_proxy.py --summary  # aggregate receipts by day
"""
from __future__ import annotations

import hashlib
import json
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

LISTEN = ("127.0.0.1", 11435)
TARGET = "http://127.0.0.1:11434"
RECEIPTS = Path(__file__).resolve().parent.parent / ".agent-sidecar" / "receipts" / "receipts.jsonl"
HOP_HEADERS = {"host", "content-length", "connection", "accept-encoding"}


def write_receipt(record: dict) -> None:
    RECEIPTS.parent.mkdir(parents=True, exist_ok=True)
    with RECEIPTS.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, separators=(",", ":")) + "\n")


def receipt_for_chat(request_body: bytes, response_body: bytes, status: int, latency_ms: int) -> dict:
    record: dict = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "path": "/api/chat",
        "status": status,
        "latency_ms": latency_ms,
    }
    try:
        request = json.loads(request_body)
        prompt_text = json.dumps(request.get("messages", []), sort_keys=True)
        record["model"] = request.get("model")
        record["prompt_sha256"] = hashlib.sha256(prompt_text.encode("utf-8")).hexdigest()[:16]
        record["prompt_chars"] = len(prompt_text)
    except (ValueError, TypeError):
        record["model"] = None
    try:
        response = json.loads(response_body)
        record["prompt_tokens"] = response.get("prompt_eval_count")
        record["completion_tokens"] = response.get("eval_count")
        message = response.get("message") or {}
        record["response_chars"] = len(str(message.get("content") or ""))
    except (ValueError, TypeError):
        pass
    return record


class ProxyHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _forward(self) -> None:
        length = int(self.headers.get("content-length") or 0)
        request_body = self.rfile.read(length) if length else None
        headers = {k: v for k, v in self.headers.items() if k.lower() not in HOP_HEADERS}
        upstream = urllib.request.Request(
            f"{TARGET}{self.path}", data=request_body, headers=headers, method=self.command
        )
        started = time.monotonic()
        try:
            with urllib.request.urlopen(upstream, timeout=120) as response:
                status = response.status
                response_body = response.read()
                content_type = response.headers.get("content-type", "application/json")
        except urllib.error.HTTPError as error:
            status = error.code
            response_body = error.read()
            content_type = error.headers.get("content-type", "application/json")
        except (urllib.error.URLError, TimeoutError, OSError):
            self.send_error(502, "upstream unreachable")
            return
        latency_ms = int((time.monotonic() - started) * 1000)

        if self.command == "POST" and self.path == "/api/chat":
            write_receipt(receipt_for_chat(request_body or b"", response_body, status, latency_ms))

        self.send_response(status)
        self.send_header("content-type", content_type)
        self.send_header("content-length", str(len(response_body)))
        self.end_headers()
        self.wfile.write(response_body)

    do_GET = do_POST = do_DELETE = do_HEAD = _forward

    def log_message(self, fmt: str, *args) -> None:  # quiet; receipts are the record
        pass


def summarize() -> int:
    if not RECEIPTS.exists():
        print(f"no receipts yet at {RECEIPTS}")
        return 0
    days: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for line in RECEIPTS.read_text(encoding="utf-8").splitlines():
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue
        day = str(record.get("ts", ""))[:10]
        bucket = days[day]
        bucket["calls"] += 1
        bucket["prompt_tokens"] += int(record.get("prompt_tokens") or 0)
        bucket["completion_tokens"] += int(record.get("completion_tokens") or 0)
        bucket["latency_ms_total"] += int(record.get("latency_ms") or 0)
        if record.get("status") != 200:
            bucket["errors"] += 1
    print(f"{'day':<12}{'calls':>7}{'prompt_tok':>12}{'completion_tok':>16}{'avg_ms':>9}{'errors':>8}")
    for day in sorted(days):
        b = days[day]
        avg_ms = b["latency_ms_total"] // b["calls"] if b["calls"] else 0
        print(f"{day:<12}{b['calls']:>7}{b['prompt_tokens']:>12}{b['completion_tokens']:>16}{avg_ms:>9}{b['errors']:>8}")
    return 0


def main() -> int:
    if "--summary" in sys.argv:
        return summarize()
    server = ThreadingHTTPServer(LISTEN, ProxyHandler)
    print(f"receipt proxy: {LISTEN[0]}:{LISTEN[1]} -> {TARGET}; receipts -> {RECEIPTS}", flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
