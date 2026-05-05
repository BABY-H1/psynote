"""
Course instance router — 镜像 ``server/src/modules/course/instance.routes.ts`` (152 行) +
``instance.service.ts`` (241 行)。

挂在 ``/api/orgs/{org_id}/course-instances`` prefix。

8 个 endpoint:

  GET    /                                              — 列表 (status / courseId / search 过滤)
  GET    /{instance_id}                                 — 详情 (含 course embed + enrollment_stats)
  GET    /{instance_id}/candidates                      — workflow 排队来源 (Phase 5 stub)
  POST   /                                              — 创建 (admin/counselor only)
  PATCH  /{instance_id}                                 — 更新 (admin/counselor only)
  DELETE /{instance_id}                                 — 删除 (仅 draft 可删, admin/counselor)
  POST   /{instance_id}/activate                        — 进入 active 状态
  POST   /{instance_id}/close                           — 进入 closed 状态
  POST   /{instance_id}/archive                         — 进入 archived 状态

RBAC:
  - 写入端点: ``org_admin`` / ``counselor`` legacy role
  - 读取端点: 任何登录用户 (Node 没显式 rejectClient hook 在 instance.routes.ts)

Template→Instance 派生 (镜像 instance.service.ts:108-130):
  - createInstance 校验源 course 在当前 org 可用 (org_id == 当前 OR org_id IS NULL + is_public=true)
  - 必须 status='published' (只有发布的课才能开班)
  - 否则 404 (课不存在) / 409 (课未发布)
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.course.schemas import (
    CourseEmbed,
    EnrollmentStats,
    InstanceCreateRequest,
    InstanceDetail,
    InstanceListItem,
    InstanceOutput,
    InstanceUpdateRequest,
)
from app.core.database import get_db
from app.db.models.course_enrollments import CourseEnrollment
from app.db.models.course_instances import CourseInstance
from app.db.models.courses import Course
from app.db.models.notifications import Notification
from app.db.models.org_members import OrgMember
from app.lib.errors import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.role_guards import require_admin_or_counselor

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── 工具 ─────────────────────────────────────────────────────────


def _require_admin_or_counselor(org: OrgContext | None) -> OrgContext:
    return require_admin_or_counselor(org)


def _require_org_context(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    return org


def _instance_to_output(i: CourseInstance) -> InstanceOutput:
    return InstanceOutput(
        id=str(i.id),
        org_id=str(i.org_id),
        course_id=str(i.course_id),
        title=i.title,
        description=i.description,
        publish_mode=i.publish_mode or "assign",
        status=i.status or "draft",
        capacity=i.capacity,
        target_group_label=i.target_group_label,
        responsible_id=str(i.responsible_id) if i.responsible_id else None,
        assessment_config=i.assessment_config or {},
        location=i.location,
        start_date=i.start_date,
        schedule=i.schedule,
        created_by=str(i.created_by) if i.created_by else None,
        created_at=getattr(i, "created_at", None),
        updated_at=getattr(i, "updated_at", None),
    )


async def _notify_org_admins(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    notification_type: str,
    title: str,
    ref_type: str,
    ref_id: uuid.UUID,
) -> None:
    """``notifyOrgAdmins`` 等价 — 给当前 org 所有 active org_admin 推一条通知.

    与 Node ``server/src/lib/notify-org-admins.ts`` 行为一致: 失败不破主流程, swallow + log.
    """
    try:
        admin_q = select(OrgMember.user_id).where(
            and_(
                OrgMember.org_id == org_id,
                OrgMember.role == "org_admin",
                OrgMember.status == "active",
            )
        )
        admin_user_ids = list((await db.execute(admin_q)).scalars().all())
        for uid in admin_user_ids:
            db.add(
                Notification(
                    org_id=org_id,
                    user_id=uid,
                    type=notification_type,
                    title=title,
                    ref_type=ref_type,
                    ref_id=ref_id,
                )
            )
        # 不 commit, 让外层 transaction 决定 (与 Node 一致)
    except Exception:
        logger.exception("notify_org_admins failed (swallowed)")


# ─── 列表 ──────────────────────────────────────────────────────────


@router.get("/", response_model=list[InstanceListItem])
async def list_instances(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    course_id: Annotated[str | None, Query(alias="courseId")] = None,
    search: Annotated[str | None, Query()] = None,
) -> list[InstanceListItem]:
    """``GET /`` 列表 (镜像 instance.routes.ts:16-28 + service.ts:7-56).

    返回每条 instance + course join (course_type/target_audience/category) +
    enrollment_count (聚合).
    """
    _require_org_context(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")

    conditions = [CourseInstance.org_id == org_uuid]
    if status_filter:
        conditions.append(CourseInstance.status == status_filter)
    if course_id:
        course_uuid = parse_uuid_or_raise(course_id, field="courseId")
        conditions.append(CourseInstance.course_id == course_uuid)

    # enrollment count 子查询
    enroll_count_subq = (
        select(
            CourseEnrollment.instance_id.label("instance_id"),
            func.count(CourseEnrollment.id).label("enrollment_count"),
        )
        .group_by(CourseEnrollment.instance_id)
        .subquery()
    )

    q = (
        select(
            CourseInstance,
            Course.course_type,
            Course.target_audience,
            Course.category,
            func.coalesce(enroll_count_subq.c.enrollment_count, 0).label("enrollment_count"),
        )
        .outerjoin(Course, Course.id == CourseInstance.course_id)
        .outerjoin(enroll_count_subq, enroll_count_subq.c.instance_id == CourseInstance.id)
        .where(and_(*conditions))
        .order_by(desc(CourseInstance.created_at))
    )
    rows = (await db.execute(q)).all()

    out: list[InstanceListItem] = []
    for inst, course_type, target_audience, category, enrollment_count in rows:
        if search:
            s = search.lower()
            if s not in inst.title.lower() and s not in (inst.description or "").lower():
                continue
        base = _instance_to_output(inst).model_dump(by_alias=False)
        out.append(
            InstanceListItem(
                **base,
                course_type=course_type,
                target_audience=target_audience,
                course_category=category,
                enrollment_count=enrollment_count or 0,
            )
        )
    return out


@router.get("/{instance_id}", response_model=InstanceDetail)
async def get_instance(
    org_id: str,
    instance_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InstanceDetail:
    """``GET /{instance_id}`` 详情 (镜像 instance.routes.ts:32-35 + service.ts:58-91)."""
    _require_org_context(org)
    instance_uuid = parse_uuid_or_raise(instance_id, field="instanceId")

    q = (
        select(CourseInstance, Course.title, Course.category)
        .outerjoin(Course, Course.id == CourseInstance.course_id)
        .where(CourseInstance.id == instance_uuid)
        .limit(1)
    )
    row = (await db.execute(q)).first()
    if row is None:
        raise NotFoundError("CourseInstance", instance_id)

    inst, course_title, course_category = row

    eq = select(CourseEnrollment).where(CourseEnrollment.instance_id == instance_uuid)
    enrollments = list((await db.execute(eq)).scalars().all())
    total = len(enrollments)
    completed = sum(1 for e in enrollments if (e.status or "") == "completed")

    base = _instance_to_output(inst).model_dump(by_alias=False)
    return InstanceDetail(
        **base,
        course=CourseEmbed(title=course_title, category=course_category),
        enrollment_stats=EnrollmentStats(total=total, completed=completed),
    )


@router.get("/{instance_id}/candidates", response_model=list[dict[str, Any]])
async def list_candidates(
    org_id: str,
    instance_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    candidate_status: Annotated[str | None, Query(alias="status")] = None,
) -> list[dict[str, Any]]:
    """``GET /{instance_id}/candidates`` workflow 排队来源 (镜像 instance.routes.ts:38-47).

    Phase 3 stub — Node 端调 ``listCandidatesForService``, 我们这里返回空列表 (后续 Phase 接入 triage queries).
    """
    _require_org_context(org)
    _ = (instance_id, candidate_status, db)
    return []


# ─── Create / Update / Delete ────────────────────────────────────


@router.post(
    "/",
    response_model=InstanceOutput,
    status_code=status.HTTP_201_CREATED,
)
async def create_instance(
    org_id: str,
    body: InstanceCreateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InstanceOutput:
    """``POST /`` 新建实例 (admin/counselor). 镜像 routes.ts:51-81 + service.ts:93-161.

    template→instance 派生:
      1. 校验 course 在当前 org 可用 (org_id == 当前 OR null+public)
      2. 校验 course.status == 'published' (否则 409)
      3. 创建 instance + 通知本机构所有 admin (同 transaction commit)
    """
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")
    course_uuid = parse_uuid_or_raise(body.course_id, field="courseId")

    # 校验源 course 可用 + 已 published
    sq = (
        select(Course)
        .where(
            and_(
                Course.id == course_uuid,
                or_(
                    Course.org_id == org_uuid,
                    and_(Course.org_id.is_(None), Course.is_public.is_(True)),
                ),
            )
        )
        .limit(1)
    )
    source = (await db.execute(sq)).scalar_one_or_none()
    if source is None:
        raise NotFoundError("Course", body.course_id)
    if (source.status or "") != "published":
        raise ConflictError("Only published courses can be used to create instances")

    responsible_uuid: uuid.UUID | None = (
        parse_uuid_or_raise(body.responsible_id, field="responsibleId")
        if body.responsible_id
        else user_uuid
    )

    try:
        instance = CourseInstance(
            org_id=org_uuid,
            course_id=course_uuid,
            title=body.title,
            description=body.description,
            publish_mode=body.publish_mode or "assign",
            status=body.status or "draft",
            capacity=body.capacity,
            target_group_label=body.target_group_label,
            responsible_id=responsible_uuid,
            assessment_config=body.assessment_config or {},
            location=body.location,
            start_date=body.start_date,
            schedule=body.schedule,
            created_by=user_uuid,
        )
        db.add(instance)
        await db.flush()  # 取 instance.id 给通知

        # 通知本机构所有 admin (与 Node 一致, 不显式 await reply, 但同 transaction)
        await _notify_org_admins(
            db,
            org_id=org_uuid,
            notification_type="counselor_content_created",
            title=f"新课程交付「{body.title}」已创建",
            ref_type="course_instance",
            ref_id=instance.id,
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="create",
        resource="course_instances",
        resource_id=str(instance.id),
        ip_address=request.client.host if request.client else None,
    )
    return _instance_to_output(instance)


@router.patch("/{instance_id}", response_model=InstanceOutput)
async def update_instance(
    org_id: str,
    instance_id: str,
    body: InstanceUpdateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InstanceOutput:
    """``PATCH /{instance_id}`` 部分更新 (admin/counselor). 镜像 routes.ts:85-106 + service.ts:163-187."""
    _require_admin_or_counselor(org)
    instance_uuid = parse_uuid_or_raise(instance_id, field="instanceId")

    q = select(CourseInstance).where(CourseInstance.id == instance_uuid).limit(1)
    instance = (await db.execute(q)).scalar_one_or_none()
    if instance is None:
        raise NotFoundError("CourseInstance", instance_id)

    updates = body.model_dump(exclude_unset=True, by_alias=False)
    if "responsible_id" in updates:
        rid = updates.pop("responsible_id")
        instance.responsible_id = parse_uuid_or_raise(rid, field="responsibleId") if rid else None
    for field, value in updates.items():
        setattr(instance, field, value)
    instance.updated_at = datetime.now(UTC)
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="course_instances",
        resource_id=instance_id,
        ip_address=request.client.host if request.client else None,
    )
    return _instance_to_output(instance)


@router.delete("/{instance_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_instance(
    org_id: str,
    instance_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """``DELETE /{instance_id}`` (admin/counselor). 镜像 routes.ts:110-117 + service.ts:189-208.

    仅 draft 状态可删 — 否则 400 (与 Node 一致, Node 抛 generic Error → 500, 我们改 400 更准确).
    """
    _require_admin_or_counselor(org)
    instance_uuid = parse_uuid_or_raise(instance_id, field="instanceId")
    q = select(CourseInstance).where(CourseInstance.id == instance_uuid).limit(1)
    instance = (await db.execute(q)).scalar_one_or_none()
    if instance is None:
        raise NotFoundError("CourseInstance", instance_id)
    if (instance.status or "") != "draft":
        raise ValidationError("Only draft instances can be deleted")

    await db.delete(instance)
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="delete",
        resource="course_instances",
        resource_id=instance_id,
        ip_address=request.client.host if request.client else None,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ─── Lifecycle (activate / close / archive) ──────────────────────


async def _set_instance_status(
    db: AsyncSession, instance_uuid: uuid.UUID, new_status: str
) -> CourseInstance:
    q = select(CourseInstance).where(CourseInstance.id == instance_uuid).limit(1)
    instance = (await db.execute(q)).scalar_one_or_none()
    if instance is None:
        raise NotFoundError("CourseInstance", str(instance_uuid))
    instance.status = new_status
    instance.updated_at = datetime.now(UTC)
    await db.commit()
    return instance


@router.post("/{instance_id}/activate", response_model=InstanceOutput)
async def activate_instance(
    org_id: str,
    instance_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InstanceOutput:
    """``POST /{instance_id}/activate`` 进入 active (admin/counselor)."""
    _require_admin_or_counselor(org)
    instance_uuid = parse_uuid_or_raise(instance_id, field="instanceId")
    instance = await _set_instance_status(db, instance_uuid, "active")
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="course_instances",
        resource_id=instance_id,
        ip_address=request.client.host if request.client else None,
    )
    return _instance_to_output(instance)


@router.post("/{instance_id}/close", response_model=InstanceOutput)
async def close_instance(
    org_id: str,
    instance_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InstanceOutput:
    """``POST /{instance_id}/close`` 进入 closed (admin/counselor)."""
    _require_admin_or_counselor(org)
    instance_uuid = parse_uuid_or_raise(instance_id, field="instanceId")
    instance = await _set_instance_status(db, instance_uuid, "closed")
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="course_instances",
        resource_id=instance_id,
        ip_address=request.client.host if request.client else None,
    )
    return _instance_to_output(instance)


@router.post("/{instance_id}/archive", response_model=InstanceOutput)
async def archive_instance(
    org_id: str,
    instance_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InstanceOutput:
    """``POST /{instance_id}/archive`` 进入 archived (admin/counselor)."""
    _require_admin_or_counselor(org)
    instance_uuid = parse_uuid_or_raise(instance_id, field="instanceId")
    instance = await _set_instance_status(db, instance_uuid, "archived")
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="course_instances",
        resource_id=instance_id,
        ip_address=request.client.host if request.client else None,
    )
    return _instance_to_output(instance)


__all__ = ["router"]
