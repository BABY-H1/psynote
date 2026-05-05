"""Client portal groups + courses discovery + participation router.

镜像 ``server/src/modules/client-portal/client-groups-courses.routes.ts``:

  GET  /groups                             可加入的团辅 (recruiting only)
  GET  /groups/{instance_id}               团辅详情 (含 enrollment + scheme + sessions + my-attendance)
  GET  /my-groups                          我的团辅报名
  POST /groups/{instance_id}/sessions/{session_record_id}/check-in  自助签到
  GET  /courses                            可学课程 (published only)
  GET  /my-courses                         我的课程报名
  GET  /courses/{course_id}                课程详情 (含 chapters + 学员可见 content blocks)

全部 guardian-blocked (Phase 14: 家长不能代孩子参团/选课/签到/学习).
self_only: enrollment / participation 强 ``user_id == caller_uuid``.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import and_, desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.client_portal.shared import reject_as_param
from app.core.database import get_db
from app.db.models.course_chapters import CourseChapter
from app.db.models.course_content_blocks import CourseContentBlock
from app.db.models.course_enrollments import CourseEnrollment
from app.db.models.courses import Course
from app.db.models.group_enrollments import GroupEnrollment
from app.db.models.group_instances import GroupInstance
from app.db.models.group_scheme_sessions import GroupSchemeSession
from app.db.models.group_schemes import GroupScheme
from app.db.models.group_session_attendance import GroupSessionAttendance
from app.db.models.group_session_records import GroupSessionRecord
from app.lib.errors import ValidationError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


def _instance_to_dict(i: GroupInstance) -> dict[str, Any]:
    return {
        "id": str(i.id),
        "orgId": str(i.org_id),
        "schemeId": str(i.scheme_id) if i.scheme_id else None,
        "title": i.title,
        "description": i.description,
        "category": i.category,
        "leaderId": str(i.leader_id) if i.leader_id else None,
        "schedule": i.schedule,
        "duration": i.duration,
        "startDate": i.start_date.isoformat() if i.start_date else None,
        "location": i.location,
        "status": i.status,
        "capacity": i.capacity,
        "recruitmentAssessments": list(i.recruitment_assessments or []),
        "overallAssessments": list(i.overall_assessments or []),
        "screeningNotes": i.screening_notes,
        "assessmentConfig": i.assessment_config or {},
    }


def _scheme_summary(s: GroupScheme) -> dict[str, Any]:
    return {
        "title": s.title,
        "overallGoal": s.overall_goal,
        "targetAudience": s.target_audience,
        "totalSessions": s.total_sessions,
        "sessionDuration": s.session_duration,
        "frequency": s.frequency,
        "theory": s.theory,
    }


def _enrollment_to_dict(e: GroupEnrollment) -> dict[str, Any]:
    return {
        "id": str(e.id),
        "instanceId": str(e.instance_id),
        "userId": str(e.user_id),
        "careEpisodeId": str(e.care_episode_id) if e.care_episode_id else None,
        "status": e.status,
        "screeningResultId": str(e.screening_result_id) if e.screening_result_id else None,
        "enrolledAt": e.enrolled_at.isoformat() if e.enrolled_at else None,
    }


def _session_record_to_dict(r: GroupSessionRecord) -> dict[str, Any]:
    return {
        "id": str(r.id),
        "instanceId": str(r.instance_id),
        "schemeSessionId": str(r.scheme_session_id) if r.scheme_session_id else None,
        "sessionNumber": r.session_number,
        "title": r.title,
        "date": r.date.isoformat() if r.date else None,
        "status": r.status,
        "notes": r.notes,
    }


def _attendance_to_dict(a: GroupSessionAttendance) -> dict[str, Any]:
    return {
        "id": str(a.id),
        "sessionRecordId": str(a.session_record_id),
        "enrollmentId": str(a.enrollment_id),
        "status": a.status,
        "note": a.note,
    }


def _course_to_dict(c: Course) -> dict[str, Any]:
    return {
        "id": str(c.id),
        "orgId": str(c.org_id) if c.org_id else None,
        "title": c.title,
        "description": c.description,
        "category": c.category,
        "coverUrl": c.cover_url,
        "duration": c.duration,
        "isPublic": c.is_public,
        "status": c.status,
        "creationMode": c.creation_mode,
        "courseType": c.course_type,
        "targetAudience": c.target_audience,
        "scenario": c.scenario,
    }


def _course_enrollment_to_dict(e: CourseEnrollment) -> dict[str, Any]:
    return {
        "id": str(e.id),
        "courseId": str(e.course_id),
        "instanceId": str(e.instance_id) if e.instance_id else None,
        "userId": str(e.user_id),
        "status": e.status,
        "approvalStatus": e.approval_status,
        "enrolledAt": e.enrolled_at.isoformat() if e.enrolled_at else None,
        "completedAt": e.completed_at.isoformat() if e.completed_at else None,
        "progress": e.progress,
    }


def _chapter_to_dict(c: CourseChapter) -> dict[str, Any]:
    return {
        "id": str(c.id),
        "courseId": str(c.course_id),
        "title": c.title,
        "content": c.content,
        "videoUrl": c.video_url,
        "duration": c.duration,
        "sortOrder": c.sort_order,
        "relatedAssessmentId": str(c.related_assessment_id) if c.related_assessment_id else None,
    }


def _block_to_dict(b: CourseContentBlock) -> dict[str, Any]:
    return {
        "id": str(b.id),
        "chapterId": str(b.chapter_id),
        "blockType": b.block_type,
        "visibility": b.visibility,
        "sortOrder": b.sort_order,
        "payload": b.payload,
    }


# ─── GET /groups ───────────────────────────────────────────────


@router.get("/groups")
async def list_groups(
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict[str, Any]]:
    """guardian-blocked. recruiting 状态团辅, 含我的报名状态."""
    reject_as_param(request, user)
    assert org is not None
    user_uuid = parse_uuid_or_raise(user.id, field="userId")
    org_uuid = parse_uuid_or_raise(org.org_id, field="orgId")

    inst_q = (
        select(GroupInstance)
        .where(
            and_(
                GroupInstance.org_id == org_uuid,
                GroupInstance.status == "recruiting",
            )
        )
        .order_by(desc(GroupInstance.created_at))
    )
    instances = list((await db.execute(inst_q)).scalars().all())
    if not instances:
        return []

    instance_ids = [i.id for i in instances]
    enr_q = select(GroupEnrollment).where(
        or_(*[GroupEnrollment.instance_id == iid for iid in instance_ids])
    )
    all_enrollments = list((await db.execute(enr_q)).scalars().all())

    # scheme map
    scheme_ids = list({i.scheme_id for i in instances if i.scheme_id is not None})
    scheme_map: dict[Any, GroupScheme] = {}
    if scheme_ids:
        s_q = select(GroupScheme).where(or_(*[GroupScheme.id == sid for sid in scheme_ids]))
        for s in (await db.execute(s_q)).scalars().all():
            scheme_map[s.id] = s

    out: list[dict[str, Any]] = []
    for inst in instances:
        inst_enrollments = [e for e in all_enrollments if e.instance_id == inst.id]
        approved = sum(1 for e in inst_enrollments if e.status == "approved")
        my = next((e for e in inst_enrollments if e.user_id == user_uuid), None)
        scheme = scheme_map.get(inst.scheme_id) if inst.scheme_id else None
        d = _instance_to_dict(inst)
        d["approvedCount"] = approved
        d["spotsLeft"] = max(0, inst.capacity - approved) if inst.capacity is not None else None
        d["myEnrollmentStatus"] = my.status if my else None
        d["scheme"] = _scheme_summary(scheme) if scheme else None
        out.append(d)
    return out


# ─── GET /courses ──────────────────────────────────────────────


@router.get("/courses")
async def list_courses(
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict[str, Any]]:
    """guardian-blocked. published, 本机构 OR (公开课且 isPublic=True)."""
    reject_as_param(request, user)
    assert org is not None
    org_uuid = parse_uuid_or_raise(org.org_id, field="orgId")

    q = (
        select(Course)
        .where(
            and_(
                Course.status == "published",
                or_(
                    Course.org_id == org_uuid,
                    and_(Course.org_id.is_(None), Course.is_public.is_(True)),
                ),
            )
        )
        .order_by(desc(Course.created_at))
    )
    rows = list((await db.execute(q)).scalars().all())
    return [_course_to_dict(c) for c in rows]


# ─── GET /my-courses ───────────────────────────────────────────


@router.get("/my-courses")
async def list_my_courses(
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict[str, Any]]:
    """guardian-blocked. self_only: user_id 强校验."""
    reject_as_param(request, user)
    assert org is not None
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    q = (
        select(CourseEnrollment, Course.title, Course.category)
        .outerjoin(Course, Course.id == CourseEnrollment.course_id)
        .where(CourseEnrollment.user_id == user_uuid)
        .order_by(desc(CourseEnrollment.enrolled_at))
    )
    rows = (await db.execute(q)).all()
    out: list[dict[str, Any]] = []
    for e, title, category in rows:
        out.append(
            {
                "enrollment": _course_enrollment_to_dict(e),
                "courseTitle": title,
                "courseCategory": category,
            }
        )
    return out


# ─── GET /courses/{course_id} ──────────────────────────────────


@router.get("/courses/{course_id}")
async def get_course(
    course_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """guardian-blocked. 必须有 enrollment + 课程可见性匹配."""
    reject_as_param(request, user)
    assert org is not None
    user_uuid = parse_uuid_or_raise(user.id, field="userId")
    org_uuid = parse_uuid_or_raise(org.org_id, field="orgId")
    course_uuid = parse_uuid_or_raise(course_id, field="courseId")

    enr_q = (
        select(CourseEnrollment)
        .where(
            and_(
                CourseEnrollment.user_id == user_uuid,
                CourseEnrollment.course_id == course_uuid,
            )
        )
        .limit(1)
    )
    enrollment = (await db.execute(enr_q)).scalar_one_or_none()
    if enrollment is None:
        raise ValidationError("You are not enrolled in this course")

    c_q = (
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
    course = (await db.execute(c_q)).scalar_one_or_none()
    if course is None:
        raise ValidationError("Course not found")

    ch_q = (
        select(CourseChapter)
        .where(CourseChapter.course_id == course_uuid)
        .order_by(CourseChapter.sort_order)
    )
    chapters = list((await db.execute(ch_q)).scalars().all())

    chapter_ids = [c.id for c in chapters]
    blocks: list[CourseContentBlock] = []
    if chapter_ids:
        b_q = (
            select(CourseContentBlock)
            .where(or_(*[CourseContentBlock.chapter_id == cid for cid in chapter_ids]))
            .order_by(CourseContentBlock.sort_order)
        )
        blocks = list((await db.execute(b_q)).scalars().all())
    visible = [b for b in blocks if b.visibility in ("participant", "both")]

    return {
        "enrollment": _course_enrollment_to_dict(enrollment),
        "course": _course_to_dict(course),
        "chapters": [
            {
                **_chapter_to_dict(c),
                "contentBlocks": [_block_to_dict(b) for b in visible if b.chapter_id == c.id],
            }
            for c in chapters
        ],
    }


# ─── GET /my-groups ────────────────────────────────────────────


@router.get("/my-groups")
async def list_my_groups(
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict[str, Any]]:
    """guardian-blocked. self_only."""
    reject_as_param(request, user)
    assert org is not None
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    q = (
        select(GroupEnrollment, GroupInstance.title, GroupInstance.status)
        .outerjoin(GroupInstance, GroupInstance.id == GroupEnrollment.instance_id)
        .where(GroupEnrollment.user_id == user_uuid)
        .order_by(desc(GroupEnrollment.created_at))
    )
    rows = (await db.execute(q)).all()
    out: list[dict[str, Any]] = []
    for e, inst_title, inst_status in rows:
        out.append(
            {
                "enrollment": _enrollment_to_dict(e),
                "instanceTitle": inst_title,
                "instanceStatus": inst_status,
            }
        )
    return out


# ─── GET /groups/{instance_id} ─────────────────────────────────


@router.get("/groups/{instance_id}")
async def get_group(
    instance_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """guardian-blocked. 必须 enrolled + 同 org. 含 sessions + my-attendance."""
    reject_as_param(request, user)
    assert org is not None
    user_uuid = parse_uuid_or_raise(user.id, field="userId")
    org_uuid = parse_uuid_or_raise(org.org_id, field="orgId")
    inst_uuid = parse_uuid_or_raise(instance_id, field="instanceId")

    enr_q = (
        select(GroupEnrollment)
        .where(
            and_(
                GroupEnrollment.instance_id == inst_uuid,
                GroupEnrollment.user_id == user_uuid,
            )
        )
        .limit(1)
    )
    enrollment = (await db.execute(enr_q)).scalar_one_or_none()
    if enrollment is None:
        raise ValidationError("You are not enrolled in this group")

    i_q = (
        select(GroupInstance)
        .where(and_(GroupInstance.id == inst_uuid, GroupInstance.org_id == org_uuid))
        .limit(1)
    )
    instance = (await db.execute(i_q)).scalar_one_or_none()
    if instance is None:
        raise ValidationError("Group instance not found")

    scheme: GroupScheme | None = None
    scheme_sessions: list[GroupSchemeSession] = []
    if instance.scheme_id:
        s_q = select(GroupScheme).where(GroupScheme.id == instance.scheme_id).limit(1)
        scheme = (await db.execute(s_q)).scalar_one_or_none()
        ss_q = select(GroupSchemeSession).where(GroupSchemeSession.scheme_id == instance.scheme_id)
        scheme_sessions = list((await db.execute(ss_q)).scalars().all())

    rec_q = (
        select(GroupSessionRecord)
        .where(GroupSessionRecord.instance_id == inst_uuid)
        .order_by(GroupSessionRecord.session_number)
    )
    records = list((await db.execute(rec_q)).scalars().all())

    attendance_list: list[GroupSessionAttendance] = []
    if records:
        att_q = select(GroupSessionAttendance).where(
            GroupSessionAttendance.enrollment_id == enrollment.id
        )
        attendance_list = list((await db.execute(att_q)).scalars().all())
    att_map = {a.session_record_id: a for a in attendance_list}

    return {
        "enrollment": _enrollment_to_dict(enrollment),
        "instance": _instance_to_dict(instance),
        "scheme": (
            {
                "id": str(scheme.id),
                "title": scheme.title,
                "description": scheme.description,
                "theory": scheme.theory,
                "overallGoal": scheme.overall_goal,
                "targetAudience": scheme.target_audience,
            }
            if scheme
            else None
        ),
        "schemeSessions": [
            {
                "id": str(ss.id),
                "schemeId": str(ss.scheme_id),
                "title": ss.title,
                "goal": ss.goal,
                "duration": ss.duration,
                "sortOrder": ss.sort_order,
            }
            for ss in scheme_sessions
        ],
        "sessionRecords": [
            {
                **_session_record_to_dict(r),
                "myAttendance": _attendance_to_dict(att_map[r.id]) if r.id in att_map else None,
            }
            for r in records
        ],
    }


# ─── POST /groups/{instance_id}/sessions/{session_record_id}/check-in ──


@router.post("/groups/{instance_id}/sessions/{session_record_id}/check-in")
async def check_in_session(
    instance_id: str,
    session_record_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> JSONResponse:
    """guardian-blocked. 自助签到. 重复签到走 update, 否则建新行 (201)."""
    reject_as_param(request, user)
    assert org is not None
    user_uuid = parse_uuid_or_raise(user.id, field="userId")
    inst_uuid = parse_uuid_or_raise(instance_id, field="instanceId")
    sess_uuid = parse_uuid_or_raise(session_record_id, field="sessionRecordId")

    enr_q = (
        select(GroupEnrollment)
        .where(
            and_(
                GroupEnrollment.instance_id == inst_uuid,
                GroupEnrollment.user_id == user_uuid,
            )
        )
        .limit(1)
    )
    enrollment = (await db.execute(enr_q)).scalar_one_or_none()
    if enrollment is None:
        raise ValidationError("Not enrolled in this group")

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
    sess_record = (await db.execute(sess_q)).scalar_one_or_none()
    if sess_record is None:
        raise ValidationError("Session record not found")

    ex_q = (
        select(GroupSessionAttendance)
        .where(
            and_(
                GroupSessionAttendance.session_record_id == sess_uuid,
                GroupSessionAttendance.enrollment_id == enrollment.id,
            )
        )
        .limit(1)
    )
    existing = (await db.execute(ex_q)).scalar_one_or_none()

    if existing is not None:
        existing.status = "present"
        await db.commit()
        return JSONResponse(status_code=status.HTTP_200_OK, content=_attendance_to_dict(existing))

    record = GroupSessionAttendance(
        session_record_id=sess_uuid,
        enrollment_id=enrollment.id,
        status="present",
    )
    db.add(record)
    await db.flush()
    await db.commit()

    await record_audit(
        db=db,
        org_id=org.org_id,
        user_id=user.id,
        action="create",
        resource="group_session_attendance",
        resource_id=str(record.id),
        ip_address=request.client.host if request.client else None,
    )
    return JSONResponse(status_code=status.HTTP_201_CREATED, content=_attendance_to_dict(record))


__all__ = ["router"]
