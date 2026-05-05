"""
Branding router — 镜像 ``server/src/modules/org/branding.routes.ts`` (123 行).

挂在 ``/api/orgs/{org_id}/branding`` prefix. 2 个 endpoint:

  GET   /  — 读 branding (任意 staff 可读, rejectClient)
  PATCH /  — 更新 branding (org_admin only + branding feature gate)

存储: ``organizations.settings.branding`` JSONB sub-object. 形状:
  ``{logoUrl?, themeColor?, reportHeader?, reportFooter?}``

Phase 7b 仅 config 层, PDF 实际消费在后续 phase 接入.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.org.schemas import BrandingSettings
from app.core.database import get_db
from app.db.models.organizations import Organization
from app.lib.errors import ForbiddenError, NotFoundError, ValidationError
from app.middleware.org_context import OrgContext, get_org_context
from app.shared.tier import has_feature

router = APIRouter()


def _parse_uuid(value: str, field: str = "id") -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except (ValueError, TypeError) as exc:
        raise ValidationError(f"{field} 不是合法 UUID") from exc


def _reject_client(org: OrgContext | None) -> None:
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.role == "client":
        raise ForbiddenError("Client role not permitted on this endpoint")


def _require_org_admin(org: OrgContext | None) -> None:
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.role != "org_admin":
        raise ForbiddenError("insufficient_role")


def _branding_from_settings(settings: dict[str, Any] | None) -> BrandingSettings:
    """从 ``organizations.settings`` JSONB 抽 branding 子对象."""
    s = settings or {}
    b = s.get("branding") or {}
    return BrandingSettings(
        logo_url=b.get("logoUrl"),
        theme_color=b.get("themeColor"),
        report_header=b.get("reportHeader"),
        report_footer=b.get("reportFooter"),
    )


@router.get("/", response_model=BrandingSettings)
async def get_branding(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BrandingSettings:
    """读 branding (任意 staff). 镜像 branding.routes.ts:51-62.

    Returns empty BrandingSettings when none set (Node 同行为).
    """
    _reject_client(org)

    org_uuid = _parse_uuid(org_id, "orgId")
    q = select(Organization.settings).where(Organization.id == org_uuid).limit(1)
    row = (await db.execute(q)).first()
    if row is None:
        raise NotFoundError("Organization", org_id)
    return _branding_from_settings(row[0])


@router.patch("/", response_model=BrandingSettings)
async def update_branding(
    org_id: str,
    body: BrandingSettings,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BrandingSettings:
    """更新 branding (org_admin + branding feature). 镜像 branding.routes.ts:69-122.

    feature gate 走 ``has_feature(tier, 'branding')`` (镜像 requireFeature).
    JSONB merge: 仅覆盖传入的字段, 其它 (e.g. publicServices) 保持不变.
    """
    _reject_client(org)
    assert org is not None
    if not has_feature(org.tier, "branding", org.org_type):
        raise ForbiddenError("此功能不在当前订阅中")
    _require_org_admin(org)

    org_uuid = _parse_uuid(org_id, "orgId")
    q = select(Organization).where(Organization.id == org_uuid).limit(1)
    organization = (await db.execute(q)).scalar_one_or_none()
    if organization is None:
        raise NotFoundError("Organization", org_id)

    # 抽传入的非 None 字段 (Pydantic 端已经做了 type 校验, 不需要重复 assert isinstance)
    incoming: dict[str, Any] = {}
    if body.logo_url is not None:
        incoming["logoUrl"] = body.logo_url
    if body.theme_color is not None:
        incoming["themeColor"] = body.theme_color
    if body.report_header is not None:
        incoming["reportHeader"] = body.report_header
    if body.report_footer is not None:
        incoming["reportFooter"] = body.report_footer

    # JSONB merge — 仅覆盖 branding 子对象
    prev_settings: dict[str, Any] = dict(organization.settings or {})
    prev_branding: dict[str, Any] = dict(prev_settings.get("branding") or {})
    next_branding: dict[str, Any] = {**prev_branding, **incoming}
    next_settings: dict[str, Any] = {**prev_settings, "branding": next_branding}

    organization.settings = next_settings
    organization.updated_at = datetime.now(UTC)
    await db.commit()

    return BrandingSettings(
        logo_url=next_branding.get("logoUrl"),
        theme_color=next_branding.get("themeColor"),
        report_header=next_branding.get("reportHeader"),
        report_footer=next_branding.get("reportFooter"),
    )


__all__ = ["router"]
