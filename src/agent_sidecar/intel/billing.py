"""Billing-mode detection: dollars for usage-credit users, capacity for plan users.

Detection ladder (docs/CAPACITY_VALUE_PLAN.md, phase 2), first match wins:

1. Explicit override in config (`billing.mode` != "auto") — always respected.
2. Auto-detect from Claude Code's local state (`~/.claude.json` -> `oauthAccount`).
   Only four billing fields are ever read: billingType, organizationType,
   organizationRateLimitTier, hasExtraUsageEnabled. Never credentials or identity.
3. Fallback: credits (dollars are always true; capacity framing is only shown
   when a plan is confirmed).

The state file is an undocumented Claude Code internal — every read is optional
and any parse failure falls through to the fallback rung.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from agent_sidecar.schema.config import SidecarConfig

# Known plan tiers -> monthly USD. Unknown tiers yield no price (the dashboard
# then shows the multiplier without a dollar equivalence rather than guessing).
TIER_MONTHLY_USD: dict[str, float] = {
    "default_claude_max_20x": 200.0,
    "default_claude_max_5x": 100.0,
    "default_claude_pro": 20.0,
}

SUBSCRIPTION_BILLING_TYPES = {"stripe_subscription"}
PLAN_ORG_TYPES = {"claude_max", "claude_pro"}


def default_claude_state_path() -> Path:
    return Path.home() / ".claude.json"


def detect_billing(config: SidecarConfig, claude_state_path: Path | None = None) -> dict[str, Any]:
    billing = config.billing
    if billing.mode != "auto":
        return {
            "mode": billing.mode,
            "source": "config",
            "tier": billing.tier,
            "planMonthlyUsd": billing.monthly_usd,
            "extraUsageEnabled": False,
        }

    oauth = _read_oauth_account(claude_state_path or default_claude_state_path())
    billing_type = str(oauth.get("billingType") or "")
    org_type = str(oauth.get("organizationType") or "")
    tier = str(oauth.get("organizationRateLimitTier") or "") or None
    extra_usage = bool(oauth.get("hasExtraUsageEnabled"))

    if billing_type in SUBSCRIPTION_BILLING_TYPES or org_type in PLAN_ORG_TYPES:
        return {
            "mode": "plan",
            "source": "detected",
            "tier": tier,
            "planMonthlyUsd": billing.monthly_usd or (TIER_MONTHLY_USD.get(tier) if tier else None),
            "extraUsageEnabled": extra_usage,
        }
    return {
        "mode": "credits",
        "source": "detected" if billing_type else "fallback",
        "tier": None,
        "planMonthlyUsd": None,
        "extraUsageEnabled": extra_usage,
    }


def _read_oauth_account(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return {}
    oauth = payload.get("oauthAccount")
    return oauth if isinstance(oauth, dict) else {}
