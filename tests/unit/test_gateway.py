from __future__ import annotations

import json
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from agent_sidecar.gateway.capture import build_trace, has_malformed_tool_call, stop_reason_from_response, usage_from_response
from agent_sidecar.gateway.policies import evaluate_request_policies, finalize_decisions
from agent_sidecar.gateway.report import build_report, render_markdown, render_terminal
from agent_sidecar.gateway.server import GatewayState, make_handler
from agent_sidecar.gateway.traces import RetryDetector, TraceRecord, TraceStore, TraceUsage, normalized_request_hash
from agent_sidecar.schema.config import GatewayPoliciesConfig, SidecarConfig, TraceCaptureConfig


OLLAMA_RESPONSE = {"model": "llama3:latest", "prompt_eval_count": 120, "eval_count": 45, "done_reason": "stop"}
OPENAI_RESPONSE = {
    "model": "gpt-x",
    "usage": {"prompt_tokens": 10, "completion_tokens": 20},
    "choices": [{"finish_reason": "tool_calls", "message": {"tool_calls": [{"function": {"name": "run", "arguments": "{not json"}}]}}],
}
ANTHROPIC_RESPONSE = {
    "model": "claude-sonnet-5",
    "stop_reason": "end_turn",
    "usage": {"input_tokens": 5, "output_tokens": 7, "cache_read_input_tokens": 100, "cache_creation_input_tokens": 30},
}


def test_usage_and_stop_reason_parse_across_provider_shapes() -> None:
    assert usage_from_response(OLLAMA_RESPONSE) == TraceUsage(input=120, output=45)
    assert usage_from_response(OPENAI_RESPONSE) == TraceUsage(input=10, output=20)
    assert usage_from_response(ANTHROPIC_RESPONSE) == TraceUsage(input=5, output=7, cache_read=100, cache_creation=30)
    assert stop_reason_from_response(OLLAMA_RESPONSE) == "stop"
    assert stop_reason_from_response(OPENAI_RESPONSE) == "tool_calls"
    assert stop_reason_from_response(ANTHROPIC_RESPONSE) == "end_turn"


def test_malformed_tool_call_detection() -> None:
    assert has_malformed_tool_call(OPENAI_RESPONSE) is True
    valid = {"message": {"tool_calls": [{"function": {"name": "run", "arguments": "{\"a\": 1}"}}]}}
    assert has_malformed_tool_call(valid) is False
    assert has_malformed_tool_call(ANTHROPIC_RESPONSE) is False


def test_retry_detection_normalizes_content_and_respects_window_and_session() -> None:
    payload_a = {"model": "m", "messages": [{"role": "user", "content": "fix   the bug"}], "temperature": 0.2}
    payload_b = {"model": "m", "messages": [{"role": "user", "content": "fix the bug"}], "temperature": 0.9}
    hash_a, _ = normalized_request_hash(payload_a)
    hash_b, _ = normalized_request_hash(payload_b)
    assert hash_a == hash_b

    detector = RetryDetector(window_seconds=60)
    assert detector.observe("s1", hash_a, now=0.0, trace_id="t1") == (False, None, 0)
    assert detector.observe("s1", hash_a, now=10.0, trace_id="t2") == (True, "t1", 1)
    # Different session is never a retry.
    assert detector.observe("s2", hash_a, now=10.0, trace_id="t3") == (False, None, 0)
    # Outside the window the match expires.
    assert detector.observe("s1", hash_a, now=1000.0, trace_id="t4") == (False, None, 0)


def test_build_trace_redacts_content_but_keeps_metadata(tmp_path: Path) -> None:
    capture = TraceCaptureConfig(redact_content=True)
    detector = RetryDetector(window_seconds=60)
    record = build_trace(
        session_id="s1",
        path="/api/chat",
        request_body=json.dumps({"model": "llama3:latest", "messages": [{"role": "user", "content": "secret prompt"}]}).encode(),
        response_body=json.dumps(OLLAMA_RESPONSE).encode(),
        status=200,
        latency_ms=42,
        capture=capture,
        detector=detector,
        now=0.0,
    )
    assert record.redacted is True
    assert record.request is None and record.response is None
    assert record.model == "llama3:latest"
    assert record.usage.input == 120 and record.usage.output == 45
    assert record.request_sha256 and record.request_chars > 0
    assert "secret" not in record.model_dump_json()


