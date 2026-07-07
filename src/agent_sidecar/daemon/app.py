from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agent_sidecar.daemon.api import create_api_router
from agent_sidecar.daemon.otlp import create_otlp_router
from agent_sidecar.schema.config import load_config
from agent_sidecar.store.sessions import SessionManager


def repo_path_from_env() -> Path:
    return Path(os.environ.get("AGENT_SIDECAR_REPO_PATH", os.getcwd())).resolve()


@lru_cache(maxsize=1)
def get_manager() -> SessionManager:
    repo_path = repo_path_from_env()
    return SessionManager(repo_path, load_config(repo_path))


def create_app() -> FastAPI:
    app = FastAPI(title="Agent Sidecar")
    _add_local_dashboard_cors(app)
    app.include_router(create_api_router(get_manager))
    app.include_router(create_otlp_router(get_manager))
    return app


def create_api_app() -> FastAPI:
    app = FastAPI(title="Agent Sidecar API")
    _add_local_dashboard_cors(app)
    app.include_router(create_api_router(get_manager))
    return app


def create_otlp_app() -> FastAPI:
    app = FastAPI(title="Agent Sidecar OTLP")
    app.include_router(create_otlp_router(get_manager))
    return app


def _add_local_dashboard_cors(app: FastAPI) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?",
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )
