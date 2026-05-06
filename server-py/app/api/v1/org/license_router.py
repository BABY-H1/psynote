"""
License router — 镜像 ``server/src/modules/org/license.routes.ts`` (89 行).

挂在 ``/api/orgs/{org_id}/license`` prefix. 2 个 endpoint:

  POST   /  — 激活 license (org_admin only)
  DELETE /  — 移除 license (org_admin only)

Phase 3 阶段实装注:
  ``server/src/lib/license/verify.ts`` (RSA + JWT) **未 port** —
  ``app/middleware/org_context.py`` 已注明 license JWT 验证 Phase 5 接真实 server.

  本 stub: POST 端点接受任意 ``license_key`` 字符串, 写入 DB,
  tier 返回当前 ``OrgContext.tier`` (Phase 3 由 plan 推, 与 Node 行为
  在"无 license"分支等价). DELETE 端点正常清空 license_key.

  Phase 5 ticket TBD: 接 RSA 验证后, POST 端点拒绝无效 license, 校验
  payload.orgId == 当前 org_id, 校验未过期等.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.org.schemas import (
    LicenseActivateRequest,
    LicenseActivateResponse,
    SuccessResponse,
)
from app.core.database import get_db
from app.db.models.organizations import Organization
from app.lib.errors import NotFoundError, ValidationError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.role_guards import require_admin
from app.shared.tier import TIER_FEATURES, TIER_LABELS

router = APIRouter()


def _require_org_admin(org: OrgContext | None) -> None:
    require_admin(org)


@router.post("/", response_model=LicenseActivateResponse)
async def activate_license(
    org_id: str,
    body: LicenseActivateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LicenseActivateResponse:
    """激活 license (org_admin only). 镜像 license.routes.ts:32-70.

    **Phase 3 stub**: license JWT 验证 Phase 5 接入. 本阶段直接持久化 license_key,
    tier 取自 OrgContext (由 plan 推). Phase 5 实装时, 这里需:
      1. 调 ``verify_license(license_key, org_id)`` 校验 RSA 签名 + orgId binding
      2. 失败抛 ForbiddenError ('许可证已过期'/'许可证无效')
      3. 返回 ``payload.tier`` / ``payload.maxSeats`` / ``payload.expiresAt``
    """
    _require_org_admin(org)
    assert org is not None

    license_key = body.license_key.strip()
    if not license_key:
        raise ValidationError("licenseKey is required")

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    q = select(Organization).where(Organization.id == org_uuid).limit(1)
    organization = (await db.execute(q)).scalar_one_or_none()
    if organization is None:
        raise NotFoundError("Organization", org_id)

    organization.license_key = license_key
    organization.updated_at = datetime.now(UTC)
    await db.commit()

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="license.activated",
        resource="organization",
        resource_id=str(org_uuid),
        ip_address=request.client.host if request.client else None,
    )

    tier = org.tier
    features = sorted(TIER_FEATURES.get(tier, frozenset()))

    return LicenseActivateResponse(
        success=True,
        tier=tier,
        label=TIER_LABELS.get(tier, tier),
        features=list(features),
        max_seats=org.license.max_seats,
        expires_at=org.license.expires_at,
    )


@router.delete("/", response_model=SuccessResponse)
async def remove_license(
    org_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SuccessResponse:
    """移除 license (org_admin only). 镜像 license.routes.ts:75-88."""
    _require_org_admin(org)

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    q = select(Organization).where(Organization.id == org_uuid).limit(1)
    organization = (await db.execute(q)).scalar_one_or_none()
    if organization is None:
        raise NotFoundError("Organization", org_id)

    organization.license_key = None
    organization.updated_at = datetime.now(UTC)
    await db.commit()

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="license.removed",
        resource="organization",
        resource_id=str(org_uuid),
        ip_address=request.client.host if request.client else None,
    )
    return SuccessResponse()


__all__ = ["router"]
