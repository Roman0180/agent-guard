from __future__ import annotations

import asyncio
import json
import os
import signal
import subprocess
import sys
from pathlib import Path
from typing import Any

import httpx
import uvicorn

from agent_sidecar.daemon.app import create_api_app, create_otlp_app
from agent_sidecar.schema.config import config_dir, load_config


DEFAULT_HOST = "127.0.0.1"


def state_path(repo_path: Path) -> Path:
    return config_dir(repo_path) / "daemon.json"


def write_state(repo_path: Path, state: dict[str, Any]) -> None:
    path = state_path(repo_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")


def read_state(repo_path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(state_path(repo_path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def start_background(repo_path: Path, api_port: int | None = None, otlp_port: int | None = None) -> dict[str, Any]:
    config = load_config(repo_path)
    api_port = api_port or config.daemon.api_port
    otlp_port = otlp_port or config.daemon.otlp_port
    existing = read_state(repo_path)
    if existing and is_running(existing):
        return existing
    env = {
        **os.environ,
        "AGENT_SIDECAR_REPO_PATH": str(repo_path.resolve()),
        "AGENT_SIDECAR_API_PORT": str(api_port),
        "AGENT_SIDECAR_OTLP_PORT": str(otlp_port),
    }
    process = subprocess.Popen(
        [sys.executable, "-m", "agent_sidecar.daemon.runner", "serve", "--api-port", str(api_port), "--otlp-port", str(otlp_port)],
        cwd=repo_path,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    state = {
        "pid": process.pid,
        "api_url": f"http://{DEFAULT_HOST}:{api_port}",
        "otlp_url": f"http://{DEFAULT_HOST}:{otlp_port}",
        "repo_path": str(repo_path.resolve()),
    }
    write_state(repo_path, state)
    return state


def is_running(state: dict[str, Any]) -> bool:
    pid = state.get("pid")
    if not isinstance(pid, int) or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def daemon_api_url(repo_path: Path) -> str:
    configured = os.environ.get("AGENT_SIDECAR_API_URL")
    if configured:
        return configured.rstrip("/")
    state = read_state(repo_path)
    if state and is_running(state) and isinstance(state.get("api_url"), str):
        return state["api_url"].rstrip("/")
    config = load_config(repo_path)
    return f"http://{DEFAULT_HOST}:{config.daemon.api_port}"


async def serve(api_port: int, otlp_port: int) -> None:
    api = uvicorn.Server(uvicorn.Config(create_api_app(), host=DEFAULT_HOST, port=api_port, log_level="warning"))
    otlp = uvicorn.Server(uvicorn.Config(create_otlp_app(), host=DEFAULT_HOST, port=otlp_port, log_level="warning"))
    loop = asyncio.get_running_loop()
    stop = asyncio.Event()

    def request_stop() -> None:
        api.should_exit = True
        otlp.should_exit = True
        stop.set()

    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, request_stop)
        except NotImplementedError:
            pass
    await asyncio.gather(api.serve(), otlp.serve(), stop.wait())


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "serve":
        api_port = int(_arg_value("--api-port", os.environ.get("AGENT_SIDECAR_API_PORT", "7433")))
        otlp_port = int(_arg_value("--otlp-port", os.environ.get("AGENT_SIDECAR_OTLP_PORT", "4318")))
        asyncio.run(serve(api_port, otlp_port))


def _arg_value(flag: str, default: str) -> str:
    if flag in sys.argv:
        index = sys.argv.index(flag)
        if index + 1 < len(sys.argv):
            return sys.argv[index + 1]
    return default


def wait_for_health(api_url: str, timeout_s: float = 5.0) -> bool:
    # Use a simple sync loop to keep CLI startup dependency-free.
    import time

    end = time.monotonic() + timeout_s
    while time.monotonic() < end:
        try:
            response = httpx.get(f"{api_url}/health", timeout=0.2)
            if response.status_code == 200:
                return True
        except httpx.HTTPError:
            time.sleep(0.1)
    return False


if __name__ == "__main__":
    main()
