"""
Group instance router — 镜像 ``server/src/modules/group/instance.routes.ts`` (112 行)
+ ``instance.service.ts`` (221 行).

挂在 ``/api/orgs/{org_id}/group/instances`` prefix. 5 endpoints (省略 candidates,
triage 域跨模块, 在 Tier 4 接入):

  GET    /                  — 列表 (可选 ?status); leader 限缩按 dataScope 应用
  GET    /:instance_id      — 详情 + enrollments 用户摘要
  POST   /                  — 创建 + (可选) 从 scheme 自动生成 session 记录
  PATCH  /:instance_id      — 更新; 切到 ended/archived 自动派生 follow-up plans
  DELETE /:instance_id      — 删除 (org_admin only)

业务规则:
  - 创建若 ``scheme_id`` 不为空: 自动从 group_scheme_sessions 派生 group_session_records
    (status='planned', session_number 1-based)
  - 状态切到 ``ended`` / ``archived``: 根据 ``assessment_config.followUp[]`` 派生
    follow_up_plans (每个 enrollment × 每轮随访)
  - 通知 org_admins: 创建后 fire-and-forget (Phase 3 阶段降级为 best-effort log)
"""

from __future__ import annotations

import contextlib
import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import and_, asc, delete, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.group.schemas import (
    InstanceCreateRequest,
    InstanceDetail,
    InstanceEnrollmentRow,
    InstanceRow,
    InstanceUpdateRequest,
    InstanceUserSummary,
)
from app.core.database import get_db
from app.db.models.follow_up_plans import FollowUpPlan
from app.db.models.group_enrollments import GroupEnrollment
from app.db.models.group_instances import GroupInstance
from app.db.models.group_scheme_sessions import GroupSchemeSession
from app.db.models.group_session_records import GroupSessionRecord
from app.db.models.notifications import Notification
from app.db.models.users import User
from app.lib.errors import NotFoundError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.role_guards import reject_client, require_admin, require_admin_or_counselor

router = APIRouter()
logger = logging.getLogger(__name__)


# ─── Utility ─────────────────────────────────────────────────────


def _instance_to_row(inst: GroupInstance) -> InstanceRow:
    return InstanceRow(
        id=str(inst.id),
        org_id=str(inst.org_id),
        scheme_id=str(inst.scheme_id) if inst.scheme_id else None,
        title=inst.title,
        description=inst.description,
        category=inst.category,
        leader_id=str(inst.leader_id) if inst.leader_id else None,
        schedule=inst.schedule,
        duration=inst.duration,
        start_date=inst.start_date,
        location=inst.location,
        status=inst.status or "draft",
        capacity=inst.capacity,
        recruitment_assessments=[str(x) for x in (inst.recruitment_assessments or [])],
        overall_assessments=[str(x) for x in (inst.overall_assessments or [])],
        screening_notes=inst.screening_notes,
        assessment_config=inst.assessment_config or {},
        created_by=str(inst.created_by) if inst.created_by else None,
        created_at=getattr(inst, "created_at", None),
        updated_at=getattr(inst, "updated_at", None),
    )


# ─── Routes ─────────────────────────────────────────────────────


@router.get("/", response_model=list[InstanceRow])
async def list_instances(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    instance_status: Annotated[str | None, Query(alias="status")] = None,
) -> list[InstanceRow]:
    """列表 group instances. 镜像 instance.routes.ts:16-26 + service.ts:7-18.

    若 leader 是 counselor 且 ``full_practice_access=False``, 限缩到本人 (含 supervisees).
    Phase 3 注: dataScope 限缩用 OrgContext.is_supervisor + supervisee_user_ids 推导.
    """
    reject_client(org)
    assert org is not None

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    conds: list[Any] = [GroupInstance.org_id == org_uuid]
    if instance_status:
        conds.append(GroupInstance.status == instance_status)

    # leader 限缩: counselor 且非 full_practice_access (与 Node dataScope.type='assigned' 等价)
    if org.role == "counselor" and not org.full_practice_access:
        leader_ids: list[uuid.UUID] = []
        # member_id 不一定是 user_id, 但 Node 端 fallback 走 user.id
        with contextlib.suppress(ValueError, TypeError):
            leader_ids.append(uuid.UUID(org.member_id))
        # Node 用 ``request.user.id`` (= 当前 user_id) + supervisee_user_ids;
        # 这里 OrgContext 没存 user_id, 但 supervisee_user_ids 已是 user_id 列表
        for sid in org.supervisee_user_ids:
            with contextlib.suppress(ValueError, TypeError):
                leader_ids.append(uuid.UUID(sid))
        if leader_ids:
            conds.append(GroupInstance.leader_id.in_(leader_ids))

    q = select(GroupInstance).where(and_(*conds)).order_by(desc(GroupInstance.created_at))
    rows = list((await db.execute(q)).scalars().all())
    return [_instance_to_row(r) for r in rows]


