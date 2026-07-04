from __future__ import annotations

import re
import shlex
from pathlib import Path
from typing import Any

from agent_sidecar.schema.events import SidecarEvent


_TMP_RE = re.compile(r"(/private)?/var/folders/\S+|/tmp/\S+")
_SPACE_RE = re.compile(r"\s+")


def normalize_command(command: str) -> str:
    command = _TMP_RE.sub("<tmp>", command.strip())
    command = _SPACE_RE.sub(" ", command)
    try:
        parts = shlex.split(command)
    except ValueError:
        parts = command.split()
    normalized: list[str] = []
    skip_next = False
    for part in parts:
        if skip_next:
            skip_next = False
            continue
        if part in {"--watch", "--watchAll", "--color", "--no-color"}:
            continue
        if part in {"--output", "-o"}:
            skip_next = True
            continue
        normalized.append(part)
    return " ".join(normalized) or command


def command_from_event(event: SidecarEvent) -> str | None:
    payload = event.payload
    for key in ("normalized_command", "command", "tool_input_summary"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return normalize_command(value)
    raw = payload.get("raw_hook")
    if isinstance(raw, dict):
        found = _nested_value(raw, {"command", "cmd"})
        if isinstance(found, str) and found.strip():
            return normalize_command(found)
    return None


def edited_path_from_event(event: SidecarEvent) -> str | None:
    value = event.payload.get("path")
    if isinstance(value, str) and value:
        return str(Path(value))
    return None


def prompt_keywords(prompt: str) -> set[str]:
    stop = {"the", "and", "for", "with", "fix", "make", "app", "test", "tests", "run"}
    return {word for word in re.findall(r"[a-zA-Z][a-zA-Z0-9_-]{2,}", prompt.lower()) if word not in stop}


def path_keywords(path: str) -> set[str]:
    return {word for word in re.findall(r"[a-zA-Z][a-zA-Z0-9_-]{2,}", path.lower())}


def _nested_value(value: Any, keys: set[str]) -> Any:
    if isinstance(value, dict):
        for key, child in value.items():
            if key in keys:
                return child
            found = _nested_value(child, keys)
            if found is not None:
                return found
    if isinstance(value, list):
        for child in value:
            found = _nested_value(child, keys)
            if found is not None:
                return found
    return None