def test_trace_store_round_trip(tmp_path: Path) -> None:
    store = TraceStore(tmp_path, TraceCaptureConfig())
    record = TraceRecord(timestamp="2026-08-10T00:00:00Z", session_id="s1", path="/api/chat", status=200, latency_ms=5, request_sha256="abc", request_chars=3)
    store.append(record)
    loaded = list(store.iter_records())
    assert len(loaded) == 1
    assert loaded[0].trace_id == record.trace_id


def test_token_cap_policy_shadow_logs_and_enforce_clamps() -> None:
    request = {"model": "m", "messages": [], "max_tokens": 9000, "options": {"num_predict": 9000}}
    shadow = evaluate_request_policies(request, retry_count=0, policies=GatewayPoliciesConfig())
    assert [d.action for d in shadow.decisions] == ["would_cap_output_tokens"]
    assert shadow.modified_request is None and shadow.block_response is None

    policies = GatewayPoliciesConfig()
    policies.token_caps.mode = "enforce"
    enforced = evaluate_request_policies(request, retry_count=0, policies=policies)
    assert enforced.modified_request["max_tokens"] == policies.token_caps.max_output_tokens
    assert enforced.modified_request["options"]["num_predict"] == policies.token_caps.max_output_tokens
    assert enforced.decisions[0].enforced is True


def test_retry_suppression_policy_shadow_passes_and_enforce_blocks() -> None:
    request = {"model": "m", "messages": [{"role": "user", "content": "x"}]}
    shadow = evaluate_request_policies(request, retry_count=3, policies=GatewayPoliciesConfig())
    assert [d.action for d in shadow.decisions] == ["would_suppress_retry"]
    assert shadow.block_response is None

    policies = GatewayPoliciesConfig()
    policies.retry_suppression.mode = "enforce"
    enforced = evaluate_request_policies(request, retry_count=3, policies=policies)
    assert enforced.block_response["error"]["type"] == "sidecar_retry_suppressed"


def test_context_compaction_policy_is_log_only_even_in_enforce_mode() -> None:
    policies = GatewayPoliciesConfig()
    policies.context_compaction.mode = "enforce"
    policies.context_compaction.context_token_threshold = 10
    request = {"model": "m", "messages": [{"role": "user", "content": "word " * 200}]}
    outcome = evaluate_request_policies(request, retry_count=0, policies=policies)
    decision = next(d for d in outcome.decisions if d.policy == "context_compaction")
    assert decision.action == "would_compact_context"
    assert decision.enforced is False
    assert decision.estimated_saved_tokens > 0
    assert outcome.modified_request is None and outcome.block_response is None


def test_finalize_decisions_prices_retry_savings_from_actual_usage(tmp_path: Path) -> None:
    outcome = evaluate_request_policies({"model": "claude-sonnet-4", "messages": []}, retry_count=5, policies=GatewayPoliciesConfig())
    finalized = finalize_decisions(
        outcome.decisions,
        usage=TraceUsage(input=1000, output=500),
        model="claude-sonnet-4",
        config=SidecarConfig(),
        repo_path=tmp_path,
    )
    assert finalized[0].estimated_saved_tokens == 1500
    assert finalized[0].estimated_saved_usd > 0


def _record(**overrides) -> TraceRecord:
    base = dict(timestamp="2026-08-10T00:00:00Z", session_id="s1", path="/api/chat", status=200, latency_ms=100, request_sha256="abc", request_chars=10, model="llama3:latest")
    base.update(overrides)
    return TraceRecord(**base)


