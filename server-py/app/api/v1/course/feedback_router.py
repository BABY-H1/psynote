"""
Course feedback router — 镜像 ``server/src/modules/course/feedback.routes.ts`` (105 行) +
``feedback.service.ts`` (115 行)。

挂在 ``/api/orgs/{org_id}/course-instances`` prefix。

7 个 endpoint:

  GET    /{instance_id}/feedback-forms                         — 列表 (?chapterId 过滤)
  POST   /{instance_id}/feedback-forms                         — 新建表单 (admin/counselor)
  PATCH  /{instance_id}/feedback-forms/{form_id}               — 更新 (admin/counselor)
  DELETE /{instance_id}/feedback-forms/{form_id}               — 删除 (admin/counselor)
  GET    /{instance_id}/feedback-forms/{form_id}/responses     — 响应列表 (admin/counselor)
  POST   /{instance_id}/feedback/{form_id}/submit              — 学员提交 (任何 staff/学员)
  GET    /{instance_id}/feedback-stats                         — 各 form 响应数 (admin/counselor)

学员 submit 需要先查 enrollment (enrollment.id 用作 fk):
  - 如果当前 user 没有 enrollment → 403 'You are not enrolled in this course instance'
  - 已存在 response → upsert (update); 否则 insert

注: rejectClient hook (Node) 排除了 client legacy role; 但 `submit` 端点应允许任何
有 enrollment 的人调用 — Node 的实现是: rejectClient + 路径里的 enrollment 自查共担。
我们这里也走 _reject_client 在所有端点; 因为 client legacy role 走 portal.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.course.schemas import (
    FeedbackFormCreateRequest,
    FeedbackFormOutput,
    FeedbackFormUpdateRequest,
    FeedbackResponseOutput,
    FeedbackResponseSubmitRequest,
    FeedbackStatsItem,
)
from app.core.database import get_db
from app.db.models.course_enrollments import CourseEnrollment
from app.db.models.course_feedback_forms import CourseFeedbackForm
from app.db.models.course_feedback_responses import CourseFeedbackResponse
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


def _form_to_output(f: CourseFeedbackForm) -> FeedbackFormOutput:
    return FeedbackFormOutput(
        id=str(f.id),
        instance_id=str(f.instance_id),
        chapter_id=str(f.chapter_id) if f.chapter_id else None,
        title=f.title,
        questions=list(f.questions or []),
        is_active=bool(f.is_active),
        created_at=getattr(f, "created_at", None),
    )


# ─── Forms CRUD ──────────────────────────────────────────────────


@router.get(
    "/{instance_id}/feedback-forms",
    response_model=list[FeedbackFormOutput],
)
async def list_feedback_forms(
    org_id: str,
    instance_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    chapter_id: Annotated[str | None, Query(alias="chapterId")] = None,
) -> list[FeedbackFormOutput]:
    """``GET /{instance_id}/feedback-forms`` (镜像 service.ts:5-16)."""
    _reject_client(org)
    instance_uuid = _parse_uuid(instance_id, "instanceId")
    conditions = [CourseFeedbackForm.instance_id == instance_uuid]
    if chapter_id:
        chapter_uuid = _parse_uuid(chapter_id, "chapterId")
        conditions.append(CourseFeedbackForm.chapter_id == chapter_uuid)
    q = (
        select(CourseFeedbackForm)
        .where(and_(*conditions))
        .order_by(desc(CourseFeedbackForm.created_at))
    )
    rows = list((await db.execute(q)).scalars().all())
    return [_form_to_output(f) for f in rows]


@router.post(
    "/{instance_id}/feedback-forms",
    response_model=FeedbackFormOutput,
    status_code=status.HTTP_201_CREATED,
)
async def create_feedback_form(
    org_id: str,
    instance_id: str,
    body: FeedbackFormCreateRequest,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FeedbackFormOutput:
    """``POST /{instance_id}/feedback-forms`` (admin/counselor)."""
    _require_admin_or_counselor(org)
    instance_uuid = _parse_uuid(instance_id, "instanceId")
    chapter_uuid: uuid.UUID | None = None
    if body.chapter_id:
        chapter_uuid = _parse_uuid(body.chapter_id, "chapterId")

    questions: list[Any] = list(body.questions) if body.questions else []
    form = CourseFeedbackForm(
        instance_id=instance_uuid,
        chapter_id=chapter_uuid,
        title=body.title,
        questions=questions,
    )
    db.add(form)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return _form_to_output(form)


@router.patch(
    "/{instance_id}/feedback-forms/{form_id}",
    response_model=FeedbackFormOutput,
)
async def update_feedback_form(
    org_id: str,
    instance_id: str,
    form_id: str,
    body: FeedbackFormUpdateRequest,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FeedbackFormOutput:
    """``PATCH /{instance_id}/feedback-forms/{form_id}`` (admin/counselor)."""
    _require_admin_or_counselor(org)
    form_uuid = _parse_uuid(form_id, "formId")
    q = select(CourseFeedbackForm).where(CourseFeedbackForm.id == form_uuid).limit(1)
    form = (await db.execute(q)).scalar_one_or_none()
    if form is None:
        raise NotFoundError("FeedbackForm", form_id)

    updates = body.model_dump(exclude_unset=True, by_alias=False)
    if "questions" in updates and updates["questions"] is not None:
        form.questions = list(updates["questions"])
        del updates["questions"]
    for field, value in updates.items():
        setattr(form, field, value)
    await db.commit()
    return _form_to_output(form)


@router.delete(
    "/{instance_id}/feedback-forms/{form_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_feedback_form(
    org_id: str,
    instance_id: str,
    form_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """``DELETE /{instance_id}/feedback-forms/{form_id}`` (admin/counselor)."""
    _require_admin_or_counselor(org)
    form_uuid = _parse_uuid(form_id, "formId")
    q = select(CourseFeedbackForm).where(CourseFeedbackForm.id == form_uuid).limit(1)
    form = (await db.execute(q)).scalar_one_or_none()
    if form is None:
        raise NotFoundError("FeedbackForm", form_id)
    await db.delete(form)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ─── Responses ────────────────────────────────────────────────────


@router.get(
    "/{instance_id}/feedback-forms/{form_id}/responses",
    response_model=list[FeedbackResponseOutput],
)
async def list_feedback_responses(
    org_id: str,
    instance_id: str,
    form_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[FeedbackResponseOutput]:
    """``GET .../responses`` (admin/counselor). 镜像 service.ts:89-101."""
    _require_admin_or_counselor(org)
    form_uuid = _parse_uuid(form_id, "formId")
    q = (
        select(CourseFeedbackResponse, User.name, User.email)
        .join(CourseEnrollment, CourseEnrollment.id == CourseFeedbackResponse.enrollment_id)
        .join(User, User.id == CourseEnrollment.user_id)
        .where(CourseFeedbackResponse.form_id == form_uuid)
        .order_by(desc(CourseFeedbackResponse.submitted_at))
    )
    rows = (await db.execute(q)).all()
    return [
        FeedbackResponseOutput(
            id=str(r.id),
            form_id=str(r.form_id),
            enrollment_id=str(r.enrollment_id),
            answers=list(r.answers or []),
            submitted_at=r.submitted_at,
            user_name=user_name,
            user_email=user_email,
        )
        for r, user_name, user_email in rows
    ]


@router.post(
    "/{instance_id}/feedback/{form_id}/submit",
    response_model=FeedbackResponseOutput,
    status_code=status.HTTP_201_CREATED,
)
async def submit_feedback_response(
    org_id: str,
    instance_id: str,
    form_id: str,
    body: FeedbackResponseSubmitRequest,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FeedbackResponseOutput:
    """``POST /{instance_id}/feedback/{form_id}/submit`` 学员提交 (镜像 routes.ts:74-94 + service.ts:56-87).

    必须有 enrollment 才能提交; upsert 形式 (已提交则更新).
    """
    _reject_client(org)
    instance_uuid = _parse_uuid(instance_id, "instanceId")
    form_uuid = _parse_uuid(form_id, "formId")
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

    answers_list: list[Any] = list(body.answers) if body.answers else []
    existing_q = (
        select(CourseFeedbackResponse)
        .where(
            and_(
                CourseFeedbackResponse.form_id == form_uuid,
                CourseFeedbackResponse.enrollment_id == enrollment.id,
            )
        )
        .limit(1)
    )
    existing = (await db.execute(existing_q)).scalar_one_or_none()

    if existing is not None:
        existing.answers = answers_list
        existing.submitted_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(existing)
        return FeedbackResponseOutput(
            id=str(existing.id),
            form_id=str(existing.form_id),
            enrollment_id=str(existing.enrollment_id),
            answers=list(existing.answers or []),
            submitted_at=existing.submitted_at,
        )

    response_row = CourseFeedbackResponse(
        form_id=form_uuid,
        enrollment_id=enrollment.id,
        answers=answers_list,
    )
    db.add(response_row)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return FeedbackResponseOutput(
        id=str(response_row.id),
        form_id=str(response_row.form_id),
        enrollment_id=str(response_row.enrollment_id),
        answers=list(response_row.answers or []),
        submitted_at=response_row.submitted_at,
    )


# ─── Stats ────────────────────────────────────────────────────────


@router.get(
    "/{instance_id}/feedback-stats",
    response_model=list[FeedbackStatsItem],
)
async def feedback_stats(
    org_id: str,
    instance_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[FeedbackStatsItem]:
    """``GET /{instance_id}/feedback-stats`` (admin/counselor). 镜像 service.ts:103-114."""
    _require_admin_or_counselor(org)
    instance_uuid = _parse_uuid(instance_id, "instanceId")
    q = (
        select(
            CourseFeedbackResponse.form_id,
            CourseFeedbackForm.title,
            func.count(CourseFeedbackResponse.id),
        )
        .select_from(CourseFeedbackForm)
        .outerjoin(
            CourseFeedbackResponse,
            CourseFeedbackResponse.form_id == CourseFeedbackForm.id,
        )
        .where(CourseFeedbackForm.instance_id == instance_uuid)
        .group_by(
            CourseFeedbackResponse.form_id,
            CourseFeedbackForm.id,
            CourseFeedbackForm.title,
        )
    )
    rows = (await db.execute(q)).all()
    out: list[FeedbackStatsItem] = []
    for form_id, form_title, count in rows:
        out.append(
            FeedbackStatsItem(
                form_id=str(form_id) if form_id else None,
                form_title=form_title,
                response_count=count or 0,
            )
        )
    return out


__all__ = ["router"]
