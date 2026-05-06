"""
Subscription router — 镜像 ``server/src/modules/org/subscription.routes.ts`` (128 行).

挂在 ``/api/orgs/{org_id}`` prefix. 2 个 endpoint:

  GET /subscription  — tier + features + license + seat usage (任意 staff)
  GET /ai-usage      — 当月 AI token 用量

只读端点 (Phase 3 阶段 license JWT 校验仍 stub, OrgContext.license 走默认 'none').
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.org.schemas import AIUsageResponse, LicenseInfoResponse, SubscriptionInfo
from app.core.database import get_db
from app.db.models.ai_call_logs import AICallLog
from app.db.models.org_members import OrgMember
from app.db.models.organizations import Organization
from app.lib.errors import NotFoundError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.role_guards import reject_client
from app.shared.tier import TIER_FEATURES, TIER_LABELS

router = APIRouter()


def _reject_client(org: OrgContext | None) -> None:
    reject_client(org)


@router.get("/subscription", response_model=SubscriptionInfo)
async def get_subscription(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SubscriptionInfo:
    """订阅信息 (任意 staff). 镜像 subscription.routes.ts:41-72."""
    _reject_client(org)
    assert org is not None

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    plan_q = select(Organization.plan).where(Organization.id == org_uuid).limit(1)
    plan_row = (await db.execute(plan_q)).first()
    if plan_row is None:
        raise NotFoundError("Organization", org_id)

    seat_q = select(func.count()).where(
        and_(OrgMember.org_id == org_uuid, OrgMember.status == "active")
    )
    seats_used = int((await db.execute(seat_q)).scalar() or 0)

    tier = org.tier
    features = sorted(TIER_FEATURES.get(tier, frozenset()))

    return SubscriptionInfo(
        tier=tier,
        plan=plan_row[0],
        label=TIER_LABELS.get(tier, tier),
        features=list(features),
        license=LicenseInfoResponse(
            status=org.license.status,
            max_seats=org.license.max_seats,
            expires_at=org.license.expires_at,
            seats_used=seats_used,
        ),
    )


@router.get("/ai-usage", response_model=AIUsageResponse)
async def get_ai_usage(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AIUsageResponse:
    """当月 AI token 用量 (任意 staff). 镜像 subscription.routes.ts:85-127."""
    _reject_client(org)

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    settings_q = select(Organization.settings).where(Organization.id == org_uuid).limit(1)
    s_row = (await db.execute(settings_q)).first()
    if s_row is None:
        raise NotFoundError("Organization", org_id)

    settings = s_row[0] or {}
    ai_config = settings.get("aiConfig") or {}
    monthly_limit = int(ai_config.get("monthlyTokenLimit") or 0)

    now = datetime.now(UTC)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # 当月聚合 — 用 Postgres 端的 date_trunc 比 Python 拆 datetime 在 mock_db
    # 上更难校验. 这里直接用 Python ``month_start`` 作为绑定参数, SQLAlchemy
    # 转 timestamptz, 与 Node behavior 一致.
    sum_q = select(
        func.coalesce(func.sum(AICallLog.total_tokens), 0).label("tokens"),
        func.count().label("calls"),
    ).where(
        and_(
            AICallLog.org_id == org_uuid,
            AICallLog.created_at >= month_start,
        )
    )
    row = (await db.execute(sum_q)).first()
    tokens = int(row.tokens) if row else 0
    calls = int(row.calls) if row else 0

    remaining: int | None = max(0, monthly_limit - tokens) if monthly_limit > 0 else None
    percent_used: float | None = (
        min(100.0, (tokens / monthly_limit) * 100) if monthly_limit > 0 else None
    )

    return AIUsageResponse(
        month_start=month_start.isoformat(),
        monthly_limit=monthly_limit,
        monthly_used=tokens,
        remaining=remaining,
        percent_used=percent_used,
        call_count=calls,
        unlimited=monthly_limit <= 0,
    )


__all__ = ["router"]
