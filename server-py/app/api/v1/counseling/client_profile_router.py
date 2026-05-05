"""
Client profile router — 镜像 ``server/src/modules/counseling/client-profile.routes.ts`` (47 行)。

挂在 ``/api/orgs/{org_id}/clients`` prefix。

3 个 endpoint:

  GET    /{user_id}/profile      — 获取来访者档案 (PHI access log!)
  PUT    /{user_id}/profile      — upsert 档案 (admin/counselor)
  GET    /{user_id}/summary      — 个案摘要 (PHI access log!)

PHI 接通点位:
  - GET /{user_id}/profile → ``record_phi_access(action='view', resource='client_profiles')``
  - GET /{user_id}/summary → ``record_phi_access(action='view', resource='client_profiles')``

RBAC 守门:
  - 所有 GET 需 OrgContext
  - PUT 需 admin/counselor

PHI 级别: ``phi_full`` — 含 presenting_issues / medical_history / family_background。
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy import and_, asc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.counseling.schemas import (
    AssessmentResultEmbed,
    ClientProfileOutput,
    ClientProfileUpsertRequest,
    ClientSummaryOutput,
    EpisodeOutput,
    UserBasicEmbed,
)
from app.core.database import get_db
from app.db.models.assessment_results import AssessmentResult
from app.db.models.care_episodes import CareEpisode
from app.db.models.client_profiles import ClientProfile
from app.db.models.users import User
from app.lib.errors import ForbiddenError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.phi_access import record_phi_access

router = APIRouter()


# ─── 工具 ─────────────────────────────────────────────────────────


def _require_admin_or_counselor(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.role not in ("org_admin", "counselor"):
        raise ForbiddenError("insufficient_role")
    return org


def _require_org(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    return org


def _profile_to_output(p: ClientProfile) -> ClientProfileOutput:
    return ClientProfileOutput(
        id=str(p.id),
        org_id=str(p.org_id),
        user_id=str(p.user_id),
        phone=p.phone,
        gender=p.gender,
        date_of_birth=p.date_of_birth,
        address=p.address,
        occupation=p.occupation,
        education=p.education,
        marital_status=p.marital_status,
        emergency_contact=p.emergency_contact,
        medical_history=p.medical_history,
        family_background=p.family_background,
        presenting_issues=list(p.presenting_issues) if p.presenting_issues else [],
        notes=p.notes,
        created_at=getattr(p, "created_at", None),
        updated_at=getattr(p, "updated_at", None),
    )


def _episode_to_output(e: CareEpisode) -> EpisodeOutput:
    return EpisodeOutput(
        id=str(e.id),
        org_id=str(e.org_id),
        client_id=str(e.client_id),
        counselor_id=str(e.counselor_id) if e.counselor_id else None,
        status=e.status or "active",
        chief_complaint=e.chief_complaint,
        current_risk=e.current_risk or "level_1",
        intervention_type=e.intervention_type,
        opened_at=e.opened_at,
        closed_at=e.closed_at,
        created_at=getattr(e, "created_at", None),
        updated_at=getattr(e, "updated_at", None),
    )


# ─── GET /{user_id}/profile ────────────────────────────────────


@router.get("/{user_id}/profile", response_model=ClientProfileOutput | None)
async def get_profile(
    org_id: str,
    user_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ClientProfileOutput | None:
    """``GET /{user_id}/profile`` 获取来访者档案 (镜像 routes.ts:15-19 + service.ts:5-13).

    ⚠ PHI access log: client_profiles 是 phi_full。
    """
    _require_org(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    target_uuid = parse_uuid_or_raise(user_id, field="userId")

    # PHI access log (镜像 routes.ts:17)
    await record_phi_access(
        db=db,
        org_id=org_id if org else "",
        user_id=user.id,
        client_id=user_id,
        resource="client_profiles",
        action="view",
        data_class="phi_full",
        actor_role_snapshot=org.role_v2 if org else None,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    q = (
        select(ClientProfile)
        .where(
            and_(
                ClientProfile.org_id == org_uuid,
                ClientProfile.user_id == target_uuid,
            )
        )
        .limit(1)
    )
    profile = (await db.execute(q)).scalar_one_or_none()
    return _profile_to_output(profile) if profile else None


# ─── PUT /{user_id}/profile (upsert) ───────────────────────────


@router.put("/{user_id}/profile", response_model=ClientProfileOutput)
async def upsert_profile(
    org_id: str,
    user_id: str,
    body: ClientProfileUpsertRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ClientProfileOutput:
    """``PUT /{user_id}/profile`` upsert (admin/counselor). 镜像 routes.ts:22-38 + service.ts:15-49."""
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    target_uuid = parse_uuid_or_raise(user_id, field="userId")

    eq = (
        select(ClientProfile)
        .where(
            and_(
                ClientProfile.org_id == org_uuid,
                ClientProfile.user_id == target_uuid,
            )
        )
        .limit(1)
    )
    existing = (await db.execute(eq)).scalar_one_or_none()

    updates = body.model_dump(exclude_unset=True, by_alias=False, exclude_none=False)
    if "emergency_contact" in updates and updates["emergency_contact"] is not None:
        # Pydantic model → dict
        ec = updates["emergency_contact"]
        if hasattr(ec, "model_dump"):
            updates["emergency_contact"] = ec.model_dump(by_alias=False)

    if existing is not None:
        for field_name, value in updates.items():
            setattr(existing, field_name, value)
        existing.updated_at = datetime.now(UTC)
        await db.commit()
        profile = existing
    else:
        profile = ClientProfile(
            org_id=org_uuid,
            user_id=target_uuid,
            **{k: v for k, v in updates.items() if v is not None},
        )
        db.add(profile)
        try:
            await db.commit()
        except Exception:
            await db.rollback()
            raise

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="client_profiles",
        resource_id=str(profile.id),
        ip_address=request.client.host if request.client else None,
    )
    return _profile_to_output(profile)


# ─── GET /{user_id}/summary ───────────────────────────────────


@router.get("/{user_id}/summary", response_model=ClientSummaryOutput)
async def get_client_summary(
    org_id: str,
    user_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ClientSummaryOutput:
    """``GET /{user_id}/summary`` (镜像 routes.ts:41-45 + service.ts:51-92).

    ⚠ PHI access log: 含 profile.
    """
    _require_org(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    target_uuid = parse_uuid_or_raise(user_id, field="userId")

    # PHI access log
    await record_phi_access(
        db=db,
        org_id=org_id if org else "",
        user_id=user.id,
        client_id=user_id,
        resource="client_profiles",
        action="view",
        data_class="phi_full",
        actor_role_snapshot=org.role_v2 if org else None,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    # profile
    pq = (
        select(ClientProfile)
        .where(
            and_(
                ClientProfile.org_id == org_uuid,
                ClientProfile.user_id == target_uuid,
            )
        )
        .limit(1)
    )
    profile = (await db.execute(pq)).scalar_one_or_none()

    # user info
    uq = select(User.name, User.email, User.avatar_url).where(User.id == target_uuid).limit(1)
    user_row = (await db.execute(uq)).first()
    user_embed: UserBasicEmbed | None = None
    if user_row is not None:
        user_embed = UserBasicEmbed(name=user_row[0], email=user_row[1], avatar_url=user_row[2])

    # active episodes
    eq = select(CareEpisode).where(
        and_(
            CareEpisode.org_id == org_uuid,
            CareEpisode.client_id == target_uuid,
            CareEpisode.status == "active",
        )
    )
    episodes = list((await db.execute(eq)).scalars().all())

    # recent 5 results
    rq = (
        select(
            AssessmentResult.id,
            AssessmentResult.total_score,
            AssessmentResult.risk_level,
            AssessmentResult.created_at,
        )
        .where(AssessmentResult.user_id == target_uuid)
        .order_by(asc(AssessmentResult.created_at))
        .limit(5)
    )
    result_rows = list((await db.execute(rq)).all())

    return ClientSummaryOutput(
        user=user_embed,
        profile=_profile_to_output(profile) if profile else None,
        active_episodes=[_episode_to_output(e) for e in episodes],
        recent_results=[
            AssessmentResultEmbed(
                id=str(r[0]),
                total_score=float(r[1]) if r[1] is not None else None,
                risk_level=r[2],
                created_at=r[3],
            )
            for r in result_rows
        ],
    )


__all__ = ["router"]
