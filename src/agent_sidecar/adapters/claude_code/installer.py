from __future__ import annotations

import json
import os
import shlex
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any


HOOK_EVENTS = ["SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "Stop"]
SIDEcar_MARKER = "AGENT_SIDECAR_HOOK=1"


def settings_path(repo_path: Path) -> Path:
    return repo_path / ".claude" / "settings.json"


def backup_path(repo_path: Path) -> Path:
    return repo_path / ".claude" / "settings.json.agent-sidecar.bak"


def install_hooks(repo_path: Path, *, api_url: str | None = None) -> dict[str, Any]:
    path = settings_path(repo_path)
    original_bytes = path.read_bytes() if path.exists() else b"{}"
    settings = json.loads(original_bytes.decode("utf-8") or "{}")
    if not isinstance(settings, dict):
        raise ValueError("Claude settings must be a JSON object")
    path.parent.mkdir(parents=True, exist_ok=True)
    backup = backup_path(repo_path)
    if not backup.exists():
        backup.write_bytes(original_bytes)
    hooks = settings.setdefault("hooks", {})
    command = hook_command(api_url)
    changed = False
    for event in HOOK_EVENTS:
        entries = hooks.setdefault(event, [])
        if not any(is_sidecar_entry(entry) for entry in entries):
            entries.append({"matcher": "*", "hooks": [hook_handler(event, command)]})
            changed = True
    path.write_text(json.dumps(settings, indent=2) + "\n", encoding="utf-8")
    return {"path": str(path), "installed": True, "changed": changed, "events": HOOK_EVENTS}


def uninstall_hooks(repo_path: Path) -> dict[str, Any]:
    path = settings_path(repo_path)
    if not path.exists():
        return {"path": str(path), "installed": False, "changed": False}
    current_bytes = path.read_bytes()
    settings = json.loads(current_bytes.decode("utf-8") or "{}")
    if not isinstance(settings, dict):
        raise ValueError("Claude settings must be a JSON object")
    stripped = strip_sidecar_hooks(deepcopy(settings))
    backup = backup_path(repo_path)
    if backup.exists():
        backup_settings = json.loads(backup.read_text(encoding="utf-8") or "{}")
        if normalized_json(stripped) == normalized_json(backup_settings):
            path.write_bytes(backup.read_bytes())
            backup.unlink(missing_ok=True)
            return {"path": str(path), "installed": False, "changed": True, "restored_backup": True}
    path.write_text(json.dumps(stripped, indent=2) + "\n", encoding="utf-8")
    backup.unlink(missing_ok=True)
    return {"path": str(path), "installed": has_sidecar_hooks(stripped), "changed": normalized_json(settings) != normalized_json(stripped)}


def hooks_status(repo_path: Path) -> dict[str, Any]:
    path = settings_path(repo_path)
    if not path.exists():
        return {"path": str(path), "installed": False, "events": []}
    settings = json.loads(path.read_text(encoding="utf-8") or "{}")
    hooks = settings.get("hooks", {}) if isinstance(settings, dict) else {}
    events = [event for event in HOOK_EVENTS if any(is_sidecar_entry(entry) for entry in hooks.get(event, []))]
    return {"path": str(path), "installed": len(events) == len(HOOK_EVENTS), "events": events}


def hook_command(api_url: str | None = None) -> str:
    env = f"{SIDEcar_MARKER} "
    if api_url:
        env += f"AGENT_SIDECAR_API_URL={shlex.quote(api_url)} "
    return env + f"{shlex.quote(sys.executable)} -m agent_sidecar.adapters.claude_code.hook_script"


def hook_handler(event: str, command: str) -> dict[str, Any]:
    handler: dict[str, Any] = {"type": "command", "command": command}
    if event == "UserPromptSubmit":
        handler["timeout"] = 30
    return handler


def is_sidecar_entry(entry: Any) -> bool:
    if not isinstance(entry, dict):
        return False
    hooks = entry.get("hooks")
    if not isinstance(hooks, list):
        return False
    return any(isinstance(hook, dict) and SIDEcar_MARKER in str(hook.get("command", "")) for hook in hooks)


def strip_sidecar_hooks(settings: dict[str, Any]) -> dict[str, Any]:
    hooks = settings.get("hooks")
    if not isinstance(hooks, dict):
        return settings
    for event in list(hooks.keys()):
        entries = hooks.get(event)
        if isinstance(entries, list):
            hooks[event] = [entry for entry in entries if not is_sidecar_entry(entry)]
            if not hooks[event]:
                del hooks[event]
    if not hooks:
        settings.pop("hooks", None)
    return settings


def has_sidecar_hooks(settings: dict[str, Any]) -> bool:
    hooks = settings.get("hooks", {})
    return isinstance(hooks, dict) and any(any(is_sidecar_entry(entry) for entry in entries) for entries in hooks.values() if isinstance(entries, list))


def normalized_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))
