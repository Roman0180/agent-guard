from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from agent_sidecar.adapters.claude_code.hooks_adapter import events_from_hook
from agent_sidecar.adapters.claude_code.installer import hooks_status, install_hooks, settings_path, uninstall_hooks


FIXTURES = Path("evals/fixtures/hooks")


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def request_body(requests: list[tuple[str, dict]], path: str) -> dict:
    return next(body for request_path, body in requests if request_path == path)


def test_prompt_hook_maps_to_prompt_submitted() -> None:
    [event] = events_from_hook(load_fixture("user_prompt_submit.json"))

    assert event.event_type == "prompt_submitted"
    assert event.session_id == "cc-fixture-session"
    assert event.payload["prompt"] == "fix auth refresh and run tests"
    assert event.payload["raw_hook"]["hook_event_name"] == "UserPromptSubmit"


def test_edit_hook_derives_file_edit_event() -> None:
    events = events_from_hook(load_fixture("post_tool_use_edit.json"))

    assert [event.event_type for event in events] == ["agent_tool_observed", "file_edit_observed"]
    assert events[1].payload["path"] == "packages/auth/src/refresh.ts"


def test_failed_bash_test_derives_test_run_and_failure() -> None:
    events = events_from_hook(load_fixture("post_tool_use_failed_test.json"))

    assert [event.event_type for event in events] == ["agent_tool_observed", "test_run_observed", "test_failure_observed"]
    assert events[2].payload["failure_signature"] == "AssertionError: expected 401 to equal 200"


def test_hook_install_uninstall_preserves_existing_settings_bytes(tmp_path: Path) -> None:
    settings = tmp_path / ".claude" / "settings.json"
    settings.parent.mkdir()
    original = b'{\n  "hooks": {\n    "PreToolUse": [\n      {"matcher": "Bash", "hooks": [{"type": "command", "command": "echo existing"}]}\n    ]\n  }\n}\n'
    settings.write_bytes(original)

    first = install_hooks(tmp_path, api_url="http://127.0.0.1:7433")
    second = install_hooks(tmp_path, api_url="http://127.0.0.1:7433")
    status = hooks_status(tmp_path)
    removed = uninstall_hooks(tmp_path)

    assert first["installed"] is True
    assert second["installed"] is True
    assert status["installed"] is True
    assert removed["installed"] is False
    assert settings_path(tmp_path).read_bytes() == original


def test_hook_script_exits_zero_fast_when_daemon_is_down() -> None:
    env = {
        **os.environ,
        "PYTHONPATH": str(Path.cwd() / "src"),
        "AGENT_SIDECAR_API_URL": "http://127.0.0.1:9",
    }
    started = time.monotonic()
    result = subprocess.run(
        [sys.executable, "-m", "agent_sidecar.adapters.claude_code.hook_script"],
        input=json.dumps(load_fixture("user_prompt_submit.json")),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
        timeout=3,
        check=False,
    )

    assert result.returncode == 0
    assert time.monotonic() - started < 2.0
    assert result.stdout == ""
    assert result.stderr == ""


