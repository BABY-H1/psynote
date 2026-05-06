"""
SaaS tier & feature flag — 镜像 packages/shared/src/types/tier.ts。

两个正交维度:
  1. OrgTier (功能等级): starter / growth / flagship
  2. OrgType (组织类型): solo / counseling / enterprise / school / hospital

最终功能集 = TIER_FEATURES[tier] ∪ ORG_TYPE_FEATURES[org_type]

注: TS 端的 ORG_TYPE_DISPLAY (UI label/color) 不 port — 那是前端用的, Python
后端不需要。Phase 7+ (本计划之外) 若做 UI 模板再补。
"""

from __future__ import annotations

from typing import Literal, cast, get_args

# ─── Tier ──────────────────────────────────────────────────────────

OrgTier = Literal["starter", "growth", "flagship"]
ORG_TIERS: tuple[OrgTier, ...] = get_args(OrgTier)

Feature = Literal[
    "core",  # 基础全部功能 (测评/咨询/团辅/课程/Portal 等)
    "audit_log",  # 审计日志查看界面
    "referral_export",  # 转介 - 仅导出 PDF
    "referral_full",  # 转介 - 完整平台模式 (跨机构数据传输)
    "supervisor",  # 督导关系 + 笔记审阅
    "branding",  # 品牌定制 (Logo/主题色/报告页眉页脚)
    "partnership",  # 跨组织合作 (建立合作关系/咨询师指派)
    "sso",  # SAML/OIDC 单点登录
    "api",  # 公开 REST API
]
FEATURES: tuple[Feature, ...] = get_args(Feature)

# UI 标签 (镜像 packages/shared/src/types/tier.ts TIER_LABELS)。仅作显示用 —
# 业务逻辑用 OrgTier 字面量, 不要依赖中文 label。
TIER_LABELS: dict[OrgTier, str] = {
    "starter": "入门版",
    "growth": "团队版",
    "flagship": "旗舰版",
}


# starter ⊂ growth ⊂ flagship 严格递增 (test_tier 验证此性质)
TIER_FEATURES: dict[OrgTier, frozenset[Feature]] = {
    "starter": frozenset({"core", "audit_log", "referral_export"}),
    "growth": frozenset(
        {
            "core",
            "audit_log",
            "referral_export",
            "referral_full",
            "supervisor",
            "branding",
        }
    ),
    "flagship": frozenset(
        {
            "core",
            "audit_log",
            "referral_export",
            "referral_full",
            "supervisor",
            "branding",
            "partnership",
            "sso",
            "api",
        }
    ),
}

# ─── OrgType ───────────────────────────────────────────────────────

OrgType = Literal["solo", "counseling", "enterprise", "school", "hospital"]
ORG_TYPES: tuple[OrgType, ...] = get_args(OrgType)

OrgTypeFeature = Literal["eap", "school"]

# 组织类型自带的功能 (不依赖 tier)
ORG_TYPE_FEATURES: dict[OrgType, frozenset[OrgTypeFeature]] = {
    "solo": frozenset(),
    "counseling": frozenset(),
    "enterprise": frozenset({"eap"}),
    "school": frozenset({"school"}),
    "hospital": frozenset(),
}


# ─── Feature checking ──────────────────────────────────────────────


def has_feature(
    tier: str,
    feature: str,
    org_type: str | None = None,
) -> bool:
    """
    检查给定 tier + (可选 org_type) 下是否启用某 feature。

    starter + enterprise → 'eap' 通过 org_type 解锁。
    starter 单独 → 'eap' 不通过。

    未知 tier fallback 到 starter (mirrors TS ?? TIER_FEATURES.starter)。
    """
    # cast 是为了 mypy: 入参声明 str (要兼容 DB 任意值), 但 dict 键是 Literal。
    # dict.get 在 key 不在 Literal 集合内时仍返回 default, 所以 cast 安全。
    tier_set = TIER_FEATURES.get(cast(OrgTier, tier), TIER_FEATURES["starter"])
    if feature in tier_set:
        return True

    if org_type:
        type_set = ORG_TYPE_FEATURES.get(cast(OrgType, org_type), ORG_TYPE_FEATURES["counseling"])
        if feature in type_set:
            return True

    return False


def has_org_type_feature(org_type: str, feature: str) -> bool:
    """OrgType 自带 feature 检查 (不依赖 tier)。"""
    type_set = ORG_TYPE_FEATURES.get(cast(OrgType, org_type), ORG_TYPE_FEATURES["counseling"])
    return feature in type_set


# ─── Plan ↔ Tier 映射 ─────────────────────────────────────────────


def plan_to_tier(plan: str | None) -> OrgTier:
    """
    organizations.plan (DB 字段) → OrgTier 映射。

    含 legacy:
      'enterprise' → 'growth' (字段重命名前的旧值)
      'platform'   → 'flagship'

    None / 未知 → 'starter' (safe fallback)。
    """
    match plan:
        case "free":
            return "starter"
        case "pro" | "enterprise":  # legacy enterprise → growth
            return "growth"
        case "premium" | "platform":  # legacy platform → flagship
            return "flagship"
        case _:
            return "starter"


def tier_to_plan(tier: OrgTier) -> str:
    """反映射: OrgTier → DB plan 字段。"""
    match tier:
        case "starter":
            return "free"
        case "growth":
            return "pro"
        case "flagship":
            return "premium"
        case _:
            return "free"
