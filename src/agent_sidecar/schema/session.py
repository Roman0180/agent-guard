from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class Precision(str, Enum):
    measured = "measured"
    priced = "priced"
    approximate = "approximate"


class TokenUsage(BaseModel):
    input: int = Field(default=0, ge=0)
    output: int = Field(default=0, ge=0)
    cache_read: int = Field(default=0, ge=0)
    precision: Precision


class Money(BaseModel):
    value: float = Field(default=0.0, ge=0.0)
    precision: Precision


class SessionRecord(BaseModel):
    session_id: str
    agent: Literal["claude-code"] = "claude-code"
    repo_path: str
    status: Literal["active", "stopped"]
    started_at: datetime
    stopped_at: datetime | None = None
    trace_path: str
    event_count: int = 0
    observation: dict[str, bool]
    tokens: TokenUsage | None = None
    cost_usd: Money | None = None
    model: str | None = None
    config_snapshot: dict
