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

# Plans have no published token allowance (limits are usage-window based and vary),
# so the token denominator is always an estimate — assume Pro unless config or
# detection says otherwise, and never hardcode a guessed quota (CAPACITY_VALUE_PLAN
# phase 0: being wrong here poisons trust).
ASSUMED_TIER = "default_claude_pro"
ASSUMED_PLAN_MONTHLY_USD = TIER_MONTHLY_USD[ASSUMED_TIER]


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


def plan_token_capacity(
    billing: dict[str, Any],
    config: SidecarConfig,
    *,
    blended_usd_per_token: float | None,
) -> dict[str, Any]:
    """Estimated monthly plan capacity in tokens — the denominator for
    "saved N tokens = X% of your plan".

    Priority: explicit config override; else plan monthly USD divided by the
    user's own measured blended API-equivalent $/token. Assumes Pro when no
    plan is detected. Always labeled approximate — there is no official
    token allowance on any plan.
    """
    override = config.billing.plan_token_allowance
    if override:
        return {
            "estimatedPlanTokens": int(override),
            "planMonthlyUsd": billing.get("planMonthlyUsd") or ASSUMED_PLAN_MONTHLY_USD,
            "planAssumed": billing.get("planMonthlyUsd") is None,
            "basis": "config-override",
            "precision": "approximate",
        }
    monthly_usd = billing.get("planMonthlyUsd")
    assumed = not isinstance(monthly_usd, (int, float)) or monthly_usd <= 0
    if assumed:
        monthly_usd = ASSUMED_PLAN_MONTHLY_USD
    if not blended_usd_per_token or blended_usd_per_token <= 0:
        return {
            "estimatedPlanTokens": None,
            "planMonthlyUsd": monthly_usd,
            "planAssumed": assumed,
            "basis": "api-equivalent-estimate",
            "precision": "approximate",
        }
    return {
        "estimatedPlanTokens": round(monthly_usd / blended_usd_per_token),
        "planMonthlyUsd": monthly_usd,
        "planAssumed": assumed,
        "basis": "api-equivalent-estimate",
        "precision": "approximate",
    }


def _read_oauth_account(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return {}
    oauth = payload.get("oauthAccount")
    return oauth if isinstance(oauth, dict) else {}
