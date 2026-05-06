"""
Public group enroll router — 镜像 ``server/src/modules/group/public-enroll.routes.ts``
(352 行) + ``public-enroll.routes.test.ts`` (134 行).

挂在 ``/api/public/groups`` prefix. 4 endpoints (**完全无 auth**, 用于外部分享报名链接).

  GET    /:instance_id                          — 招募页信息 (status='recruiting' 才公开)
  POST   /:instance_id/apply                    — 公开申请报名 (找/建 user + 加 client 成员 + 建 enrollment)
  GET    /:instance_id/checkin/:session_id      — 自助签到页 (成员名单 + 已签到 map)
  POST   /:instance_id/checkin/:session_id      — 自助签到

W2.8 安全 (security audit 2026-05-03, 见 Node test):
  POST /apply 与 POST /checkin/:session_id 都必须强校验:
  - apply: 已报名同 instance 不能再报
  - checkin: ``enrollment.instance_id`` 必须 == path 的 instance_id, 否则 404 (防跨组伪造签到)

Transactional (POST /apply):
  user (找或新建) + org_member(role='client') + group_enrollment 一起 commit.
  失败 rollback (与 Node bug 修复一致: 之前漏建 org_member 导致孤儿用户).
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.group.schemas import PublicApplyRequest, PublicCheckinRequest
from app.core.database import get_db
from app.db.models.group_enrollments import GroupEnrollment
from app.db.models.group_instances import GroupInstance
from app.db.models.group_scheme_sessions import GroupSchemeSession
from app.db.models.group_schemes import GroupScheme
from app.db.models.group_session_attendance import GroupSessionAttendance
from app.db.models.group_session_records import GroupSessionRecord
from app.db.models.org_members import OrgMember
from app.db.models.users import User
from app.lib.uuid_utils import parse_uuid_or_none

router = APIRouter()


# ─── GET /:instance_id ──────────────────────────────────────────


@router.get("/{instance_id}")
async def get_public_instance(
    instance_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """招募页信息. 镜像 public-enroll.routes.ts:14-98.

    错误用 ``{error, message, ...}`` 形式 200 返回 (与 Node behaviorl 一致), 不抛 HTTP 4xx.
    """
    inst_uuid = parse_uuid_or_none(instance_id)
    if inst_uuid is None:
        return {"error": "not_found", "message": "未找到该团辅活动"}

    inst_q = select(GroupInstance).where(GroupInstance.id == inst_uuid).limit(1)
    inst = (await db.execute(inst_q)).scalar_one_or_none()
    if inst is None:
        return {"error": "not_found", "message": "未找到该团辅活动"}

    if inst.status != "recruiting":
        msg_map = {
            "ended": "该活动已结束",
            "ongoing": "该活动已开始, 暂不接受新报名",
        }
        return {
            "error": "not_recruiting",
            "status": inst.status,
            "message": msg_map.get(inst.status or "", "该活动暂未开放报名"),
        }

    # scheme info 选填
    scheme_info: dict[str, Any] | None = None
    if inst.scheme_id is not None:
        sch_q = select(GroupScheme).where(GroupScheme.id == inst.scheme_id).limit(1)
        scheme = (await db.execute(sch_q)).scalar_one_or_none()
        if scheme is not None:
            ss_q = select(GroupSchemeSession.id).where(GroupSchemeSession.scheme_id == scheme.id)
            session_ids = list((await db.execute(ss_q)).scalars().all())
            scheme_info = {
                "title": scheme.title,
                "description": scheme.description,
                "theory": scheme.theory,
                "overallGoal": scheme.overall_goal,
                "targetAudience": scheme.target_audience,
                "ageRange": scheme.age_range,
                "recommendedSize": scheme.recommended_size,
                "totalSessions": scheme.total_sessions,
                "sessionDuration": scheme.session_duration,
                "frequency": scheme.frequency,
                "sessionCount": len(session_ids),
            }

    # 单 query 聚合 (#4: 公开端点高 QPS, 不要 hydrate 全表 enrollment 行)
    cnt_q = select(
        func.count().filter(GroupEnrollment.status == "approved").label("approved"),
        func.count().filter(GroupEnrollment.status == "pending").label("pending"),
    ).where(GroupEnrollment.instance_id == inst_uuid)
    cnt_row = (await db.execute(cnt_q)).first()
    approved_count = int(cnt_row[0]) if cnt_row else 0
    pending_count = int(cnt_row[1]) if cnt_row else 0

    return {
        "id": str(inst.id),
        "title": inst.title,
        "description": inst.description,
        "location": inst.location,
        "startDate": inst.start_date.isoformat() if inst.start_date else None,
        "schedule": inst.schedule,
        "duration": inst.duration,
        "capacity": inst.capacity,
        "approvedCount": approved_count,
        "pendingCount": pending_count,
        "spotsLeft": (
            max(0, inst.capacity - approved_count) if inst.capacity is not None else None
        ),
        "recruitmentAssessments": list(inst.recruitment_assessments or []),
        "scheme": scheme_info,
    }


# ─── POST /:instance_id/apply ───────────────────────────────────


@router.post("/{instance_id}/apply")
async def apply_public_enroll(
    instance_id: str,
    body: PublicApplyRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> JSONResponse:
    """公开申请报名 — transactional. 镜像 public-enroll.routes.ts:101-233.

    单 try/except 包 user (找或新建) + org_member(role='client') + enrollment.
    失败 rollback (修复历史 bug: 漏建 org_member 导致孤儿用户).
    """
    if not body.name:
        return JSONResponse(status_code=400, content={"error": "请填写姓名"})

    inst_uuid = parse_uuid_or_none(instance_id)
    if inst_uuid is None:
        return JSONResponse(status_code=404, content={"error": "未找到该团辅活动"})

    inst_q = select(GroupInstance).where(GroupInstance.id == inst_uuid).limit(1)
    inst = (await db.execute(inst_q)).scalar_one_or_none()
    if inst is None:
        return JSONResponse(status_code=404, content={"error": "未找到该团辅活动"})

    if inst.status != "recruiting":
        return JSONResponse(status_code=400, content={"error": "该活动暂未开放报名"})

    # 容量检查
    if inst.capacity:
        from sqlalchemy import func as sa_func

        cnt_q = select(sa_func.count()).where(
            and_(
                GroupEnrollment.instance_id == inst_uuid,
                GroupEnrollment.status == "approved",
            )
        )
        approved_count = (await db.execute(cnt_q)).scalar() or 0
        if int(approved_count) >= inst.capacity:
            return JSONResponse(status_code=400, content={"error": "报名已满, 暂无空位"})

    try:
        # 找 / 建 user — Phase 5 P0 fix (Fix 5): 公开报名查询优先级 phone > email,
        # 防止 email squat 攻击.
        user_id: uuid.UUID
        existing_user = None
        if body.phone:
            u_q = select(User).where(User.phone == body.phone).limit(1)
            existing_user = (await db.execute(u_q)).scalar_one_or_none()
        if existing_user is None and body.email:
            u_q = select(User).where(User.email == body.email).limit(1)
            existing_user = (await db.execute(u_q)).scalar_one_or_none()

        if existing_user is not None:
            user_id = existing_user.id
        else:
            # Phase 5 P0 fix (Fix 5): 公开报名建 User 时**不占 email UNIQUE**
            # → email=None (匿名 user). 受害者后续走 counseling-public / eap-public
            # 真注册时按 phone 查到这个匿名 user 并 claim.
            new_user = User(name=body.name, email=None, phone=body.phone)
            db.add(new_user)
            await db.flush()
            user_id = new_user.id

        # 补建 org_member(role='client') — 历史 bug 修复:
        # 之前漏建 org_member 导致公开报名产生孤儿 user 无法登陆看到自己数据
        m_q = (
            select(OrgMember.id)
            .where(and_(OrgMember.org_id == inst.org_id, OrgMember.user_id == user_id))
            .limit(1)
        )
        existing_member = (await db.execute(m_q)).scalar_one_or_none()
        if existing_member is None:
            db.add(
                OrgMember(
                    org_id=inst.org_id,
                    user_id=user_id,
                    role="client",
                    status="active",
                )
            )

        # 防重复报名
        dup_q = (
            select(GroupEnrollment)
            .where(
                and_(
                    GroupEnrollment.instance_id == inst_uuid,
                    GroupEnrollment.user_id == user_id,
                )
            )
            .limit(1)
        )
        existing_enr = (await db.execute(dup_q)).scalar_one_or_none()
        if existing_enr is not None:
            # 不创建 — rollback 之前的 user/member adds 也无所谓 (existing 都存在)
            await db.rollback()
            return JSONResponse(
                status_code=400,
                content={
                    "error": "already_enrolled",
                    "message": "您已报名此活动",
                    "status": existing_enr.status,
                },
            )

        # 建 enrollment
        enrollment = GroupEnrollment(
            instance_id=inst_uuid,
            user_id=user_id,
            status="pending",
        )
        db.add(enrollment)
        await db.flush()

        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={
            "success": True,
            "enrollmentId": str(enrollment.id),
            "status": "pending",
            "message": "报名成功! 请等待审核.",
        },
    )


# ─── GET /:instance_id/checkin/:session_id ──────────────────────


@router.get("/{instance_id}/checkin/{session_id}")
async def get_public_checkin_page(
    instance_id: str,
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """签到页信息. 镜像 public-enroll.routes.ts:236-288."""
    inst_uuid = parse_uuid_or_none(instance_id)
    sess_uuid = parse_uuid_or_none(session_id)
    if inst_uuid is None or sess_uuid is None:
        return {"error": "not_found", "message": "未找到该活动"}

    inst_q = select(GroupInstance).where(GroupInstance.id == inst_uuid).limit(1)
    inst = (await db.execute(inst_q)).scalar_one_or_none()
    if inst is None:
        return {"error": "not_found", "message": "未找到该活动"}

    sess_q = (
        select(GroupSessionRecord)
        .where(
            and_(
                GroupSessionRecord.id == sess_uuid,
                GroupSessionRecord.instance_id == inst_uuid,
            )
        )
        .limit(1)
    )
    session = (await db.execute(sess_q)).scalar_one_or_none()
    if session is None:
        return {"error": "not_found", "message": "未找到该活动场次"}

    enr_q = (
        select(GroupEnrollment, User.name, User.email)
        .outerjoin(User, User.id == GroupEnrollment.user_id)
        .where(
            and_(
                GroupEnrollment.instance_id == inst_uuid,
                GroupEnrollment.status == "approved",
            )
        )
    )
    enr_rows = (await db.execute(enr_q)).all()

    att_q = select(GroupSessionAttendance).where(
        GroupSessionAttendance.session_record_id == sess_uuid
    )
    attendance_list = list((await db.execute(att_q)).scalars().all())
    att_map: dict[uuid.UUID, str] = {a.enrollment_id: a.status for a in attendance_list}

    members: list[dict[str, Any]] = []
    for e, u_name, _u_email in enr_rows:
        members.append(
            {
                "enrollmentId": str(e.id),
                "name": u_name or "未知",
                "checkedIn": att_map.get(e.id),
            }
        )

    return {
        "instanceTitle": inst.title,
        "sessionTitle": session.title,
        "sessionNumber": session.session_number,
        "sessionDate": session.date.isoformat() if session.date else None,
        "sessionStatus": session.status,
        "members": members,
    }


# ─── POST /:instance_id/checkin/:session_id ─────────────────────


@router.post("/{instance_id}/checkin/{session_id}")
async def post_public_checkin(
    instance_id: str,
    session_id: str,
    body: PublicCheckinRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> JSONResponse:
    """自助签到. 镜像 public-enroll.routes.ts:291-352.

    W2.8 (security audit 2026-05-03):
      - 必须验证 enrollment 属于本 instance, 否则 404 — 防跨组伪造任意签到.
    """
    if not body.enrollment_id:
        return JSONResponse(status_code=400, content={"error": "缺少成员信息"})

    inst_uuid = parse_uuid_or_none(instance_id)
    sess_uuid = parse_uuid_or_none(session_id)
    enr_uuid = parse_uuid_or_none(body.enrollment_id)
    if inst_uuid is None or sess_uuid is None:
        return JSONResponse(status_code=404, content={"error": "未找到该活动场次"})
    if enr_uuid is None:
        return JSONResponse(status_code=404, content={"error": "该报名记录不属于此活动"})

    # 1) session 必须存在 + 属于本 instance
    sess_q = (
        select(GroupSessionRecord)
        .where(
            and_(
                GroupSessionRecord.id == sess_uuid,
                GroupSessionRecord.instance_id == inst_uuid,
            )
        )
        .limit(1)
    )
    session = (await db.execute(sess_q)).scalar_one_or_none()
    if session is None:
        return JSONResponse(status_code=404, content={"error": "未找到该活动场次"})

    # 2) W2.8: enrollment 必须属于本 instance, 防跨组伪造任意签到
    enr_q = (
        select(GroupEnrollment.id)
        .where(
            and_(
                GroupEnrollment.id == enr_uuid,
                GroupEnrollment.instance_id == inst_uuid,
            )
        )
        .limit(1)
    )
    enrollment_in_inst = (await db.execute(enr_q)).scalar_one_or_none()
    if enrollment_in_inst is None:
        return JSONResponse(status_code=404, content={"error": "该报名记录不属于此活动"})

    # 3) 重复签到不再建新行, 直接返回已签到状态
    existing_q = (
        select(GroupSessionAttendance)
        .where(
            and_(
                GroupSessionAttendance.session_record_id == sess_uuid,
                GroupSessionAttendance.enrollment_id == enr_uuid,
            )
        )
        .limit(1)
    )
    existing = (await db.execute(existing_q)).scalar_one_or_none()
    if existing is not None:
        return JSONResponse(
            status_code=200,
            content={"success": True, "message": "您已签到", "status": existing.status},
        )

    # 4) 建 attendance row
    record = GroupSessionAttendance(
        session_record_id=sess_uuid,
        enrollment_id=enr_uuid,
        status="present",
    )
    db.add(record)
    await db.commit()

    return JSONResponse(
        status_code=200,
        content={"success": True, "message": "签到成功!", "status": record.status},
    )
