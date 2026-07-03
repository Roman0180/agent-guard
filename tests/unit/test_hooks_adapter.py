from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

from agent_sidecar.adapters.claude_code.hooks_adapter import events_from_hook
from agent_sidecar.adapters.claude_code.installer import hooks_status, install_hooks, settings_path, uninstall_hooks


FIXTURES = Path("evals/fixtures/hooks")


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


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
        timeout=1,
        check=False,
    )

    assert result.returncode == 0
    assert time.monotonic() - started < 1
    assert result.stdout == ""
    assert result.stderr == ""
