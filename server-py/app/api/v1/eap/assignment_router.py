"""
EAP Counselor Assignment router — 镜像 ``server/src/modules/eap/eap-assignment.routes.ts`` (203 行)。

挂在 ``/api/orgs/{org_id}/eap/assignments`` 前缀下。

3 个 endpoint:
  GET    /              — 列出本 org (作为 provider) 派遣到所有企业的 assignments
  POST   /              — 派遣咨询师到企业 (atomic: 建 assignment + enterprise org_member)
  DELETE /{assignment_id} — 撤销派遣 (mark removed + 移除 enterprise org_member)

RBAC: requireRole('org_admin') — 所有 endpoint 必须 org_admin.

Transactional 重点 (POST /):
  1. 验 partnership active 且本 org 是 provider
  2. 验 counselor 是本 org 的 active counselor
  3. 防重复派遣 (同 enterprise + counselor 唯一)
  4. 建 assignment + 在 enterprise org 建 counselor org_member (单 try/except + rollback)
  5. ``source_partnership_id`` 标记溯源, 撤销时只删此来源的 member
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.eap.schemas import (
    AssignmentCreateRequest,
    AssignmentCreateResponse,
    AssignmentListResponse,
    AssignmentPlain,
    AssignmentRow,
)
from app.core.database import get_db
from app.db.models.eap_counselor_assignments import EAPCounselorAssignment
from app.db.models.eap_partnerships import EAPPartnership
from app.db.models.org_members import OrgMember
from app.db.models.users import User
from app.lib.errors import ForbiddenError, NotFoundError, ValidationError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


def _require_org_admin(org: OrgContext | None) -> OrgContext:
    """``requireRole('org_admin')`` 等价."""
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.role != "org_admin":
        raise ForbiddenError("insufficient_role")
    return org


def _assignment_plain(a: EAPCounselorAssignment) -> AssignmentPlain:
    """ORM EAPCounselorAssignment → AssignmentPlain."""
    return AssignmentPlain(
        id=str(a.id),
        partnership_id=str(a.partnership_id),
        counselor_user_id=str(a.counselor_user_id),
        enterprise_org_id=str(a.enterprise_org_id),
        provider_org_id=str(a.provider_org_id),
        status=a.status,
        assigned_at=a.assigned_at,
        assigned_by=str(a.assigned_by) if a.assigned_by else None,
        removed_at=a.removed_at,
    )


# ─── List Assignments ────────────────────────────────────────────


@router.get("/", response_model=AssignmentListResponse)
async def list_assignments(
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AssignmentListResponse:
    """列出本 org (provider) 派遣的 counselor assignments. 镜像 eap-assignment.routes.ts:34-67."""
    org_ctx = _require_org_admin(org)
    org_uuid = parse_uuid_or_raise(org_ctx.org_id, field="orgId")

    # 本 org 作为 provider 的所有 partnerships
    pq = select(EAPPartnership.id).where(EAPPartnership.provider_org_id == org_uuid)
    partnership_ids = [row[0] for row in (await db.execute(pq)).all()]
    if not partnership_ids:
        return AssignmentListResponse(assignments=[])

    # 这些 partnerships 下的全部 assignments + counselor user 信息
    aq = (
        select(
            EAPCounselorAssignment.id,
            EAPCounselorAssignment.partnership_id,
            EAPCounselorAssignment.counselor_user_id,
            EAPCounselorAssignment.enterprise_org_id,
            EAPCounselorAssignment.status,
            EAPCounselorAssignment.assigned_at,
            User.name,
            User.email,
        )
        .outerjoin(User, User.id == EAPCounselorAssignment.counselor_user_id)
        .where(EAPCounselorAssignment.partnership_id.in_(partnership_ids))
    )
    rows = (await db.execute(aq)).all()

    assignments = [
        AssignmentRow(
            id=str(a_id),
            partnership_id=str(p_id),
            counselor_user_id=str(c_id),
            enterprise_org_id=str(e_id),
            status=a_status,
            assigned_at=assigned_at,
            counselor_name=cname,
            counselor_email=cemail,
        )
        for a_id, p_id, c_id, e_id, a_status, assigned_at, cname, cemail in rows
    ]
    return AssignmentListResponse(assignments=assignments)


# ─── Assign Counselor ────────────────────────────────────────────


@router.post(
    "/",
    response_model=AssignmentCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_assignment(
    body: AssignmentCreateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AssignmentCreateResponse:
    """派遣咨询师到企业 — atomic. 镜像 eap-assignment.routes.ts:70-166.

    Transactional: assignment + enterprise org_member 单 commit, 失败 rollback.
    """
    org_ctx = _require_org_admin(org)
    org_uuid = parse_uuid_or_raise(org_ctx.org_id, field="orgId")  # provider org
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    p_uuid = parse_uuid_or_raise(body.partnership_id, field="partnershipId")
    c_uuid = parse_uuid_or_raise(body.counselor_user_id, field="counselorUserId")

    # 验 partnership 存在 + active + 本 org 是 provider
    pq = (
        select(EAPPartnership)
        .where(
            and_(
                EAPPartnership.id == p_uuid,
                EAPPartnership.provider_org_id == org_uuid,
                EAPPartnership.status == "active",
            )
        )
        .limit(1)
    )
    partnership = (await db.execute(pq)).scalar_one_or_none()
    if partnership is None:
        raise NotFoundError("Active partnership not found or you are not the provider")

    # 验 counselor 是本 org 的 active counselor
    mq = (
        select(OrgMember)
        .where(
            and_(
                OrgMember.org_id == org_uuid,
                OrgMember.user_id == c_uuid,
                OrgMember.role == "counselor",
                OrgMember.status == "active",
            )
        )
        .limit(1)
    )
    counselor_member = (await db.execute(mq)).scalar_one_or_none()
    if counselor_member is None:
        raise ValidationError("User is not an active counselor in your organization")

    # 防重复派遣 (同 enterprise + counselor 唯一)
    dup_q = (
        select(EAPCounselorAssignment)
        .where(
            and_(
                EAPCounselorAssignment.enterprise_org_id == partnership.enterprise_org_id,
                EAPCounselorAssignment.counselor_user_id == c_uuid,
            )
        )
        .limit(1)
    )
    if (await db.execute(dup_q)).scalar_one_or_none() is not None:
        raise ValidationError("Counselor is already assigned to this enterprise")

    try:
        # 建 assignment
        assignment = EAPCounselorAssignment(
            partnership_id=p_uuid,
            counselor_user_id=c_uuid,
            enterprise_org_id=partnership.enterprise_org_id,
            provider_org_id=org_uuid,
            status="active",
            assigned_by=user_uuid,
        )
        db.add(assignment)
        await db.flush()

        # 检查 enterprise org 是否已有此 counselor 的 member (安全 check)
        eq = (
            select(OrgMember)
            .where(
                and_(
                    OrgMember.org_id == partnership.enterprise_org_id,
                    OrgMember.user_id == c_uuid,
                )
            )
            .limit(1)
        )
        existing_member = (await db.execute(eq)).scalar_one_or_none()
        if existing_member is None:
            # 在 enterprise org 创 counselor member, 复制 specialties / bio (counselor profile)
            db.add(
                OrgMember(
                    org_id=partnership.enterprise_org_id,
                    user_id=c_uuid,
                    role="counselor",
                    status="active",
                    source_partnership_id=p_uuid,
                    specialties=counselor_member.specialties or [],
                    bio=counselor_member.bio,
                )
            )

        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="create",
        resource="eap_counselor_assignments",
        resource_id=str(assignment.id),
        ip_address=request.client.host if request.client else None,
    )
    return AssignmentCreateResponse(assignment=_assignment_plain(assignment))


# ─── Remove Assignment ───────────────────────────────────────────


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assignment(
    assignment_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """撤销派遣 — mark removed + 删 enterprise org_member (仅同 source).

    镜像 eap-assignment.routes.ts:169-202.
    """
    org_ctx = _require_org_admin(org)
    org_uuid = parse_uuid_or_raise(org_ctx.org_id, field="orgId")
    a_uuid = parse_uuid_or_raise(assignment_id, field="assignmentId")

    aq = (
        select(EAPCounselorAssignment)
        .where(
            and_(
                EAPCounselorAssignment.id == a_uuid,
                EAPCounselorAssignment.provider_org_id == org_uuid,
            )
        )
        .limit(1)
    )
    assignment = (await db.execute(aq)).scalar_one_or_none()
    if assignment is None:
        raise NotFoundError("Assignment", assignment_id)

    # mark removed
    assignment.status = "removed"
    assignment.removed_at = datetime.now(UTC)

    # 删 enterprise org_member (仅当 sourcePartnership 一致, 不会误删别处建的 member)
    await db.execute(
        delete(OrgMember).where(
            and_(
                OrgMember.org_id == assignment.enterprise_org_id,
                OrgMember.user_id == assignment.counselor_user_id,
                OrgMember.source_partnership_id == assignment.partnership_id,
            )
        )
    )
    await db.commit()

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="delete",
        resource="eap_counselor_assignments",
        resource_id=str(a_uuid),
        ip_address=request.client.host if request.client else None,
    )


__all__ = ["router"]
