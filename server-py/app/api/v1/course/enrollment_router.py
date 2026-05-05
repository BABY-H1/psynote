"""
Course enrollment router — 镜像 ``server/src/modules/course/course-enrollment.routes.ts`` (203 行)。

挂在 ``/api/orgs/{org_id}/course-instances`` prefix (与 instance_router 同前缀, 不同子路径).

4 个 endpoint:

  GET    /{instance_id}/enrollments                                — 列表 (含 user join)
  POST   /{instance_id}/assign                                     — 单点指派 (admin/counselor)
  POST   /{instance_id}/batch-enroll                               — 批量班级报名 (admin/counselor)
  PATCH  /{instance_id}/enrollments/{enrollment_id}                — 审批 (approved/rejected, admin/counselor)

RBAC:
  - rejectClient (Node hook 等价): client legacy role 不可访问
  - 写入 (POST/PATCH): ``org_admin`` / ``counselor`` legacy role
  - 读取: 任何 staff (admin/counselor)

Assign 与 batch-enroll 区别:
  - ``assign``: enrollment_source = 'assigned', 走 careEpisodeId 关联
  - ``batch-enroll``: enrollment_source = 'class_batch', 走 group_label
  - 都自动 ``approval_status = 'auto_approved'`` (老师批量加入不需审批)
  - 都跳过已存在的报名 (返 ``skipped: true``)
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.course.schemas import (
    AssignResponse,
    AssignResultEntry,
    AssignUsersRequest,
    BatchEnrollRequest,
    BatchEnrollResponse,
    EnrollmentApprovalRequest,
    EnrollmentOutput,
)
from app.core.database import get_db
from app.db.models.course_enrollments import CourseEnrollment
from app.db.models.course_instances import CourseInstance
from app.db.models.users import User
from app.lib.errors import (
    NotFoundError,
    ValidationError,
)
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.role_guards import reject_client, require_admin_or_counselor

router = APIRouter()


# ─── 工具 ─────────────────────────────────────────────────────────


def _require_admin_or_counselor(org: OrgContext | None) -> OrgContext:
    return require_admin_or_counselor(org)


def _reject_client(org: OrgContext | None) -> OrgContext:
    return reject_client(org, client_message="来访者请通过客户端门户访问")


# ─── List enrollments ────────────────────────────────────────────


@router.get("/{instance_id}/enrollments", response_model=list[EnrollmentOutput])
async def list_enrollments(
    org_id: str,
    instance_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[EnrollmentOutput]:
    """``GET /{instance_id}/enrollments`` 列表 (镜像 routes.ts:22-48).

    返回 enrollment + user.name/email join.
    """
    _reject_client(org)
    instance_uuid = parse_uuid_or_raise(instance_id, field="instanceId")
    q = (
        select(CourseEnrollment, User.name, User.email)
        .outerjoin(User, User.id == CourseEnrollment.user_id)
        .where(CourseEnrollment.instance_id == instance_uuid)
    )
    rows = (await db.execute(q)).all()
    return [
        EnrollmentOutput(
            id=str(e.id),
            course_id=str(e.course_id),
            instance_id=str(e.instance_id) if e.instance_id else None,
            user_id=str(e.user_id),
            care_episode_id=str(e.care_episode_id) if e.care_episode_id else None,
            assigned_by=str(e.assigned_by) if e.assigned_by else None,
            enrollment_source=e.enrollment_source,
            approval_status=e.approval_status,
            approved_by=str(e.approved_by) if e.approved_by else None,
            progress=e.progress or {},
            status=e.status or "enrolled",
            enrolled_at=e.enrolled_at,
            completed_at=e.completed_at,
            user_name=user_name,
            user_email=user_email,
        )
        for e, user_name, user_email in rows
    ]


# ─── Assign / Batch-enroll (共享 inner loop) ─────────────────────


async def _enroll_user(
    db: AsyncSession,
    *,
    instance: CourseInstance,
    user_uuid: uuid.UUID,
    assigned_by_uuid: uuid.UUID,
    care_episode_id: str | None,
    enrollment_source: str,
) -> AssignResultEntry:
    """单条报名 — 已存在则 skipped, 否则新建. 与 routes.ts:73-104 / 133-162 对齐."""
    dup_q = (
        select(CourseEnrollment.id)
        .where(
            and_(
                CourseEnrollment.instance_id == instance.id,
                CourseEnrollment.user_id == user_uuid,
            )
        )
        .limit(1)
    )
    existing = (await db.execute(dup_q)).first()
    if existing is not None:
        return AssignResultEntry(
            user_id=str(user_uuid),
            skipped=True,
            enrollment_id=str(existing[0]),
        )

    care_uuid: uuid.UUID | None = None
    if care_episode_id:
        care_uuid = parse_uuid_or_raise(care_episode_id, field="careEpisodeId")

    enrollment = CourseEnrollment(
        course_id=instance.course_id,
        instance_id=instance.id,
        user_id=user_uuid,
        assigned_by=assigned_by_uuid,
        care_episode_id=care_uuid,
        enrollment_source=enrollment_source,
        approval_status="auto_approved",
    )
    db.add(enrollment)
    await db.flush()
    return AssignResultEntry(
        user_id=str(user_uuid),
        skipped=False,
        enrollment_id=str(enrollment.id),
    )


@router.post(
    "/{instance_id}/assign",
    response_model=AssignResponse,
    status_code=status.HTTP_201_CREATED,
)
async def assign_users(
    org_id: str,
    instance_id: str,
    body: AssignUsersRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AssignResponse:
    """``POST /{instance_id}/assign`` 单点指派 (镜像 routes.ts:52-108).

    enrollment_source='assigned', 含 careEpisodeId. 已存在不重复创建.
    """
    _require_admin_or_counselor(org)
    instance_uuid = parse_uuid_or_raise(instance_id, field="instanceId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    iq = select(CourseInstance).where(CourseInstance.id == instance_uuid).limit(1)
    instance = (await db.execute(iq)).scalar_one_or_none()
    if instance is None:
        raise NotFoundError("CourseInstance", instance_id)

    results: list[AssignResultEntry] = []
    try:
        for raw_uid in body.user_ids:
            uid_uuid = parse_uuid_or_raise(raw_uid, field="userId")
            entry = await _enroll_user(
                db,
                instance=instance,
                user_uuid=uid_uuid,
                assigned_by_uuid=user_uuid,
                care_episode_id=body.care_episode_id,
                enrollment_source="assigned",
            )
            results.append(entry)
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    # audit (每条 created 一行)
    for r in results:
        if not r.skipped:
            await record_audit(
                db=db,
                org_id=org_id,
                user_id=user.id,
                action="create",
                resource="course_enrollments",
                resource_id=r.enrollment_id,
                ip_address=request.client.host if request.client else None,
            )
    return AssignResponse(results=results)


@router.post(
    "/{instance_id}/batch-enroll",
    response_model=BatchEnrollResponse,
    status_code=status.HTTP_201_CREATED,
)
async def batch_enroll(
    org_id: str,
    instance_id: str,
    body: BatchEnrollRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BatchEnrollResponse:
    """``POST /{instance_id}/batch-enroll`` 批量班级报名 (镜像 routes.ts:112-166).

    enrollment_source='class_batch', 含 group_label.
    """
    _require_admin_or_counselor(org)
    instance_uuid = parse_uuid_or_raise(instance_id, field="instanceId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    iq = select(CourseInstance).where(CourseInstance.id == instance_uuid).limit(1)
    instance = (await db.execute(iq)).scalar_one_or_none()
    if instance is None:
        raise NotFoundError("CourseInstance", instance_id)

    results: list[AssignResultEntry] = []
    try:
        for raw_uid in body.user_ids:
            uid_uuid = parse_uuid_or_raise(raw_uid, field="userId")
            entry = await _enroll_user(
                db,
                instance=instance,
                user_uuid=uid_uuid,
                assigned_by_uuid=user_uuid,
                care_episode_id=None,
                enrollment_source="class_batch",
            )
            results.append(entry)
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    for r in results:
        if not r.skipped:
            await record_audit(
                db=db,
                org_id=org_id,
                user_id=user.id,
                action="create",
                resource="course_enrollments",
                resource_id=r.enrollment_id,
                ip_address=request.client.host if request.client else None,
            )
    return BatchEnrollResponse(results=results, group_label=body.group_label)


# ─── Approval status update ──────────────────────────────────────


@router.patch(
    "/{instance_id}/enrollments/{enrollment_id}",
    response_model=EnrollmentOutput,
)
async def update_enrollment_approval(
    org_id: str,
    instance_id: str,
    enrollment_id: str,
    body: EnrollmentApprovalRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EnrollmentOutput:
    """``PATCH /{instance_id}/enrollments/{enrollment_id}`` 审批 (镜像 routes.ts:170-201).

    仅 'approved' / 'rejected' 合法; 其它 400. 同时记 approved_by.
    """
    _require_admin_or_counselor(org)

    if body.approval_status not in ("approved", "rejected"):
        raise ValidationError("approvalStatus must be 'approved' or 'rejected'")

    instance_uuid = parse_uuid_or_raise(instance_id, field="instanceId")
    enroll_uuid = parse_uuid_or_raise(enrollment_id, field="enrollmentId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    q = (
        select(CourseEnrollment)
        .where(
            and_(
                CourseEnrollment.id == enroll_uuid,
                CourseEnrollment.instance_id == instance_uuid,
            )
        )
        .limit(1)
    )
    enrollment = (await db.execute(q)).scalar_one_or_none()
    if enrollment is None:
        raise NotFoundError("CourseEnrollment", enrollment_id)

    enrollment.approval_status = body.approval_status
    enrollment.approved_by = user_uuid
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="course_enrollments",
        resource_id=enrollment_id,
        ip_address=request.client.host if request.client else None,
    )
    return EnrollmentOutput(
        id=str(enrollment.id),
        course_id=str(enrollment.course_id),
        instance_id=str(enrollment.instance_id) if enrollment.instance_id else None,
        user_id=str(enrollment.user_id),
        care_episode_id=str(enrollment.care_episode_id) if enrollment.care_episode_id else None,
        assigned_by=str(enrollment.assigned_by) if enrollment.assigned_by else None,
        enrollment_source=enrollment.enrollment_source,
        approval_status=enrollment.approval_status,
        approved_by=str(enrollment.approved_by) if enrollment.approved_by else None,
        progress=enrollment.progress or {},
        status=enrollment.status or "enrolled",
        enrolled_at=enrollment.enrolled_at,
        completed_at=enrollment.completed_at,
    )


__all__ = ["router"]
