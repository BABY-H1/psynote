"""
Course homework router — 镜像 ``server/src/modules/course/homework.routes.ts`` (123 行) +
``homework.service.ts`` (143 行)。

挂在 ``/api/orgs/{org_id}/course-instances`` prefix。

7 个 endpoint:

  GET    /{instance_id}/homework-defs                              — 列表 (?chapterId 过滤)
  POST   /{instance_id}/homework-defs                              — 新建作业 (admin/counselor)
  PATCH  /{instance_id}/homework-defs/{def_id}                     — 更新 (admin/counselor)
  DELETE /{instance_id}/homework-defs/{def_id}                     — 删除 (admin/counselor)
  GET    /{instance_id}/homework-defs/{def_id}/submissions         — 提交列表 (admin/counselor)
  POST   /{instance_id}/homework/{def_id}/submit                   — 学员提交 (任何 staff/学员 with enrollment)
  PATCH  /{instance_id}/homework/submissions/{sub_id}/review       — 老师批改 (admin/counselor)

学员 submit 需要先查 enrollment (enrollment.id 用作 fk):
  - 如果当前 user 没有 enrollment → 403
  - 已存在 submission → upsert (update); 否则 insert
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy import and_, asc, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.course.schemas import (
    HomeworkDefCreateRequest,
    HomeworkDefOutput,
    HomeworkDefUpdateRequest,
    HomeworkReviewRequest,
    HomeworkSubmissionOutput,
    HomeworkSubmitRequest,
)
from app.core.database import get_db
from app.db.models.course_enrollments import CourseEnrollment
from app.db.models.course_homework_defs import CourseHomeworkDef
from app.db.models.course_homework_submissions import CourseHomeworkSubmission
from app.db.models.users import User
from app.lib.errors import (
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


# ─── 工具 ─────────────────────────────────────────────────────────


def _parse_uuid(value: str, field: str = "id") -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except (ValueError, TypeError) as exc:
        raise ValidationError(f"{field} 不是合法 UUID") from exc


def _require_admin_or_counselor(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.role not in ("org_admin", "counselor"):
        raise ForbiddenError("insufficient_role")
    return org


def _reject_client(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.role == "client":
        raise ForbiddenError("来访者请通过客户端门户访问")
    return org


def _def_to_output(d: CourseHomeworkDef) -> HomeworkDefOutput:
    return HomeworkDefOutput(
        id=str(d.id),
        instance_id=str(d.instance_id),
        chapter_id=str(d.chapter_id) if d.chapter_id else None,
        title=d.title,
        description=d.description,
        question_type=d.question_type or "text",
        options=d.options,
        is_required=bool(d.is_required) if d.is_required is not None else True,
        sort_order=d.sort_order or 0,
        created_at=getattr(d, "created_at", None),
    )


def _sub_to_output(
    s: CourseHomeworkSubmission,
    *,
    user_name: str | None = None,
    user_email: str | None = None,
) -> HomeworkSubmissionOutput:
    return HomeworkSubmissionOutput(
        id=str(s.id),
        homework_def_id=str(s.homework_def_id),
        enrollment_id=str(s.enrollment_id),
        content=s.content,
        selected_options=s.selected_options,
        status=s.status or "submitted",
        review_comment=s.review_comment,
        reviewed_by=str(s.reviewed_by) if s.reviewed_by else None,
        reviewed_at=s.reviewed_at,
        submitted_at=s.submitted_at,
        updated_at=s.updated_at,
        user_name=user_name,
        user_email=user_email,
    )


# ─── Defs CRUD ────────────────────────────────────────────────────


@router.get(
    "/{instance_id}/homework-defs",
    response_model=list[HomeworkDefOutput],
)
async def list_homework_defs(
    org_id: str,
    instance_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    chapter_id: Annotated[str | None, Query(alias="chapterId")] = None,
) -> list[HomeworkDefOutput]:
    """``GET /{instance_id}/homework-defs`` (镜像 service.ts:5-16)."""
    _reject_client(org)
    instance_uuid = _parse_uuid(instance_id, "instanceId")
    conditions = [CourseHomeworkDef.instance_id == instance_uuid]
    if chapter_id:
        chapter_uuid = _parse_uuid(chapter_id, "chapterId")
        conditions.append(CourseHomeworkDef.chapter_id == chapter_uuid)
    q = (
        select(CourseHomeworkDef)
        .where(and_(*conditions))
        .order_by(asc(CourseHomeworkDef.sort_order))
    )
    rows = list((await db.execute(q)).scalars().all())
    return [_def_to_output(d) for d in rows]


@router.post(
    "/{instance_id}/homework-defs",
    response_model=HomeworkDefOutput,
    status_code=status.HTTP_201_CREATED,
)
async def create_homework_def(
    org_id: str,
    instance_id: str,
    body: HomeworkDefCreateRequest,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> HomeworkDefOutput:
    """``POST /{instance_id}/homework-defs`` (admin/counselor)."""
    _require_admin_or_counselor(org)
    instance_uuid = _parse_uuid(instance_id, "instanceId")
    chapter_uuid: uuid.UUID | None = None
    if body.chapter_id:
        chapter_uuid = _parse_uuid(body.chapter_id, "chapterId")

    hwd = CourseHomeworkDef(
        instance_id=instance_uuid,
        chapter_id=chapter_uuid,
        title=body.title,
        description=body.description,
        question_type=body.question_type,
        options=body.options,
        is_required=body.is_required if body.is_required is not None else True,
        sort_order=body.sort_order if body.sort_order is not None else 0,
    )
    db.add(hwd)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return _def_to_output(hwd)


@router.patch(
    "/{instance_id}/homework-defs/{def_id}",
    response_model=HomeworkDefOutput,
)
async def update_homework_def(
    org_id: str,
    instance_id: str,
    def_id: str,
    body: HomeworkDefUpdateRequest,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> HomeworkDefOutput:
    """``PATCH /{instance_id}/homework-defs/{def_id}`` (admin/counselor)."""
    _require_admin_or_counselor(org)
    def_uuid = _parse_uuid(def_id, "defId")
    q = select(CourseHomeworkDef).where(CourseHomeworkDef.id == def_uuid).limit(1)
    hwd = (await db.execute(q)).scalar_one_or_none()
    if hwd is None:
        raise NotFoundError("HomeworkDef", def_id)

    updates = body.model_dump(exclude_unset=True, by_alias=False)
    for field, value in updates.items():
        setattr(hwd, field, value)
    await db.commit()
    return _def_to_output(hwd)


@router.delete(
    "/{instance_id}/homework-defs/{def_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_homework_def(
    org_id: str,
    instance_id: str,
    def_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """``DELETE /{instance_id}/homework-defs/{def_id}`` (admin/counselor)."""
    _require_admin_or_counselor(org)
    def_uuid = _parse_uuid(def_id, "defId")
    q = select(CourseHomeworkDef).where(CourseHomeworkDef.id == def_uuid).limit(1)
    hwd = (await db.execute(q)).scalar_one_or_none()
    if hwd is None:
        raise NotFoundError("HomeworkDef", def_id)
    await db.delete(hwd)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ─── Submissions ─────────────────────────────────────────────────


@router.get(
    "/{instance_id}/homework-defs/{def_id}/submissions",
    response_model=list[HomeworkSubmissionOutput],
)
async def list_submissions(
    org_id: str,
    instance_id: str,
    def_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[HomeworkSubmissionOutput]:
    """``GET .../submissions`` (admin/counselor). 镜像 service.ts:111-123."""
    _require_admin_or_counselor(org)
    def_uuid = _parse_uuid(def_id, "defId")
    q = (
        select(CourseHomeworkSubmission, User.name, User.email)
        .join(CourseEnrollment, CourseEnrollment.id == CourseHomeworkSubmission.enrollment_id)
        .join(User, User.id == CourseEnrollment.user_id)
        .where(CourseHomeworkSubmission.homework_def_id == def_uuid)
        .order_by(desc(CourseHomeworkSubmission.submitted_at))
    )
    rows = (await db.execute(q)).all()
    return [
        _sub_to_output(s, user_name=user_name, user_email=user_email)
        for s, user_name, user_email in rows
    ]


@router.post(
    "/{instance_id}/homework/{def_id}/submit",
    response_model=HomeworkSubmissionOutput,
    status_code=status.HTTP_201_CREATED,
)
async def submit_homework(
    org_id: str,
    instance_id: str,
    def_id: str,
    body: HomeworkSubmitRequest,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> HomeworkSubmissionOutput:
    """``POST /{instance_id}/homework/{def_id}/submit`` 学员提交 (镜像 routes.ts:85-111 + service.ts:71-109).

    必须有 enrollment, upsert 形式.
    """
    _reject_client(org)
    instance_uuid = _parse_uuid(instance_id, "instanceId")
    def_uuid = _parse_uuid(def_id, "defId")
    user_uuid = _parse_uuid(user.id, "userId")

    enroll_q = (
        select(CourseEnrollment)
        .where(
            and_(
                CourseEnrollment.instance_id == instance_uuid,
                CourseEnrollment.user_id == user_uuid,
            )
        )
        .limit(1)
    )
    enrollment = (await db.execute(enroll_q)).scalar_one_or_none()
    if enrollment is None:
        raise ForbiddenError("You are not enrolled in this course instance")

    existing_q = (
        select(CourseHomeworkSubmission)
        .where(
            and_(
                CourseHomeworkSubmission.homework_def_id == def_uuid,
                CourseHomeworkSubmission.enrollment_id == enrollment.id,
            )
        )
        .limit(1)
    )
    existing = (await db.execute(existing_q)).scalar_one_or_none()

    if existing is not None:
        existing.content = body.content
        existing.selected_options = body.selected_options
        existing.status = "submitted"
        existing.updated_at = datetime.now(UTC)
        await db.commit()
        return _sub_to_output(existing)

    submission = CourseHomeworkSubmission(
        homework_def_id=def_uuid,
        enrollment_id=enrollment.id,
        content=body.content,
        selected_options=body.selected_options,
    )
    db.add(submission)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return _sub_to_output(submission)


@router.patch(
    "/{instance_id}/homework/submissions/{sub_id}/review",
    response_model=HomeworkSubmissionOutput,
)
async def review_submission(
    org_id: str,
    instance_id: str,
    sub_id: str,
    body: HomeworkReviewRequest,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> HomeworkSubmissionOutput:
    """``PATCH .../review`` 老师批改 (admin/counselor). 镜像 routes.ts:115-122 + service.ts:125-143."""
    _require_admin_or_counselor(org)
    sub_uuid = _parse_uuid(sub_id, "subId")
    user_uuid = _parse_uuid(user.id, "userId")
    q = select(CourseHomeworkSubmission).where(CourseHomeworkSubmission.id == sub_uuid).limit(1)
    submission = (await db.execute(q)).scalar_one_or_none()
    if submission is None:
        raise NotFoundError("HomeworkSubmission", sub_id)

    submission.status = "reviewed"
    submission.review_comment = body.review_comment
    submission.reviewed_by = user_uuid
    submission.reviewed_at = datetime.now(UTC)
    submission.updated_at = datetime.now(UTC)
    await db.commit()
    return _sub_to_output(submission)


__all__ = ["router"]
