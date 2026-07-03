from __future__ import annotations

from pydantic import BaseModel


class RunSummary(BaseModel):
    session_id: str
    events: int
    cost_usd: dict | None = None
    tokens: dict | None = None
    steering_events: list[str] = []
