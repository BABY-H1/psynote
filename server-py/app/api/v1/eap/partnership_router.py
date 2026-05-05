"""
EAP Partnership router — 镜像 ``server/src/modules/eap/eap-partnership.routes.ts`` (266 行)。

挂在 ``/api/orgs/{org_id}/eap/partnerships`` 前缀下。

5 个 endpoint:
  GET    /                         — 列出当前 org 参与的 partnerships (双向)
  POST   /                         — 创建 partnership (企业方邀请服务方)
  GET    /{partnership_id}         — partnership 详情 (含 assigned counselors)
  PATCH  /{partnership_id}         — 更新 status / 合同条款 / scope
  DELETE /{partnership_id}         — 删除 (cascade 到 assignments)

RBAC: requireRole('org_admin') — 所有 endpoint 必须 org_admin.

注: 返回时区分 ``role=enterprise`` 还是 ``role=provider`` (相对当前 org).
partnerOrg 可能已删 (软关联), 用 fallback ``{name: '(已删除)', slug: ''}``.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import and_, delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.eap.schemas import (
    PartnerOrgInfo,
    PartnershipAssignmentEntry,
    PartnershipCreateRequest,
    PartnershipCreateResponse,
    PartnershipDetailResponse,
    PartnershipListResponse,
    PartnershipPlain,
    PartnershipRow,
    PartnershipUpdateRequest,
    PartnershipUpdateResponse,
)
from app.core.database import get_db
from app.db.models.eap_counselor_assignments import EAPCounselorAssignment
from app.db.models.eap_partnerships import EAPPartnership
from app.db.models.organizations import Organization
from app.db.models.users import User
from app.lib.errors import NotFoundError, ValidationError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.role_guards import require_admin as _require_org_admin

router = APIRouter()


def _parse_iso_date(value: str | None) -> datetime | None:
    """解析 ISO8601 string → datetime, 不合法 raise ValidationError."""
    if value is None:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, TypeError) as exc:
        raise ValidationError(f"Invalid ISO date: {value}") from exc


def _partnership_plain(p: EAPPartnership) -> PartnershipPlain:
    """ORM EAPPartnership → PartnershipPlain (不带派生字段)."""
    return PartnershipPlain(
        id=str(p.id),
        enterprise_org_id=str(p.enterprise_org_id),
        provider_org_id=str(p.provider_org_id),
        status=p.status,
        contract_start=p.contract_start,
        contract_end=p.contract_end,
        seat_allocation=p.seat_allocation,
        service_scope=p.service_scope or {},
        notes=p.notes,
        created_by=str(p.created_by) if p.created_by else None,
        created_at=getattr(p, "created_at", None),
        updated_at=getattr(p, "updated_at", None),
    )


def _decorate(
    p: EAPPartnership,
    *,
    current_org_id: uuid.UUID,
    partner_org: PartnerOrgInfo,
    assigned_counselor_count: int,
) -> PartnershipRow:
    """ORM → PartnershipRow (含派生 ``role`` / ``partnerOrg`` / ``assignedCounselorCount``)."""
    return PartnershipRow(
        id=str(p.id),
        enterprise_org_id=str(p.enterprise_org_id),
        provider_org_id=str(p.provider_org_id),
        status=p.status,
        contract_start=p.contract_start,
        contract_end=p.contract_end,
        seat_allocation=p.seat_allocation,
        service_scope=p.service_scope or {},
        notes=p.notes,
        created_by=str(p.created_by) if p.created_by else None,
        created_at=getattr(p, "created_at", None),
        updated_at=getattr(p, "updated_at", None),
        role="enterprise" if p.enterprise_org_id == current_org_id else "provider",
        partner_org=partner_org,
        assigned_counselor_count=assigned_counselor_count,
    )


# ─── List Partnerships ───────────────────────────────────────────


@router.get("/", response_model=PartnershipListResponse)
async def list_partnerships(
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PartnershipListResponse:
    """列出当前 org 参与的合作 (双向). 镜像 eap-partnership.routes.ts:30-74."""
    org_ctx = _require_org_admin(org)
    org_uuid = parse_uuid_or_raise(org_ctx.org_id, field="orgId")

    q = (
        select(EAPPartnership)
        .where(
            or_(
                EAPPartnership.enterprise_org_id == org_uuid,
                EAPPartnership.provider_org_id == org_uuid,
            )
        )
        .order_by(EAPPartnership.created_at)
    )
    partnerships = list((await db.execute(q)).scalars().all())

    enriched: list[PartnershipRow] = []
    for p in partnerships:
        other_uuid = p.provider_org_id if p.enterprise_org_id == org_uuid else p.enterprise_org_id

        # partner org 的 name / slug (软关联, 可能已删)
        oq = select(Organization.name, Organization.slug).where(Organization.id == other_uuid)
        other = (await db.execute(oq)).first()
        partner = (
            PartnerOrgInfo(name=other[0], slug=other[1])
            if other is not None
            else PartnerOrgInfo(name="(已删除)", slug="")
        )

        # active assignments 计数
        aq = select(EAPCounselorAssignment).where(
            and_(
                EAPCounselorAssignment.partnership_id == p.id,
                EAPCounselorAssignment.status == "active",
            )
        )
        rows = list((await db.execute(aq)).scalars().all())

        enriched.append(
            _decorate(
                p,
                current_org_id=org_uuid,
                partner_org=partner,
                assigned_counselor_count=len(rows),
            )
        )

    return PartnershipListResponse(partnerships=enriched)


# ─── Create Partnership ──────────────────────────────────────────


@router.post(
    "/",
    response_model=PartnershipCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_partnership(
    body: PartnershipCreateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PartnershipCreateResponse:
    """创建 partnership (企业方邀请服务方). 镜像 eap-partnership.routes.ts:77-134."""
    org_ctx = _require_org_admin(org)
    org_uuid = parse_uuid_or_raise(org_ctx.org_id, field="orgId")

    provider_uuid = parse_uuid_or_raise(body.provider_org_id, field="providerOrgId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    # 验 provider org 存在
    pq = select(Organization.id).where(Organization.id == provider_uuid).limit(1)
    if (await db.execute(pq)).first() is None:
        raise NotFoundError("Provider organization")

    # 防重复
    dup_q = (
        select(EAPPartnership)
        .where(
            and_(
                EAPPartnership.enterprise_org_id == org_uuid,
                EAPPartnership.provider_org_id == provider_uuid,
            )
        )
        .limit(1)
    )
    if (await db.execute(dup_q)).scalar_one_or_none() is not None:
        raise ValidationError("Partnership already exists with this organization")

    try:
        partnership = EAPPartnership(
            enterprise_org_id=org_uuid,
            provider_org_id=provider_uuid,
            status="active",
            contract_start=_parse_iso_date(body.contract_start),
            contract_end=_parse_iso_date(body.contract_end),
            seat_allocation=body.seat_allocation,
            service_scope=body.service_scope or {},
            notes=body.notes,
            created_by=user_uuid,
        )
        db.add(partnership)
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="create",
        resource="eap_partnerships",
        resource_id=str(partnership.id),
        ip_address=request.client.host if request.client else None,
    )
    return PartnershipCreateResponse(partnership=_partnership_plain(partnership))


# ─── Get Partnership Detail ──────────────────────────────────────


@router.get("/{partnership_id}", response_model=PartnershipDetailResponse)
async def get_partnership(
    partnership_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PartnershipDetailResponse:
    """partnership 详情 + assignments. 镜像 eap-partnership.routes.ts:137-189."""
    org_ctx = _require_org_admin(org)
    org_uuid = parse_uuid_or_raise(org_ctx.org_id, field="orgId")

    p_uuid = parse_uuid_or_raise(partnership_id, field="partnershipId")
    pq = (
        select(EAPPartnership)
        .where(
            and_(
                EAPPartnership.id == p_uuid,
                or_(
                    EAPPartnership.enterprise_org_id == org_uuid,
                    EAPPartnership.provider_org_id == org_uuid,
                ),
            )
        )
        .limit(1)
    )
    partnership = (await db.execute(pq)).scalar_one_or_none()
    if partnership is None:
        raise NotFoundError("Partnership", partnership_id)

    # 已派遣 counselors (含 user.name / user.email)
    aq = (
        select(
            EAPCounselorAssignment.id,
            EAPCounselorAssignment.counselor_user_id,
            EAPCounselorAssignment.status,
            EAPCounselorAssignment.assigned_at,
            User.name,
            User.email,
        )
        .outerjoin(User, User.id == EAPCounselorAssignment.counselor_user_id)
        .where(EAPCounselorAssignment.partnership_id == p_uuid)
    )
    a_rows = (await db.execute(aq)).all()
    assignments = [
        PartnershipAssignmentEntry(
            id=str(a_id),
            counselor_user_id=str(c_id),
            status=astatus,
            assigned_at=assigned_at,
            counselor_name=cname,
            counselor_email=cemail,
        )
        for a_id, c_id, astatus, assigned_at, cname, cemail in a_rows
    ]

    # partner org 信息
    other_uuid = (
        partnership.provider_org_id
        if partnership.enterprise_org_id == org_uuid
        else partnership.enterprise_org_id
    )
    oq = select(Organization.name, Organization.slug).where(Organization.id == other_uuid)
    other = (await db.execute(oq)).first()
    partner = (
        PartnerOrgInfo(name=other[0], slug=other[1])
        if other is not None
        else PartnerOrgInfo(name="(已删除)", slug="")
    )

    decorated = _decorate(
        partnership,
        current_org_id=org_uuid,
        partner_org=partner,
        assigned_counselor_count=sum(1 for a in assignments if a.status == "active"),
    )
    return PartnershipDetailResponse(partnership=decorated, assignments=assignments)


# ─── Update Partnership ──────────────────────────────────────────


@router.patch("/{partnership_id}", response_model=PartnershipUpdateResponse)
async def update_partnership(
    partnership_id: str,
    body: PartnershipUpdateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PartnershipUpdateResponse:
    """更新 partnership. 镜像 eap-partnership.routes.ts:192-235."""
    org_ctx = _require_org_admin(org)
    org_uuid = parse_uuid_or_raise(org_ctx.org_id, field="orgId")
    p_uuid = parse_uuid_or_raise(partnership_id, field="partnershipId")

    pq = (
        select(EAPPartnership)
        .where(
            and_(
                EAPPartnership.id == p_uuid,
                or_(
                    EAPPartnership.enterprise_org_id == org_uuid,
                    EAPPartnership.provider_org_id == org_uuid,
                ),
            )
        )
        .limit(1)
    )
    partnership = (await db.execute(pq)).scalar_one_or_none()
    if partnership is None:
        raise NotFoundError("Partnership", partnership_id)

    if body.status is not None:
        partnership.status = body.status
    if body.contract_start is not None:
        partnership.contract_start = _parse_iso_date(body.contract_start)
    if body.contract_end is not None:
        partnership.contract_end = _parse_iso_date(body.contract_end)
    if body.seat_allocation is not None:
        partnership.seat_allocation = body.seat_allocation
    if body.service_scope is not None:
        partnership.service_scope = body.service_scope
    if body.notes is not None:
        partnership.notes = body.notes
    partnership.updated_at = datetime.now(UTC)

    await db.commit()

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="update",
        resource="eap_partnerships",
        resource_id=str(p_uuid),
        ip_address=request.client.host if request.client else None,
    )
    return PartnershipUpdateResponse(partnership=_partnership_plain(partnership))


# ─── Delete Partnership ──────────────────────────────────────────


@router.delete("/{partnership_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_partnership(
    partnership_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """删除 partnership (cascade 到 assignments). 镜像 eap-partnership.routes.ts:238-264."""
    org_ctx = _require_org_admin(org)
    org_uuid = parse_uuid_or_raise(org_ctx.org_id, field="orgId")
    p_uuid = parse_uuid_or_raise(partnership_id, field="partnershipId")

    pq = (
        select(EAPPartnership)
        .where(
            and_(
                EAPPartnership.id == p_uuid,
                or_(
                    EAPPartnership.enterprise_org_id == org_uuid,
                    EAPPartnership.provider_org_id == org_uuid,
                ),
            )
        )
        .limit(1)
    )
    partnership = (await db.execute(pq)).scalar_one_or_none()
    if partnership is None:
        raise NotFoundError("Partnership", partnership_id)

    await db.execute(delete(EAPPartnership).where(EAPPartnership.id == p_uuid))
    await db.commit()

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="delete",
        resource="eap_partnerships",
        resource_id=str(p_uuid),
        ip_address=request.client.host if request.client else None,
    )


__all__ = ["router"]
