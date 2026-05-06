"""
Group enrollment router — 镜像 ``server/src/modules/group/enrollment.routes.ts`` (102 行)
+ ``enrollment.service.ts`` (233 行).

挂在 ``/api/orgs/{org_id}/group/instances`` prefix. 3 endpoints (admin):

  POST   /:instance_id/enroll-batch        — 批量报名 (admin / counselor)
  POST   /:instance_id/enroll              — 单条报名 (任何 staff; client 自助)
  PATCH  /enrollments/:enrollment_id        — 审批状态 (admin / counselor)

业务规则:
  - 防重: 同 (instance, user) 已存在 → ConflictError
  - capacity-aware initial status:
      * 当前 approved 数 < capacity (或 capacity=NULL) → 'pending'
      * 已满 → 'waitlisted'
  - status='approved' 时 set ``enrolled_at = now``
  - 退出 / 拒绝 (withdrawn / rejected) 后自动从 waitlist 递补 1 人
  - care_episode_id 关联时同步写 care_timeline
  - findOrCreateUserByEmail: 外部 email 自动建 user + org_member(role='client')
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import and_, asc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.group.schemas import (
    EnrollBatchErrorEntry,
    EnrollBatchRequest,
    EnrollBatchResponse,
    EnrollmentRow,
    EnrollmentStatusUpdateRequest,
    EnrollSelfRequest,
)
from app.core.database import get_db
from app.db.models.care_timeline import CareTimeline
from app.db.models.group_enrollments import GroupEnrollment
from app.db.models.group_instances import GroupInstance
from app.db.models.org_members import OrgMember
from app.db.models.users import User
from app.lib.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.role_guards import require_admin_or_counselor

router = APIRouter()


# ─── Utility ─────────────────────────────────────────────────────


def _enrollment_to_row(e: GroupEnrollment) -> EnrollmentRow:
    return EnrollmentRow(
        id=str(e.id),
        instance_id=str(e.instance_id),
        user_id=str(e.user_id),
        care_episode_id=str(e.care_episode_id) if e.care_episode_id else None,
        status=e.status,
        screening_result_id=str(e.screening_result_id) if e.screening_result_id else None,
        enrolled_at=e.enrolled_at,
        created_at=getattr(e, "created_at", None),
    )


# ─── Core service helpers (路由内 inline 用) ──────────────────────


async def _find_or_create_user_by_email(
    db: AsyncSession, *, email: str, name: str | None, phone: str | None, org_id: uuid.UUID
) -> uuid.UUID:
    """``findOrCreateUserByEmail`` — 镜像 enrollment.service.ts:7-60.

    找到 user: 若不在 org 则补 client membership; 找不到则建 user + 加 client member.

    注: ``phone`` 暂存留 (与 Node 一致, users 表无该列, 仅扩展用).
    """
    _ = phone  # users 表无 phone 列, 与 Node 一致, 仅 reserved for future use

    u_q = select(User).where(User.email == email).limit(1)
    existing = (await db.execute(u_q)).scalar_one_or_none()

    if existing is not None:
        m_q = (
            select(OrgMember)
            .where(and_(OrgMember.org_id == org_id, OrgMember.user_id == existing.id))
            .limit(1)
        )
        if (await db.execute(m_q)).scalar_one_or_none() is None:
            db.add(OrgMember(org_id=org_id, user_id=existing.id, role="client"))
        return existing.id

    new_user = User(
        email=email,
        name=name or email.split("@")[0],
    )
    db.add(new_user)
    await db.flush()  # 取 user.id
    db.add(OrgMember(org_id=org_id, user_id=new_user.id, role="client"))
    return new_user.id


async def _do_enroll(
    db: AsyncSession,
    *,
    instance_id: uuid.UUID,
    user_id: uuid.UUID,
    care_episode_id: uuid.UUID | None = None,
    screening_result_id: uuid.UUID | None = None,
    # Phase 5 N+1 修: batch caller (e.g. enroll_batch) 可以预 fetch 这两个,
    # 避免每个 member 都各自查 instance / approved_count.
    cached_instance: GroupInstance | None = None,
    cached_approved_count: int | None = None,
) -> GroupEnrollment:
    """``enroll`` — 镜像 enrollment.service.ts:62-137.

    防重 + capacity-aware initial status + (若 care_episode_id) care_timeline.
    """
    # 防重
    dup_q = (
        select(GroupEnrollment)
        .where(
            and_(
                GroupEnrollment.instance_id == instance_id,
                GroupEnrollment.user_id == user_id,
            )
        )
        .limit(1)
    )
    if (await db.execute(dup_q)).scalar_one_or_none() is not None:
        raise ConflictError("User is already enrolled in this group")

    inst: GroupInstance | None
    if cached_instance is not None:
        inst = cached_instance
    else:
        inst_q = select(GroupInstance).where(GroupInstance.id == instance_id).limit(1)
        inst = (await db.execute(inst_q)).scalar_one_or_none()

    initial_status = "pending"
    if inst is not None and inst.capacity:
        if cached_approved_count is not None:
            approved_count = cached_approved_count
        else:
            cnt_q = select(func.count()).where(
                and_(
                    GroupEnrollment.instance_id == instance_id,
                    GroupEnrollment.status == "approved",
                )
            )
            approved_count = (await db.execute(cnt_q)).scalar() or 0
        if int(approved_count) >= inst.capacity:
            initial_status = "waitlisted"

    enrollment = GroupEnrollment(
        instance_id=instance_id,
        user_id=user_id,
        care_episode_id=care_episode_id,
        screening_result_id=screening_result_id,
        status=initial_status,
    )
    db.add(enrollment)
    await db.flush()

    if care_episode_id is not None:
        summary = (
            "已加入团辅等候列表"
            if initial_status == "waitlisted"
            else "已提交团辅报名申请, 等待审批"
        )
        title = "加入团辅等候" if initial_status == "waitlisted" else "报名团辅"
        db.add(
            CareTimeline(
                care_episode_id=care_episode_id,
                event_type="group_enrollment",
                ref_id=enrollment.id,
                title=title,
                summary=summary,
                created_by=user_id,
            )
        )

    return enrollment


async def _auto_promote_waitlist(db: AsyncSession, instance_id: uuid.UUID) -> None:
    """``autoPromoteWaitlist`` — 镜像 enrollment.service.ts:182-233.

    若有空位 + 等候队列有人, 把最早 waitlisted 转为 pending + 写 timeline.
    """
    inst_q = select(GroupInstance).where(GroupInstance.id == instance_id).limit(1)
    inst = (await db.execute(inst_q)).scalar_one_or_none()
    if inst is None or not inst.capacity:
        return

    cnt_q = select(func.count()).where(
        and_(
            GroupEnrollment.instance_id == instance_id,
            GroupEnrollment.status == "approved",
        )
    )
    approved_count = (await db.execute(cnt_q)).scalar() or 0
    if int(approved_count) >= inst.capacity:
        return

    next_q = (
        select(GroupEnrollment)
        .where(
            and_(
                GroupEnrollment.instance_id == instance_id,
                GroupEnrollment.status == "waitlisted",
            )
        )
        .order_by(asc(GroupEnrollment.created_at))
        .limit(1)
    )
    nxt = (await db.execute(next_q)).scalar_one_or_none()
    if nxt is None:
        return

    nxt.status = "pending"
    if nxt.care_episode_id is not None:
        db.add(
            CareTimeline(
                care_episode_id=nxt.care_episode_id,
                event_type="group_enrollment",
                ref_id=nxt.id,
                title="团辅等候递补",
                summary="有名额空出, 已从等候列表转为待审批",
            )
        )


# ─── Routes ─────────────────────────────────────────────────────


@router.post(
    "/{instance_id}/enroll-batch",
    response_model=EnrollBatchResponse,
    status_code=status.HTTP_201_CREATED,
)
async def enroll_batch(
    org_id: str,
    instance_id: str,
    body: EnrollBatchRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EnrollBatchResponse:
    """批量报名 (admin / counselor). 镜像 enrollment.routes.ts:14-62.

    每条单独 try/except — 单条失败不打断其它. 与 Node 一致.
    """
    require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    inst_uuid = parse_uuid_or_raise(instance_id, field="instanceId")

    if not body.members:
        raise ValidationError("members array is required")

    # Phase 5 N+1 修: 之前每个 member 都独自查 instance + 算 approved_count (3 queries × N).
    # 改成 loop 之前一次拿 instance + 一次算 approved_count, 整个 batch 共享.
    # 用 sentinel 实现 lazy-fetch: 第一个有效 member 才触发 (空 batch / 全错的 batch 不会 hit DB).
    cached_inst: GroupInstance | None = None
    cached_approved: int = 0
    cached_loaded: bool = False

    enrolled_count = 0
    errors: list[EnrollBatchErrorEntry] = []

    for idx, m in enumerate(body.members):
        try:
            user_uuid: uuid.UUID | None = None
            if m.user_id:
                user_uuid = parse_uuid_or_raise(m.user_id, field="userId")
            elif m.email:
                user_uuid = await _find_or_create_user_by_email(
                    db, email=m.email, name=m.name, phone=m.phone, org_id=org_uuid
                )

            if user_uuid is None:
                errors.append(EnrollBatchErrorEntry(index=idx, message="需要提供 userId 或 email"))
                continue

            if not cached_loaded:
                cached_inst_q = select(GroupInstance).where(GroupInstance.id == inst_uuid).limit(1)
                cached_inst = (await db.execute(cached_inst_q)).scalar_one_or_none()
                if cached_inst is not None and cached_inst.capacity:
                    cnt_q = select(func.count()).where(
                        and_(
                            GroupEnrollment.instance_id == inst_uuid,
                            GroupEnrollment.status == "approved",
                        )
                    )
                    cached_approved = int((await db.execute(cnt_q)).scalar() or 0)
                cached_loaded = True

            await _do_enroll(
                db,
                instance_id=inst_uuid,
                user_id=user_uuid,
                cached_instance=cached_inst,
                cached_approved_count=cached_approved,
            )
            await db.commit()
            enrolled_count += 1
            cached_approved += 1  # 已 enroll 一个, 下一个的 capacity 检查用最新数
        except Exception as exc:
            await db.rollback()
            msg = str(exc) or "报名失败"
            errors.append(EnrollBatchErrorEntry(index=idx, message=msg))

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="create",
        resource="group_enrollments",
        resource_id=instance_id,
        ip_address=request.client.host if request.client else None,
    )
    return EnrollBatchResponse(enrolled=enrolled_count, errors=errors)


@router.post(
    "/{instance_id}/enroll",
    response_model=EnrollmentRow,
    status_code=status.HTTP_201_CREATED,
)
async def enroll_single(
    org_id: str,
    instance_id: str,
    body: EnrollSelfRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EnrollmentRow:
    """单条报名. 镜像 enrollment.routes.ts:64-82.

    无指定 user_id 时报名当前 user 自己 (client 自助).
    """
    if org is None:
        raise ForbiddenError("org_context_required")

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    inst_uuid = parse_uuid_or_raise(instance_id, field="instanceId")

    user_uuid = (
        parse_uuid_or_raise(body.user_id, field="userId")
        if body.user_id
        else parse_uuid_or_raise(user.id, field="userId")
    )
    care_uuid = (
        parse_uuid_or_raise(body.care_episode_id, field="careEpisodeId")
        if body.care_episode_id
        else None
    )
    screening_uuid = (
        parse_uuid_or_raise(body.screening_result_id, field="screeningResultId")
        if body.screening_result_id
        else None
    )

    try:
        enrollment = await _do_enroll(
            db,
            instance_id=inst_uuid,
            user_id=user_uuid,
            care_episode_id=care_uuid,
            screening_result_id=screening_uuid,
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
        resource="group_enrollments",
        resource_id=str(enrollment.id),
        ip_address=request.client.host if request.client else None,
    )
    return _enrollment_to_row(enrollment)


@router.patch(
    "/enrollments/{enrollment_id}",
    response_model=EnrollmentRow,
)
async def update_enrollment_status(
    org_id: str,
    enrollment_id: str,
    body: EnrollmentStatusUpdateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EnrollmentRow:
    """审批状态 (admin / counselor). 镜像 enrollment.routes.ts:84-101 + service.ts:139-180."""
    require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    enr_uuid = parse_uuid_or_raise(enrollment_id, field="enrollmentId")

    q = select(GroupEnrollment).where(GroupEnrollment.id == enr_uuid).limit(1)
    enrollment = (await db.execute(q)).scalar_one_or_none()
    if enrollment is None:
        raise NotFoundError("GroupEnrollment", enrollment_id)

    enrollment.status = body.status
    if body.status == "approved":
        enrollment.enrolled_at = datetime.now(UTC)

    if body.status in ("withdrawn", "rejected"):
        await _auto_promote_waitlist(db, enrollment.instance_id)

    if enrollment.care_episode_id is not None:
        labels: dict[str, str] = {
            "approved": "团辅报名已通过",
            "rejected": "团辅报名被拒绝",
            "withdrawn": "已退出团辅",
            "waitlisted": "已加入团辅等候列表",
        }
        title = labels.get(body.status) or f"团辅报名状态: {body.status}"
        approved_uuid = parse_uuid_or_raise(user.id, field="userId") if user.id else None
        db.add(
            CareTimeline(
                care_episode_id=enrollment.care_episode_id,
                event_type="group_enrollment",
                ref_id=enrollment.id,
                title=title,
                created_by=approved_uuid,
            )
        )

    await db.commit()

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="update",
        resource="group_enrollments",
        resource_id=enrollment_id,
        ip_address=request.client.host if request.client else None,
    )
    return _enrollment_to_row(enrollment)
