"""
Tests for app/shared/tier.py — 镜像 packages/shared/src/types/tier.test.ts。

OrgTier (starter/growth/flagship) + Feature flags + plan_to_tier 映射。
"""

from __future__ import annotations

# ─── Tier 层级 (starter ⊂ growth ⊂ flagship) ─────────────────────


def test_growth_includes_all_starter_features() -> None:
    from app.shared.tier import TIER_FEATURES

    for feat in TIER_FEATURES["starter"]:
        assert feat in TIER_FEATURES["growth"]


def test_flagship_includes_all_growth_features() -> None:
    from app.shared.tier import TIER_FEATURES

    for feat in TIER_FEATURES["growth"]:
        assert feat in TIER_FEATURES["flagship"]


def test_partnership_sso_api_are_flagship_only() -> None:
    from app.shared.tier import TIER_FEATURES

    for feat in ("partnership", "sso", "api"):
        assert feat not in TIER_FEATURES["growth"]
        assert feat in TIER_FEATURES["flagship"]


# ─── has_feature ────────────────────────────────────────────────


def test_starter_does_not_have_supervisor() -> None:
    from app.shared.tier import has_feature

    assert has_feature("starter", "supervisor") is False


def test_growth_has_supervisor() -> None:
    from app.shared.tier import has_feature

    assert has_feature("growth", "supervisor") is True


def test_eap_requires_enterprise_org_type() -> None:
    """tier 单独不给 eap; enterprise orgType 自带"""
    from app.shared.tier import has_feature

    assert has_feature("starter", "eap") is False
    assert has_feature("starter", "eap", "enterprise") is True


def test_flagship_has_partnership_sso_api() -> None:
    from app.shared.tier import has_feature

    assert has_feature("flagship", "partnership") is True
    assert has_feature("flagship", "sso") is True
    assert has_feature("flagship", "api") is True


def test_growth_lacks_flagship_features() -> None:
    from app.shared.tier import has_feature

    assert has_feature("growth", "partnership") is False
    assert has_feature("growth", "sso") is False
    assert has_feature("growth", "api") is False


# ─── has_org_type_feature ───────────────────────────────────────


def test_enterprise_has_eap_others_dont() -> None:
    from app.shared.tier import has_org_type_feature

    assert has_org_type_feature("enterprise", "eap") is True
    assert has_org_type_feature("counseling", "eap") is False
    assert has_org_type_feature("school", "eap") is False


def test_school_has_school_feature() -> None:
    from app.shared.tier import has_org_type_feature

    assert has_org_type_feature("school", "school") is True
    assert has_org_type_feature("enterprise", "school") is False


# ─── plan_to_tier ───────────────────────────────────────────────


def test_plan_to_tier_known_values() -> None:
    from app.shared.tier import plan_to_tier

    assert plan_to_tier("free") == "starter"
    assert plan_to_tier("pro") == "growth"
    assert plan_to_tier("premium") == "flagship"


def test_plan_to_tier_legacy_values() -> None:
    """老 plan 名 enterprise → growth, platform → flagship (字段重命名遗留)"""
    from app.shared.tier import plan_to_tier

    assert plan_to_tier("enterprise") == "growth"
    assert plan_to_tier("platform") == "flagship"


def test_plan_to_tier_fallback_to_starter() -> None:
    from app.shared.tier import plan_to_tier

    assert plan_to_tier(None) == "starter"
    assert plan_to_tier("") == "starter"
    assert plan_to_tier("bogus-tier") == "starter"


def test_tier_to_plan_round_trip() -> None:
    from app.shared.tier import plan_to_tier, tier_to_plan

    assert tier_to_plan(plan_to_tier("pro")) == "pro"
    assert tier_to_plan(plan_to_tier("premium")) == "premium"
    assert tier_to_plan(plan_to_tier(None)) == "free"  # fallback round-trip


# ─── ORG_TYPE_FEATURES shape ────────────────────────────────────


def test_counseling_solo_hospital_have_no_orgtype_features() -> None:
    from app.shared.tier import ORG_TYPE_FEATURES

    assert len(ORG_TYPE_FEATURES["counseling"]) == 0
    assert len(ORG_TYPE_FEATURES["solo"]) == 0
    assert len(ORG_TYPE_FEATURES["hospital"]) == 0
