"""
Referral router — 镜像 ``server/src/modules/referral/referral.routes.ts`` (164 行).

挂在 ``/api/orgs/{org_id}/referrals``:

  GET    /                         列表 (data scope 过滤)
  GET    /inbox                    receiver 收件箱
  GET    /{referralId}             详情
  GET    /{referralId}/data-package 数据包预览 (counselor side)
  POST   /                         基础创建 (admin/counselor)
  POST   /extended                 Phase 9δ 扩展创建 (含 mode + spec)
  POST   /{referralId}/respond     receiver accept/reject
  PATCH  /{referralId}             部分更新 (admin/counselor)
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.referral.schemas import (
    ReferralCreateInput,
    ReferralExtendedCreateInput,
    ReferralOutput,
    ReferralRespondInput,
    ReferralUpdateInput,
)
from app.api.v1.referral.service import (
    create_referral,
    create_referral_extended,
    get_referral_by_id,
    list_incoming_referrals,
    list_referrals,
    resolve_data_package,
    respond_to_referral,
    update_referral,
)
from app.core.database import get_db
from app.lib.errors import ForbiddenError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.data_scope import DataScope, get_data_scope
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


def _require_org(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    return org


def _require_admin_or_counselor(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.role not in ("org_admin", "counselor"):
        raise ForbiddenError("insufficient_role")
    return org


# ─── GET /inbox (路径具体先于 /{referralId}!) ──────────────────


@router.get("/inbox", response_model=list[ReferralOutput])
async def inbox_route(
    org_id: str,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ReferralOutput]:
    """``GET /inbox`` Receiver 收件箱 (镜像 routes.ts:131-133)."""
    _require_org(org)
    user_uuid = parse_uuid_or_raise(user.id, field="userId")
    return await list_incoming_referrals(db, user_uuid)


# ─── GET / 列表 ────────────────────────────────────────────────


@router.get("/", response_model=list[ReferralOutput])
async def list_route(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    scope: Annotated[DataScope | None, Depends(get_data_scope)] = None,
    care_episode_id: Annotated[str | None, Query(alias="careEpisodeId")] = None,
) -> list[ReferralOutput]:
    """``GET /`` 列表 + data scope 过滤 (镜像 routes.ts:16-19)."""
    _require_org(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    ep_uuid = (
        parse_uuid_or_raise(care_episode_id, field="careEpisodeId") if care_episode_id else None
    )
    return await list_referrals(db, org_uuid, care_episode_id=ep_uuid, scope=scope)


# ─── POST / 创建 ──────────────────────────────────────────────


@router.post("/", response_model=ReferralOutput, status_code=status.HTTP_201_CREATED)
async def create_route(
    org_id: str,
    body: ReferralCreateInput,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReferralOutput:
    """``POST /`` 基础创建 — admin/counselor 限定 (镜像 routes.ts:28-61)."""
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")
    ep_uuid = parse_uuid_or_raise(body.care_episode_id, field="careEpisodeId")
    client_uuid = parse_uuid_or_raise(body.client_id, field="clientId")

    referral = await create_referral(
        db,
        org_id=org_uuid,
        care_episode_id=ep_uuid,
        client_id=client_uuid,
        referred_by=user_uuid,
        reason=body.reason,
        risk_summary=body.risk_summary,
        target_type=body.target_type,
        target_name=body.target_name,
        target_contact=body.target_contact,
        follow_up_plan=body.follow_up_plan,
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="create",
        resource="referrals",
        resource_id=referral.id,
        ip_address=request.client.host if request.client else None,
    )
    return referral


# ─── POST /extended ──────────────────────────────────────────


@router.post("/extended", response_model=ReferralOutput, status_code=status.HTTP_201_CREATED)
async def create_extended_route(
    org_id: str,
    body: ReferralExtendedCreateInput,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReferralOutput:
    """``POST /extended`` Phase 9δ 创建 (镜像 routes.ts:86-128)."""
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")
    ep_uuid = parse_uuid_or_raise(body.care_episode_id, field="careEpisodeId")
    client_uuid = parse_uuid_or_raise(body.client_id, field="clientId")

    spec_dict: dict[str, Any] = (
        body.data_package_spec.model_dump(by_alias=True, exclude_none=True)
        if body.data_package_spec
        else {}
    )
    referral = await create_referral_extended(
        db,
        org_id=org_uuid,
        care_episode_id=ep_uuid,
        client_id=client_uuid,
        referred_by=user_uuid,
        reason=body.reason,
        risk_summary=body.risk_summary,
        mode=body.mode,
        to_counselor_id=parse_uuid_or_raise(body.to_counselor_id, field="toCounselorId")
        if body.to_counselor_id
        else None,
        to_org_id=parse_uuid_or_raise(body.to_org_id, field="toOrgId") if body.to_org_id else None,
        target_type=body.target_type,
        target_name=body.target_name,
        target_contact=body.target_contact,
        data_package_spec=spec_dict,
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="create",
        resource="referrals",
        resource_id=referral.id,
        ip_address=request.client.host if request.client else None,
    )
    return referral


# ─── GET /{referralId} 详情 ───────────────────────────────────


@router.get("/{referral_id}", response_model=ReferralOutput)
async def detail_route(
    org_id: str,
    referral_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReferralOutput:
    """``GET /{referralId}`` 详情 (镜像 routes.ts:22-25)."""
    _require_org(org)
    rid = parse_uuid_or_raise(referral_id, field="referralId")
    return await get_referral_by_id(db, rid)


# ─── PATCH /{referralId} ─────────────────────────────────────


@router.patch("/{referral_id}", response_model=ReferralOutput)
async def update_route(
    org_id: str,
    referral_id: str,
    body: ReferralUpdateInput,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReferralOutput:
    """``PATCH /{referralId}`` 部分更新 — admin/counselor (镜像 routes.ts:64-78)."""
    _require_admin_or_counselor(org)
    rid = parse_uuid_or_raise(referral_id, field="referralId")
    updates = body.model_dump(exclude_unset=True, by_alias=False)
    referral = await update_referral(db, rid, updates=updates)
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="referrals",
        resource_id=referral_id,
        ip_address=request.client.host if request.client else None,
    )
    return referral


# ─── POST /{referralId}/respond ──────────────────────────────


@router.post("/{referral_id}/respond", response_model=ReferralOutput)
async def respond_route(
    org_id: str,
    referral_id: str,
    body: ReferralRespondInput,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReferralOutput:
    """``POST /{referralId}/respond`` Receiver decision (镜像 routes.ts:140-157)."""
    _require_admin_or_counselor(org)
    rid = parse_uuid_or_raise(referral_id, field="referralId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")
    referral = await respond_to_referral(
        db,
        referral_id=rid,
        receiver_user_id=user_uuid,
        decision=body.decision,
        reason=body.reason,
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="referrals",
        resource_id=referral_id,
        ip_address=request.client.host if request.client else None,
    )
    return referral


# ─── GET /{referralId}/data-package ──────────────────────────


@router.get("/{referral_id}/data-package")
async def data_package_route(
    org_id: str,
    referral_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """``GET /{referralId}/data-package`` 数据包预览 (镜像 routes.ts:160-163).

    counselor side 已认证, 通过 OrgContext 守门; 不消费下载 token (区别于
    public_router 的一次性下载流)。
    """
    _require_org(org)
    rid = parse_uuid_or_raise(referral_id, field="referralId")
    return await resolve_data_package(db, rid)


__all__ = ["router"]