def test_build_report_aggregates_retries_malformed_latency_and_policies(tmp_path: Path) -> None:
    records = [
        _record(latency_ms=100, usage=TraceUsage(input=100, output=50)),
        _record(latency_ms=300, usage=TraceUsage(input=100, output=50), is_retry=True),
        _record(latency_ms=200, malformed_tool_call=True),
        _record(latency_ms=400, policy_decisions=[{"policy": "token_caps", "mode": "shadow", "action": "would_cap_output_tokens", "reason": "r", "estimated_saved_tokens": 700, "estimated_saved_usd": 0.01}]),
    ]
    report = build_report(records, SidecarConfig(), tmp_path)

    assert report["requests"] == 4
    assert report["retry"]["count"] == 1 and report["retry"]["rate_pct"] == 25.0
    assert report["retry"]["wasted_input_tokens"] == 100 and report["retry"]["wasted_output_tokens"] == 50
    assert report["malformed_tool_calls"]["count"] == 1
    assert report["latency_ms"]["p50"] == 200 and report["latency_ms"]["p95"] == 400
    assert report["policies"]["token_caps"]["projected_saved_tokens"] == 700
    assert report["by_model"]["llama3:latest"]["requests"] == 4

    terminal = render_terminal(report)
    markdown = render_markdown(report)
    assert "Retry rate: 25.0%" in terminal
    assert "| token_caps | shadow | 1 | 700 |" in markdown


class _FakeUpstream(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("content-length", "0"))
        self.rfile.read(length)
        body = json.dumps(OLLAMA_RESPONSE).encode("utf-8")
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args) -> None:
        return


def test_gateway_end_to_end_captures_traces_and_flags_retries(tmp_path: Path) -> None:
    upstream = ThreadingHTTPServer(("127.0.0.1", 0), _FakeUpstream)
    threading.Thread(target=upstream.serve_forever, daemon=True).start()

    config = SidecarConfig()
    config.gateway.target_base = f"http://127.0.0.1:{upstream.server_port}"
    state = GatewayState(tmp_path, config)
    gateway = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(state))
    threading.Thread(target=gateway.serve_forever, daemon=True).start()

    try:
        payload = json.dumps({"model": "llama3:latest", "messages": [{"role": "user", "content": "hello"}]}).encode()
        for _ in range(2):
            request = urllib.request.Request(
                f"http://127.0.0.1:{gateway.server_port}/api/chat",
                data=payload,
                headers={"content-type": "application/json", "x-sidecar-session": "cc-e2e"},
            )
            with urllib.request.urlopen(request, timeout=5) as response:
                assert response.status == 200
                assert json.loads(response.read())["model"] == "llama3:latest"
    finally:
        gateway.shutdown()
        gateway.server_close()
        upstream.shutdown()
        upstream.server_close()

    records = list(state.store.iter_records())
    assert len(records) == 2
    assert records[0].is_retry is False
    assert records[1].is_retry is True and records[1].retry_of == records[0].trace_id
    assert records[1].session_id == "cc-e2e"
    assert records[1].usage.input == 120 and records[1].usage.output == 45
    assert records[1].stop_reason == "stop"


def test_gateway_enforced_retry_suppression_blocks_third_attempt(tmp_path: Path) -> None:
    upstream = ThreadingHTTPServer(("127.0.0.1", 0), _FakeUpstream)
    threading.Thread(target=upstream.serve_forever, daemon=True).start()

    config = SidecarConfig()
    config.gateway.target_base = f"http://127.0.0.1:{upstream.server_port}"
    config.gateway.policies.retry_suppression.mode = "enforce"
    config.gateway.policies.retry_suppression.max_retries = 1
    state = GatewayState(tmp_path, config)
    gateway = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(state))
    threading.Thread(target=gateway.serve_forever, daemon=True).start()

    statuses = []
    try:
        payload = json.dumps({"model": "llama3:latest", "messages": [{"role": "user", "content": "same"}]}).encode()
        for _ in range(3):
            request = urllib.request.Request(
                f"http://127.0.0.1:{gateway.server_port}/api/chat",
                data=payload,
                headers={"content-type": "application/json", "x-sidecar-session": "cc-e2e"},
            )
            try:
                with urllib.request.urlopen(request, timeout=5) as response:
                    statuses.append(response.status)
            except urllib.error.HTTPError as error:
                statuses.append(error.code)
                assert json.loads(error.read())["error"]["type"] == "sidecar_retry_suppressed"
    finally:
        gateway.shutdown()
        gateway.server_close()
        upstream.shutdown()
        upstream.server_close()

    assert statuses == [200, 200, 429]
    records = list(state.store.iter_records())
    blocked = records[2]
    assert blocked.status == 429
    assert blocked.policy_decisions[0].policy == "retry_suppression"
    assert blocked.policy_decisions[0].enforced is True
