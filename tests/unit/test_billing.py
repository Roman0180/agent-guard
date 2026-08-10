from __future__ import annotations

import json
from pathlib import Path

from agent_sidecar.intel.billing import detect_billing
from agent_sidecar.schema.config import SidecarConfig


def _state_file(tmp_path: Path, oauth: dict | None) -> Path:
    path = tmp_path / "claude-state.json"
    payload = {"oauthAccount": oauth} if oauth is not None else {}
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def test_config_override_wins_over_detection(tmp_path: Path) -> None:
    config = SidecarConfig()
    config.billing.mode = "credits"
    state = _state_file(tmp_path, {"billingType": "stripe_subscription", "organizationType": "claude_max"})
    result = detect_billing(config, claude_state_path=state)
    assert result["mode"] == "credits"
    assert result["source"] == "config"


def test_config_plan_override_carries_price(tmp_path: Path) -> None:
    config = SidecarConfig()
    config.billing.mode = "plan"
    config.billing.monthly_usd = 100.0
    result = detect_billing(config, claude_state_path=tmp_path / "missing.json")
    assert result["mode"] == "plan"
    assert result["planMonthlyUsd"] == 100.0


def test_detects_max_subscription_with_tier_price(tmp_path: Path) -> None:
    state = _state_file(tmp_path, {
        "billingType": "stripe_subscription",
        "organizationType": "claude_max",
        "organizationRateLimitTier": "default_claude_max_20x",
        "hasExtraUsageEnabled": True,
    })
    result = detect_billing(SidecarConfig(), claude_state_path=state)
    assert result["mode"] == "plan"
    assert result["source"] == "detected"
    assert result["tier"] == "default_claude_max_20x"
    assert result["planMonthlyUsd"] == 200.0
    assert result["extraUsageEnabled"] is True


def test_unknown_tier_yields_plan_without_price(tmp_path: Path) -> None:
    state = _state_file(tmp_path, {
        "billingType": "stripe_subscription",
        "organizationRateLimitTier": "some_future_tier",
    })
    result = detect_billing(SidecarConfig(), claude_state_path=state)
    assert result["mode"] == "plan"
    assert result["planMonthlyUsd"] is None


def test_api_billing_type_detects_credits(tmp_path: Path) -> None:
    state = _state_file(tmp_path, {"billingType": "api_credits", "organizationType": "api"})
    result = detect_billing(SidecarConfig(), claude_state_path=state)
    assert result["mode"] == "credits"
    assert result["source"] == "detected"


def test_missing_or_malformed_state_falls_back_to_credits(tmp_path: Path) -> None:
    missing = detect_billing(SidecarConfig(), claude_state_path=tmp_path / "missing.json")
    assert missing["mode"] == "credits"
    assert missing["source"] == "fallback"

    broken = tmp_path / "broken.json"
    broken.write_text("{not json", encoding="utf-8")
    assert detect_billing(SidecarConfig(), claude_state_path=broken)["mode"] == "credits"

    no_oauth = detect_billing(SidecarConfig(), claude_state_path=_state_file(tmp_path, None))
    assert no_oauth["mode"] == "credits"
    assert no_oauth["source"] == "fallback"