def test_user_prompt_hook_returns_additional_context_from_refine() -> None:
    requests: list[tuple[str, dict]] = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802
            length = int(self.headers.get("content-length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            requests.append((self.path, body))
            if self.path == "/refine":
                response = {
                    "source": "deterministic",
                    "quality": "low",
                    "issues": ["prompt is underspecified"],
                    "refined_prompt": "Task: fix auth refresh and run pnpm test.",
                    "acceptance_criteria": ["auth refresh succeeds", "pnpm test passes"],
                    "testing_expectations": "Run pnpm test.",
                    "do_not_change": ["unrelated auth behavior"],
                }
            else:
                response = {"accepted": 1}
            encoded = json.dumps(response).encode("utf-8")
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def log_message(self, *_args) -> None:
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        env = {
            **os.environ,
            "PYTHONPATH": str(Path.cwd() / "src"),
            "AGENT_SIDECAR_API_URL": f"http://127.0.0.1:{server.server_port}",
        }
        result = subprocess.run(
            [sys.executable, "-m", "agent_sidecar.adapters.claude_code.hook_script"],
            input=json.dumps(load_fixture("user_prompt_submit.json")),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            timeout=5,
            check=False,
        )
    finally:
        server.shutdown()
        server.server_close()

    assert result.returncode == 0
    assert result.stderr == ""
    output = json.loads(result.stdout)
    assert output["suppressOutput"] is True
    assert output["hookSpecificOutput"]["hookEventName"] == "UserPromptSubmit"
    assert "Task: fix auth refresh" in output["hookSpecificOutput"]["additionalContext"]
    assert requests[0][0] == "/sessions/cc-fixture-session/events"
    refine_request = request_body(requests, "/refine")
    assert refine_request["record_prompt_submitted"] is False


def test_user_prompt_hook_configures_budget_and_includes_cost_guard() -> None:
    requests: list[tuple[str, dict]] = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802
            length = int(self.headers.get("content-length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            requests.append((self.path, body))
            if self.path.endswith("/budget/check"):
                response = {"configured": False, "action": "allow"}
            elif self.path.endswith("/budget"):
                response = {
                    "configured": True,
                    "action": "allow",
                    "baseline_cost_usd": 0.02,
                    "budget_usd": 0.018,
                    "current_cost_usd": 0.0,
                    "remaining_usd": 0.018,
                    "target_savings_pct": 10.0,
                }
            elif self.path == "/refine":
                response = {
                    "source": "deterministic",
                    "quality": "low",
                    "issues": [],
                    "refined_prompt": "Task: fix auth refresh and run pnpm test.",
                    "acceptance_criteria": ["auth refresh succeeds"],
                    "testing_expectations": "Run pnpm test.",
                    "do_not_change": [],
                }
            else:
                response = {"accepted": 1}
            encoded = json.dumps(response).encode("utf-8")
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def log_message(self, *_args) -> None:
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        env = {
            **os.environ,
            "PYTHONPATH": str(Path.cwd() / "src"),
            "AGENT_SIDECAR_API_URL": f"http://127.0.0.1:{server.server_port}",
            "AGENT_SIDECAR_BASELINE_SESSION": "cc-baseline",
            "AGENT_SIDECAR_TARGET_SAVINGS_PCT": "10",
            "AGENT_SIDECAR_REQUIRE_BUDGET": "1",
        }
        result = subprocess.run(
            [sys.executable, "-m", "agent_sidecar.adapters.claude_code.hook_script"],
            input=json.dumps(load_fixture("user_prompt_submit.json")),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            timeout=5,
            check=False,
        )
    finally:
        server.shutdown()
        server.server_close()

    assert result.returncode == 0
    output = json.loads(result.stdout)
    context = output["hookSpecificOutput"]["additionalContext"]
    assert "Cost guard:" in context
    assert "Stay under $0.018000" in context
    assert request_body(requests, "/sessions/cc-fixture-session/budget")["baseline_session_id"] == "cc-baseline"


def test_hook_blocks_when_budget_guard_blocks() -> None:
    requests: list[tuple[str, dict]] = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802
            length = int(self.headers.get("content-length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            requests.append((self.path, body))
            if self.path.endswith("/budget/check"):
                response = {
                    "configured": True,
                    "action": "block",
                    "current_cost_usd": 0.021,
                    "budget_usd": 0.018,
                    "remaining_usd": -0.003,
                }
            else:
                response = {"accepted": 1}
            encoded = json.dumps(response).encode("utf-8")
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def log_message(self, *_args) -> None:
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        payload = {
            **load_fixture("post_tool_use_failed_test.json"),
            "hook_event_name": "PreToolUse",
        }
        env = {
            **os.environ,
            "PYTHONPATH": str(Path.cwd() / "src"),
            "AGENT_SIDECAR_API_URL": f"http://127.0.0.1:{server.server_port}",
        }
        result = subprocess.run(
            [sys.executable, "-m", "agent_sidecar.adapters.claude_code.hook_script"],
            input=json.dumps(payload),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            timeout=5,
            check=False,
        )
    finally:
        server.shutdown()
        server.server_close()

    assert result.returncode == 0
    output = json.loads(result.stdout)
    assert output["decision"] == "block"
    assert "cost budget exceeded" in output["reason"]
    assert "/sessions/cc-fixture-session/budget/check" in [path for path, _body in requests]


def test_user_prompt_hook_blocks_when_required_ensemble_refine_fails() -> None:
    requests: list[tuple[str, dict]] = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802
            length = int(self.headers.get("content-length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            requests.append((self.path, body))
            if self.path == "/refine":
                response = {"detail": "model ensemble refinement required but unavailable"}
                status = 424
            else:
                response = {"accepted": 1}
                status = 200
            encoded = json.dumps(response).encode("utf-8")
            self.send_response(status)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def log_message(self, *_args) -> None:
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        env = {
            **os.environ,
            "PYTHONPATH": str(Path.cwd() / "src"),
            "AGENT_SIDECAR_API_URL": f"http://127.0.0.1:{server.server_port}",
            "AGENT_SIDECAR_REQUIRE_ENSEMBLE": "1",
        }
        result = subprocess.run(
            [sys.executable, "-m", "agent_sidecar.adapters.claude_code.hook_script"],
            input=json.dumps(load_fixture("user_prompt_submit.json")),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            timeout=5,
            check=False,
        )
    finally:
        server.shutdown()
        server.server_close()

    assert result.returncode == 0
    assert result.stderr == ""
    output = json.loads(result.stdout)
    assert output["decision"] == "block"
    assert output["continue"] is False
    assert "model ensemble refinement required" in output["reason"]
    assert request_body(requests, "/refine")["require_model_ensemble"] is True


def test_user_prompt_hook_requests_required_deepseek_refinement() -> None:
    requests: list[tuple[str, dict]] = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802
            length = int(self.headers.get("content-length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            requests.append((self.path, body))
            if self.path == "/refine":
                response = {
                    "source": "reasoning-only",
                    "quality": "medium",
                    "issues": [],
                    "refined_prompt": "Task: fix auth refresh and run pnpm test.",
                    "acceptance_criteria": ["auth refresh succeeds", "pnpm test passes"],
                    "testing_expectations": "Run pnpm test.",
                    "do_not_change": ["unrelated auth behavior"],
                }
            else:
                response = {"accepted": 1}
            encoded = json.dumps(response).encode("utf-8")
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def log_message(self, *_args) -> None:
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        env = {
            **os.environ,
            "PYTHONPATH": str(Path.cwd() / "src"),
            "AGENT_SIDECAR_API_URL": f"http://127.0.0.1:{server.server_port}",
            "AGENT_SIDECAR_REQUIRE_DEEPSEEK_REFINEMENT": "1",
        }
        result = subprocess.run(
            [sys.executable, "-m", "agent_sidecar.adapters.claude_code.hook_script"],
            input=json.dumps(load_fixture("user_prompt_submit.json")),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            timeout=5,
            check=False,
        )
    finally:
        server.shutdown()
        server.server_close()

    assert result.returncode == 0
    assert result.stderr == ""
    output = json.loads(result.stdout)
    assert output["suppressOutput"] is True
    assert "Source: reasoning-only" in output["hookSpecificOutput"]["additionalContext"]
    assert request_body(requests, "/refine")["require_reasoning_refinement"] is True


def test_user_prompt_hook_requests_kimi_after_deterministic_refinement() -> None:
    requests: list[tuple[str, dict]] = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802
            length = int(self.headers.get("content-length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            requests.append((self.path, body))
            if self.path == "/refine":
                response = {
                    "source": "deterministic-then-coding",
                    "quality": "low",
                    "issues": ["prompt is underspecified"],
                    "refined_prompt": "Task: fix auth refresh and run pnpm test.\n\nKimi implementation focus: Update refresh.ts.",
                    "acceptance_criteria": ["auth refresh succeeds", "pnpm test passes"],
                    "testing_expectations": "Run pnpm test.",
                    "do_not_change": ["unrelated auth behavior"],
                }
            else:
                response = {"accepted": 1}
            encoded = json.dumps(response).encode("utf-8")
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def log_message(self, *_args) -> None:
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        env = {
            **os.environ,
            "PYTHONPATH": str(Path.cwd() / "src"),
            "AGENT_SIDECAR_API_URL": f"http://127.0.0.1:{server.server_port}",
            "AGENT_SIDECAR_REQUIRE_KIMI_CODING": "1",
        }
        result = subprocess.run(
            [sys.executable, "-m", "agent_sidecar.adapters.claude_code.hook_script"],
            input=json.dumps(load_fixture("user_prompt_submit.json")),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            timeout=5,
            check=False,
        )
    finally:
        server.shutdown()
        server.server_close()

    assert result.returncode == 0
    assert result.stderr == ""
    output = json.loads(result.stdout)
    assert output["suppressOutput"] is True
    assert "Source: deterministic-then-coding" in output["hookSpecificOutput"]["additionalContext"]
    refine_request = request_body(requests, "/refine")
    assert refine_request["require_coding_refinement"] is True
    assert "require_reasoning_refinement" not in refine_request


def test_user_prompt_hook_uses_kimi_wrapper_when_enabled() -> None:
    requests: list[tuple[str, dict]] = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802
            length = int(self.headers.get("content-length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            requests.append((self.path, body))
            if self.path.endswith("/budget/check"):
                response = {"configured": False, "action": "allow"}
            elif self.path == "/wrap":
                response = {
                    "display_response": "Kimi produced the implementation response.",
                    "implementation_summary": "Kimi handled the refined task.",
                    "files_changed": ["packages/auth/src/refresh.ts"],
                    "validation_performed": "Run pnpm test.",
                    "needs_claude_execution": False,
                    "refined_prompt": "Task: fix auth refresh and run pnpm test.",
                    "refinement_source": "deterministic",
                    "quality": "low",
                    "issues": ["prompt is underspecified"],
                }
            else:
                response = {"accepted": 1}
            encoded = json.dumps(response).encode("utf-8")
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def log_message(self, *_args) -> None:
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        env = {
            **os.environ,
            "PYTHONPATH": str(Path.cwd() / "src"),
            "AGENT_SIDECAR_API_URL": f"http://127.0.0.1:{server.server_port}",
            "AGENT_SIDECAR_KIMI_WRAPPER": "1",
        }
        result = subprocess.run(
            [sys.executable, "-m", "agent_sidecar.adapters.claude_code.hook_script"],
            input=json.dumps(load_fixture("user_prompt_submit.json")),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            timeout=5,
            check=False,
        )
    finally:
        server.shutdown()
        server.server_close()

    assert result.returncode == 0
    assert result.stderr == ""
    output = json.loads(result.stdout)
    assert output["decision"] == "block"
    assert output["continue"] is False
    assert "Kimi produced the implementation response" in output["reason"]
    assert request_body(requests, "/wrap")["record_prompt_submitted"] is False
    assert "/refine" not in [path for path, _body in requests]


def test_user_prompt_hook_requests_required_deepseek_and_kimi_refinement() -> None:
    requests: list[tuple[str, dict]] = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802
            length = int(self.headers.get("content-length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            requests.append((self.path, body))
            if self.path == "/refine":
                response = {
                    "source": "reasoning-then-coding",
                    "quality": "medium",
                    "issues": [],
                    "refined_prompt": "Update packages/auth/src/refresh.ts so auth refresh succeeds, then run pnpm test.",
                    "acceptance_criteria": ["auth refresh succeeds", "pnpm test passes"],
                    "testing_expectations": "Run pnpm test.",
                    "do_not_change": ["unrelated auth behavior"],
                }
            else:
                response = {"accepted": 1}
            encoded = json.dumps(response).encode("utf-8")
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def log_message(self, *_args) -> None:
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        env = {
            **os.environ,
            "PYTHONPATH": str(Path.cwd() / "src"),
            "AGENT_SIDECAR_API_URL": f"http://127.0.0.1:{server.server_port}",
            "AGENT_SIDECAR_REQUIRE_DEEPSEEK_REFINEMENT": "1",
            "AGENT_SIDECAR_REQUIRE_KIMI_CODING": "1",
        }
        result = subprocess.run(
            [sys.executable, "-m", "agent_sidecar.adapters.claude_code.hook_script"],
            input=json.dumps(load_fixture("user_prompt_submit.json")),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            timeout=5,
            check=False,
        )
    finally:
        server.shutdown()
        server.server_close()

    assert result.returncode == 0
    assert result.stderr == ""
    output = json.loads(result.stdout)
    assert output["suppressOutput"] is True
    assert "Source: reasoning-then-coding" in output["hookSpecificOutput"]["additionalContext"]
    refine_request = request_body(requests, "/refine")
    assert refine_request["require_reasoning_refinement"] is True
    assert refine_request["require_coding_refinement"] is True