@router.get("/{instance_id}", response_model=InstanceDetail)
async def get_instance(
    org_id: str,
    instance_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InstanceDetail:
    """详情 + enrollments. 镜像 instance.service.ts:20-47."""
    reject_client(org)
    inst_uuid = parse_uuid_or_raise(instance_id, field="instanceId")

    inst_q = select(GroupInstance).where(GroupInstance.id == inst_uuid).limit(1)
    inst = (await db.execute(inst_q)).scalar_one_or_none()
    if inst is None:
        raise NotFoundError("GroupInstance", instance_id)

    # join enrollments + users
    enr_q = (
        select(GroupEnrollment, User.name, User.email)
        .outerjoin(User, User.id == GroupEnrollment.user_id)
        .where(GroupEnrollment.instance_id == inst_uuid)
    )
    enr_rows = (await db.execute(enr_q)).all()

    enrollments: list[InstanceEnrollmentRow] = []
    for e, u_name, u_email in enr_rows:
        enrollments.append(
            InstanceEnrollmentRow(
                id=str(e.id),
                instance_id=str(e.instance_id),
                user_id=str(e.user_id),
                care_episode_id=str(e.care_episode_id) if e.care_episode_id else None,
                status=e.status,
                screening_result_id=str(e.screening_result_id) if e.screening_result_id else None,
                enrolled_at=e.enrolled_at,
                created_at=getattr(e, "created_at", None),
                user=InstanceUserSummary(name=u_name, email=u_email),
            )
        )

    base = _instance_to_row(inst).model_dump(by_alias=False)
    return InstanceDetail(**base, enrollments=enrollments)


@router.post("/", response_model=InstanceRow, status_code=status.HTTP_201_CREATED)
async def create_instance(
    org_id: str,
    body: InstanceCreateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InstanceRow:
    """创建 instance. 镜像 instance.service.ts:49-118.

    Transactional: instance + (若 scheme_id) 自动派生 session records 一起 commit.
    """
    require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    leader_uuid = (
        parse_uuid_or_raise(body.leader_id, field="leaderId") if body.leader_id else user_uuid
    )
    scheme_uuid = parse_uuid_or_raise(body.scheme_id, field="schemeId") if body.scheme_id else None

    try:
        inst = GroupInstance(
            org_id=org_uuid,
            scheme_id=scheme_uuid,
            title=body.title,
            description=body.description,
            category=body.category,
            leader_id=leader_uuid,
            schedule=body.schedule,
            duration=body.duration,
            start_date=body.start_date,
            location=body.location,
            status=body.status or "draft",
            capacity=body.capacity,
            recruitment_assessments=body.recruitment_assessments or [],
            overall_assessments=body.overall_assessments or [],
            screening_notes=body.screening_notes,
            assessment_config=body.assessment_config or {},
            created_by=user_uuid,
        )
        db.add(inst)
        await db.flush()  # 取 inst.id

        # 若关联 scheme: 自动派生 session 记录 (镜像 instance.service.ts:88-107)
        if scheme_uuid is not None:
            ss_q = (
                select(GroupSchemeSession)
                .where(GroupSchemeSession.scheme_id == scheme_uuid)
                .order_by(asc(GroupSchemeSession.sort_order))
            )
            scheme_sessions = list((await db.execute(ss_q)).scalars().all())
            for idx, ss in enumerate(scheme_sessions):
                rec = GroupSessionRecord(
                    instance_id=inst.id,
                    scheme_session_id=ss.id,
                    session_number=idx + 1,
                    title=ss.title,
                    status="planned",
                )
                db.add(rec)

        await db.commit()
    except Exception:
        await db.rollback()
        raise

    # 通知 org admins (best-effort): Phase 3 stub, 仅 log; Tier 4 接入真通知
    logger.info(
        "notify_org_admins: counselor_content_created org=%s ref=group_instance/%s title=%s",
        str(org_uuid),
        str(inst.id),
        inst.title,
    )

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="create",
        resource="group_instances",
        resource_id=str(inst.id),
        ip_address=request.client.host if request.client else None,
    )
    return _instance_to_row(inst)


@router.patch("/{instance_id}", response_model=InstanceRow)
async def update_instance(
    org_id: str,
    instance_id: str,
    body: InstanceUpdateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InstanceRow:
    """更新 instance. 镜像 instance.service.ts:120-153.

    若状态切到 ended/archived: best-effort 派生 follow-up plans (按 assessment_config.followUp).
    """
    require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    inst_uuid = parse_uuid_or_raise(instance_id, field="instanceId")

    q = select(GroupInstance).where(GroupInstance.id == inst_uuid).limit(1)
    inst = (await db.execute(q)).scalar_one_or_none()
    if inst is None:
        raise NotFoundError("GroupInstance", instance_id)

    update_data = body.model_dump(exclude_unset=True)

    # leader_id / scheme_id (本端不允许改 scheme_id; instance.service.ts 也不让) 处理 UUID 转换
    if "leader_id" in update_data and update_data["leader_id"] is not None:
        update_data["leader_id"] = parse_uuid_or_raise(update_data["leader_id"], field="leaderId")

    for k, v in update_data.items():
        setattr(inst, k, v)
    inst.updated_at = datetime.now(UTC)
    await db.commit()

    # 状态进入 ended / archived: best-effort 派生 follow-up plans
    if body.status in ("ended", "archived"):
        try:
            await _create_follow_up_plans_for_instance(db, inst)
        except Exception:
            logger.exception(
                "create_follow_up_plans_for_instance failed: instance=%s", str(inst.id)
            )

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="update",
        resource="group_instances",
        resource_id=str(inst.id),
        ip_address=request.client.host if request.client else None,
    )
    return _instance_to_row(inst)


@router.delete("/{instance_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_instance(
    org_id: str,
    instance_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """删除 instance (org_admin only). 镜像 instance.service.ts:213-221."""
    require_admin(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    inst_uuid = parse_uuid_or_raise(instance_id, field="instanceId")

    q = select(GroupInstance).where(GroupInstance.id == inst_uuid).limit(1)
    inst = (await db.execute(q)).scalar_one_or_none()
    if inst is None:
        raise NotFoundError("GroupInstance", instance_id)

    await db.execute(delete(GroupInstance).where(GroupInstance.id == inst_uuid))
    await db.commit()

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="delete",
        resource="group_instances",
        resource_id=str(inst_uuid),
        ip_address=request.client.host if request.client else None,
    )
    return None


# ─── Helper: ended/archived 时派生 follow-up plans ────────────────


async def _create_follow_up_plans_for_instance(db: AsyncSession, instance: GroupInstance) -> None:
    """instance.service.ts:155-211 等价 — 团辅结束时为每个已通过的 enrollment
    × 每轮随访配置 创建 follow_up_plan + 通知.

    单条 plan / notification 失败不打断其它 (与 Node 单 try/catch + 跳过一致).
    """
    config = instance.assessment_config or {}
    follow_up_rounds = config.get("followUp") or []
    if not follow_up_rounds:
        return

    enr_q = select(GroupEnrollment).where(
        and_(
            GroupEnrollment.instance_id == instance.id,
            GroupEnrollment.status == "approved",
        )
    )
    enrollments = list((await db.execute(enr_q)).scalars().all())
    if not enrollments:
        return

    now = datetime.now(UTC)

    for rnd in follow_up_rounds:
        delay_days = int(rnd.get("delayDays") or 0)
        assessments_arr = rnd.get("assessments") or []
        label = rnd.get("label")
        due = now + timedelta(days=delay_days)

        for enr in enrollments:
            # P2.6 flatten: follow-up plan 需 care_episode_id + assessments; 否则只跳 plan, 通知仍发
            should_create_plan = bool(enr.care_episode_id) and bool(assessments_arr)
            counselor_id = instance.leader_id or instance.created_by
            if should_create_plan and counselor_id is not None:
                try:
                    plan = FollowUpPlan(
                        org_id=instance.org_id,
                        care_episode_id=enr.care_episode_id,
                        counselor_id=counselor_id,
                        plan_type="group_followup",
                        assessment_id=parse_uuid_or_raise(
                            str(assessments_arr[0]), field="assessmentId"
                        ),
                        frequency=f"once_after_{delay_days}d",
                        next_due=due,
                        notes=f"{instance.title} - {label or f'{delay_days}天随访'}",
                    )
                    db.add(plan)
                except Exception:
                    # duplicate / FK 错误吞掉, 与 Node 行为一致
                    logger.debug(
                        "follow_up_plan insert skipped: instance=%s enrollment=%s",
                        str(instance.id),
                        str(enr.id),
                    )

            # 通知 always 试一次
            try:
                date_str = due.strftime("%Y/%m/%d")
                notif = Notification(
                    org_id=instance.org_id,
                    user_id=enr.user_id,
                    type="followup_scheduled",
                    title=f"{label or '随访评估'} 已安排",
                    body=(
                        f'"{instance.title}" 的随访评估将于 {date_str} 开始, 届时请完成量表填写.'
                    ),
                    ref_type="group_instance",
                    ref_id=instance.id,
                )
                db.add(notif)
            except Exception:
                logger.debug(
                    "follow_up notification skipped: instance=%s enrollment=%s",
                    str(instance.id),
                    str(enr.id),
                )

    await db.commit()
