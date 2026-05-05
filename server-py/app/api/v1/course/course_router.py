"""
Course core router — 镜像 ``server/src/modules/course/course.routes.ts`` (252 行) +
``course.service.ts`` (490 行)。

挂在 ``/api/orgs/{org_id}/courses`` prefix。

15 个 endpoint:

  GET    /                                              — 列表 (含 status/courseType/isTemplate/search 过滤)
  GET    /{course_id}                                   — 详情 (含 chapters)
  POST   /                                              — 创建 (admin/counselor only)
  PATCH  /{course_id}                                   — 更新 (admin/counselor only)
  DELETE /{course_id}                                   — 删除 (admin/counselor only)
  POST   /{course_id}/publish                           — 发布 (status=published)
  POST   /{course_id}/archive                           — 归档 (status=archived)
  POST   /{course_id}/clone                             — 克隆 (chapters + lesson_blocks 一并复制)
  POST   /{course_id}/confirm-blueprint                 — 蓝图 sessions → chapters
  GET    /{course_id}/chapters/{chapter_id}/blocks      — 课时 lesson_blocks 列表
  PUT    /{course_id}/chapters/{chapter_id}/blocks      — 整体替换 (delete + insert)
  PATCH  /{course_id}/chapters/{chapter_id}/blocks/{block_id} — 单 block 更新
  POST   /{course_id}/enroll                            — 自助报名 (走 self_enroll)
  POST   /{course_id}/assign                            — counselor 指派课程给来访者
  PATCH  /enrollments/{enrollment_id}/progress         — 更新章节完成状态
  GET    /template-tags                                 — 机构级标签列表
  POST   /template-tags                                 — 新建标签
  DELETE /template-tags/{tag_id}                        — 删除标签

RBAC 守门:
  - 所有写入 (POST / PATCH / DELETE) require ``org_admin`` or ``counselor`` legacy role
  - rejectClient hook (Node 端) — 这里通过 ``_reject_client(org)`` 在每个 endpoint 顶部检查
  - assertLibraryItemOwnedByOrg (Node 端) — 这里通过 ``_assert_course_owned_by_org`` 实现

跨域共享 (Node course.service.ts:16-43):
  - 列表筛选: ``orgId == request.org`` OR (``orgId IS NULL`` AND ``isPublic = true``)
    平台级公开课程 (org_id IS NULL + is_public=true) 对所有 org 可见。
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy import and_, asc, delete, desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.course.schemas import (
    AssignToClientRequest,
    ChapterOutput,
    ConfirmBlueprintRequest,
    CourseCreateRequest,
    CourseDetail,
    CourseProgressRequest,
    CourseSummary,
    CourseUpdateRequest,
    EnrollmentOutput,
    EnrollSelfRequest,
    LessonBlockOutput,
    LessonBlocksUpsertRequest,
    LessonBlockUpdateRequest,
    TemplateTagCreateRequest,
    TemplateTagOutput,
)
from app.core.database import get_db
from app.db.models.course_chapters import CourseChapter
from app.db.models.course_enrollments import CourseEnrollment
from app.db.models.course_lesson_blocks import CourseLessonBlock
from app.db.models.course_template_tags import CourseTemplateTag
from app.db.models.courses import Course
from app.lib.errors import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
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


async def _assert_course_owned_by_org(db: AsyncSession, course_id: uuid.UUID, org_id: str) -> None:
    """``assertLibraryItemOwnedByOrg`` 等价 — 只允许操作本机构的 course (或平台级)。

    与 Node ``server/src/middleware/library-ownership.ts`` 行为一致: org_id IS NULL
    (平台级) 也允许 (admin 能改平台课). 否则必须 org_id 匹配。
    """
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    q = select(Course.org_id).where(Course.id == course_id).limit(1)
    row = (await db.execute(q)).first()
    if row is None:
        raise NotFoundError("Course", str(course_id))
    course_org_id = row[0]
    if course_org_id is not None and course_org_id != org_uuid:
        raise ForbiddenError("课程不属于当前机构")


def _course_to_summary(c: Course) -> CourseSummary:
    """ORM Course → CourseSummary."""
    return CourseSummary(
        id=str(c.id),
        org_id=str(c.org_id) if c.org_id else None,
        title=c.title,
        description=c.description,
        category=c.category,
        cover_url=c.cover_url,
        duration=c.duration,
        is_public=bool(c.is_public),
        status=c.status or "draft",
        creation_mode=c.creation_mode or "manual",
        course_type=c.course_type,
        target_audience=c.target_audience,
        scenario=c.scenario,
        responsible_id=str(c.responsible_id) if c.responsible_id else None,
        is_template=bool(c.is_template),
        source_template_id=str(c.source_template_id) if c.source_template_id else None,
        requirements_config=c.requirements_config or {},
        blueprint_data=c.blueprint_data or {},
        tags=c.tags or [],
        created_by=str(c.created_by) if c.created_by else None,
        created_at=getattr(c, "created_at", None),
        updated_at=getattr(c, "updated_at", None),
    )


def _chapter_to_output(ch: CourseChapter) -> ChapterOutput:
    return ChapterOutput(
        id=str(ch.id),
        course_id=str(ch.course_id),
        title=ch.title,
        content=ch.content,
        video_url=ch.video_url,
        duration=ch.duration,
        sort_order=ch.sort_order or 0,
        related_assessment_id=str(ch.related_assessment_id) if ch.related_assessment_id else None,
        session_goal=ch.session_goal,
        core_concepts=ch.core_concepts,
        interaction_suggestions=ch.interaction_suggestions,
        homework_suggestion=ch.homework_suggestion,
    )


def _course_to_detail(c: Course, chapters: list[CourseChapter]) -> CourseDetail:
    summary = _course_to_summary(c)
    return CourseDetail(
        **summary.model_dump(by_alias=False),
        chapters=[_chapter_to_output(ch) for ch in chapters],
    )


def _block_to_output(b: CourseLessonBlock) -> LessonBlockOutput:
    return LessonBlockOutput(
        id=str(b.id),
        chapter_id=str(b.chapter_id),
        block_type=b.block_type,
        content=b.content,
        sort_order=b.sort_order or 0,
        ai_generated=bool(b.ai_generated),
        last_ai_instruction=b.last_ai_instruction,
        created_at=getattr(b, "created_at", None),
        updated_at=getattr(b, "updated_at", None),
    )


def _enrollment_to_output(e: CourseEnrollment) -> EnrollmentOutput:
    return EnrollmentOutput(
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
    )


# ─── Course CRUD ────────────────────────────────────────────────


@router.get("/", response_model=list[CourseSummary])
async def list_courses(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    course_type: Annotated[str | None, Query(alias="courseType")] = None,
    is_template: Annotated[str | None, Query(alias="isTemplate")] = None,
    search: Annotated[str | None, Query()] = None,
) -> list[CourseSummary]:
    """课程列表 — 镜像 course.routes.ts:19-32 + service.ts:16-43。

    可见性: ``org_id == 当前 org`` OR (``org_id IS NULL AND is_public = true``)
    跨机构平台级公开课程也包含在内 (Phase 1 知识库分发决策, Drizzle 已 port)。
    """
    _reject_client(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")

    q = (
        select(Course)
        .where(
            or_(
                Course.org_id == org_uuid,
                and_(Course.org_id.is_(None), Course.is_public.is_(True)),
            )
        )
        .order_by(desc(Course.updated_at))
    )
    rows = list((await db.execute(q)).scalars().all())

    is_template_bool: bool | None = None
    if is_template == "true":
        is_template_bool = True
    elif is_template == "false":
        is_template_bool = False

    # JS-侧过滤 (与 Node 一致, Drizzle 不支持复杂动态 chaining)
    out: list[CourseSummary] = []
    for c in rows:
        if status_filter and c.status != status_filter:
            continue
        if course_type and c.course_type != course_type:
            continue
        if is_template_bool is not None and bool(c.is_template) != is_template_bool:
            continue
        if search:
            s = search.lower()
            if s not in c.title.lower() and s not in (c.description or "").lower():
                continue
        out.append(_course_to_summary(c))
    return out


@router.get("/template-tags", response_model=list[TemplateTagOutput])
async def list_template_tags(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[TemplateTagOutput]:
    """``GET /template-tags`` 列表 (镜像 course.routes.ts:232-234)。"""
    _reject_client(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    q = (
        select(CourseTemplateTag)
        .where(CourseTemplateTag.org_id == org_uuid)
        .order_by(asc(CourseTemplateTag.name))
    )
    tags = list((await db.execute(q)).scalars().all())
    return [
        TemplateTagOutput(
            id=str(t.id),
            org_id=str(t.org_id),
            name=t.name,
            color=t.color,
            created_at=getattr(t, "created_at", None),
        )
        for t in tags
    ]


@router.post(
    "/template-tags",
    response_model=TemplateTagOutput,
    status_code=status.HTTP_201_CREATED,
)
async def create_template_tag(
    org_id: str,
    body: TemplateTagCreateRequest,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TemplateTagOutput:
    """``POST /template-tags`` 创建标签 (admin/counselor only)。"""
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    tag = CourseTemplateTag(
        org_id=org_uuid,
        name=body.name,
        color=body.color,
    )
    db.add(tag)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return TemplateTagOutput(
        id=str(tag.id),
        org_id=str(tag.org_id),
        name=tag.name,
        color=tag.color,
        created_at=getattr(tag, "created_at", None),
    )


@router.delete("/template-tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template_tag(
    org_id: str,
    tag_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """``DELETE /template-tags/{tag_id}`` (admin/counselor only)."""
    _require_admin_or_counselor(org)
    tag_uuid = parse_uuid_or_raise(tag_id, field="tagId")
    q = select(CourseTemplateTag).where(CourseTemplateTag.id == tag_uuid).limit(1)
    tag = (await db.execute(q)).scalar_one_or_none()
    if tag is None:
        raise NotFoundError("TemplateTag", tag_id)
    await db.execute(delete(CourseTemplateTag).where(CourseTemplateTag.id == tag_uuid))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ─── Enrollment progress (路径不带 course_id) ────────────────────


@router.patch("/enrollments/{enrollment_id}/progress", response_model=EnrollmentOutput)
async def update_progress(
    org_id: str,
    enrollment_id: str,
    body: CourseProgressRequest,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EnrollmentOutput:
    """``PATCH /enrollments/{enrollmentId}/progress`` 镜像 course.routes.ts:223-228 + service.ts:237-260。

    更新 ``progress`` JSONB 中某 chapterId 的 completed 状态。
    """
    # 此端点 path 不含 course_id, 但仍在 /api/orgs/{org_id}/courses 下, 需要走 rejectClient
    _reject_client(org)
    enroll_uuid = parse_uuid_or_raise(enrollment_id, field="enrollmentId")
    q = select(CourseEnrollment).where(CourseEnrollment.id == enroll_uuid).limit(1)
    enrollment = (await db.execute(q)).scalar_one_or_none()
    if enrollment is None:
        raise NotFoundError("CourseEnrollment", enrollment_id)
    progress: dict[str, Any] = dict(enrollment.progress or {})
    progress[body.chapter_id] = body.completed
    enrollment.progress = progress
    await db.commit()
    return _enrollment_to_output(enrollment)


# ─── Course detail / lifecycle / per-course endpoints ────────────


@router.get("/{course_id}", response_model=CourseDetail)
async def get_course(
    org_id: str,
    course_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CourseDetail:
    """``GET /{course_id}`` 详情 (含 chapters, 镜像 service.ts:45-61)."""
    _reject_client(org)
    course_uuid = parse_uuid_or_raise(course_id, field="courseId")
    cq = select(Course).where(Course.id == course_uuid).limit(1)
    course = (await db.execute(cq)).scalar_one_or_none()
    if course is None:
        raise NotFoundError("Course", course_id)
    chq = (
        select(CourseChapter)
        .where(CourseChapter.course_id == course_uuid)
        .order_by(asc(CourseChapter.sort_order))
    )
    chapters = list((await db.execute(chq)).scalars().all())
    return _course_to_detail(course, chapters)


@router.post("/", response_model=CourseDetail, status_code=status.HTTP_201_CREATED)
async def create_course(
    org_id: str,
    body: CourseCreateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CourseDetail:
    """``POST /``创建课程 + 可选 chapters (admin/counselor only). 镜像 routes.ts:39-82 + service.ts:63-139.

    Transactional: course + chapters 一起 insert, 失败 rollback.
    """
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    try:
        course = Course(
            org_id=org_uuid,
            title=body.title,
            description=body.description,
            category=body.category,
            cover_url=body.cover_url,
            duration=body.duration,
            is_public=bool(body.is_public),
            status=body.status or "draft",
            course_type=body.course_type,
            target_audience=body.target_audience,
            scenario=body.scenario,
            responsible_id=user_uuid,
            is_template=bool(body.is_template),
            creation_mode=body.creation_mode or "manual",
            requirements_config=body.requirements_config or {},
            blueprint_data=body.blueprint_data or {},
            tags=body.tags or [],
            created_by=user_uuid,
        )
        db.add(course)
        await db.flush()  # 取 course.id

        chapters_orm: list[CourseChapter] = []
        if body.chapters:
            for idx, ch in enumerate(body.chapters):
                related_uuid: uuid.UUID | None = None
                if ch.related_assessment_id:
                    related_uuid = parse_uuid_or_raise(
                        ch.related_assessment_id, field="relatedAssessmentId"
                    )
                chapter = CourseChapter(
                    course_id=course.id,
                    title=ch.title,
                    content=ch.content,
                    video_url=ch.video_url,
                    duration=ch.duration,
                    sort_order=ch.sort_order if ch.sort_order is not None else idx,
                    related_assessment_id=related_uuid,
                    session_goal=ch.session_goal,
                    core_concepts=ch.core_concepts,
                    interaction_suggestions=ch.interaction_suggestions,
                    homework_suggestion=ch.homework_suggestion,
                )
                db.add(chapter)
                chapters_orm.append(chapter)
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="create",
        resource="courses",
        resource_id=str(course.id),
        ip_address=request.client.host if request.client else None,
    )
    return _course_to_detail(course, chapters_orm)


@router.patch("/{course_id}", response_model=CourseSummary)
async def update_course(
    org_id: str,
    course_id: str,
    body: CourseUpdateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CourseSummary:
    """``PATCH /{course_id}`` 部分更新 (admin/counselor only). 镜像 routes.ts:84-110."""
    _require_admin_or_counselor(org)
    course_uuid = parse_uuid_or_raise(course_id, field="courseId")
    await _assert_course_owned_by_org(db, course_uuid, org_id)

    q = select(Course).where(Course.id == course_uuid).limit(1)
    course = (await db.execute(q)).scalar_one_or_none()
    if course is None:
        raise NotFoundError("Course", course_id)

    updates = body.model_dump(exclude_unset=True, by_alias=False)
    if "responsible_id" in updates:
        rid = updates.pop("responsible_id")
        course.responsible_id = parse_uuid_or_raise(rid, field="responsibleId") if rid else None
    for field, value in updates.items():
        setattr(course, field, value)
    course.updated_at = datetime.now(UTC)
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="courses",
        resource_id=course_id,
        ip_address=request.client.host if request.client else None,
    )
    return _course_to_summary(course)


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course(
    org_id: str,
    course_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """``DELETE /{course_id}`` (admin/counselor only). 镜像 routes.ts:112-120."""
    _require_admin_or_counselor(org)
    course_uuid = parse_uuid_or_raise(course_id, field="courseId")
    await _assert_course_owned_by_org(db, course_uuid, org_id)
    q = select(Course).where(Course.id == course_uuid).limit(1)
    course = (await db.execute(q)).scalar_one_or_none()
    if course is None:
        raise NotFoundError("Course", course_id)
    await db.execute(delete(Course).where(Course.id == course_uuid))
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="delete",
        resource="courses",
        resource_id=course_id,
        ip_address=request.client.host if request.client else None,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ─── Lifecycle (publish / archive / clone) ───────────────────────


async def _set_course_status(db: AsyncSession, course_uuid: uuid.UUID, new_status: str) -> Course:
    """单字段 status update + commit, 镜像 service.ts:277-283."""
    q = select(Course).where(Course.id == course_uuid).limit(1)
    course = (await db.execute(q)).scalar_one_or_none()
    if course is None:
        raise NotFoundError("Course", str(course_uuid))
    course.status = new_status
    course.updated_at = datetime.now(UTC)
    await db.commit()
    return course


@router.post("/{course_id}/publish", response_model=CourseSummary)
async def publish_course(
    org_id: str,
    course_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CourseSummary:
    """``POST /{course_id}/publish`` (admin/counselor)."""
    _require_admin_or_counselor(org)
    course_uuid = parse_uuid_or_raise(course_id, field="courseId")
    course = await _set_course_status(db, course_uuid, "published")
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="courses",
        resource_id=course_id,
        ip_address=request.client.host if request.client else None,
    )
    return _course_to_summary(course)


@router.post("/{course_id}/archive", response_model=CourseSummary)
async def archive_course(
    org_id: str,
    course_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CourseSummary:
    """``POST /{course_id}/archive`` (admin/counselor)."""
    _require_admin_or_counselor(org)
    course_uuid = parse_uuid_or_raise(course_id, field="courseId")
    course = await _set_course_status(db, course_uuid, "archived")
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="courses",
        resource_id=course_id,
        ip_address=request.client.host if request.client else None,
    )
    return _course_to_summary(course)


@router.post(
    "/{course_id}/clone",
    response_model=CourseDetail,
    status_code=status.HTTP_201_CREATED,
)
async def clone_course(
    org_id: str,
    course_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CourseDetail:
    """``POST /{course_id}/clone`` (admin/counselor). 镜像 service.ts:285-348。

    Transactional: 复制课程 + 章节 + 章节的 lesson_blocks 单 commit. 失败 rollback.

    模板派生 (镜像 Node 行为):
      - 新课 ``source_template_id`` 设为 (源是模板时) 源 id, 否则继承源的 source_template_id
      - 新课 ``is_template = false``, ``status = 'draft'``, ``is_public = false``
      - chapters / lesson_blocks 全量复制 (拿到 ID 链接到新 chapter/course)
    """
    _require_admin_or_counselor(org)
    course_uuid = parse_uuid_or_raise(course_id, field="courseId")
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    # 取源课程 + chapters
    sq = select(Course).where(Course.id == course_uuid).limit(1)
    source = (await db.execute(sq)).scalar_one_or_none()
    if source is None:
        raise NotFoundError("Course", course_id)
    chq = (
        select(CourseChapter)
        .where(CourseChapter.course_id == course_uuid)
        .order_by(asc(CourseChapter.sort_order))
    )
    source_chapters = list((await db.execute(chq)).scalars().all())

    try:
        new_course = Course(
            org_id=org_uuid,
            title=f"{source.title}(副本)",
            description=source.description,
            category=source.category,
            cover_url=source.cover_url,
            duration=source.duration,
            is_public=False,
            status="draft",
            course_type=source.course_type,
            target_audience=source.target_audience,
            scenario=source.scenario,
            responsible_id=user_uuid,
            is_template=False,
            source_template_id=(course_uuid if source.is_template else source.source_template_id),
            requirements_config=source.requirements_config or {},
            blueprint_data=source.blueprint_data or {},
            tags=source.tags or [],
            created_by=user_uuid,
        )
        db.add(new_course)
        await db.flush()

        # Phase 5 N+1 修: 一次拿所有 source chapters 的 lesson_blocks (IN(...) + group),
        # 之前是每章节 1 query (N+1).
        blocks_by_chapter: dict[Any, list[CourseLessonBlock]] = {}
        if source_chapters:
            source_chapter_ids = [ch.id for ch in source_chapters]
            lbq = (
                select(CourseLessonBlock)
                .where(CourseLessonBlock.chapter_id.in_(source_chapter_ids))
                .order_by(asc(CourseLessonBlock.sort_order))
            )
            for b in (await db.execute(lbq)).scalars().all():
                blocks_by_chapter.setdefault(b.chapter_id, []).append(b)

        new_chapters: list[CourseChapter] = []
        for ch in source_chapters:
            new_chapter = CourseChapter(
                course_id=new_course.id,
                title=ch.title,
                content=ch.content,
                video_url=ch.video_url,
                duration=ch.duration,
                sort_order=ch.sort_order,
                related_assessment_id=ch.related_assessment_id,
                session_goal=ch.session_goal,
                core_concepts=ch.core_concepts,
                interaction_suggestions=ch.interaction_suggestions,
                homework_suggestion=ch.homework_suggestion,
            )
            db.add(new_chapter)
            await db.flush()  # 取 new_chapter.id 给 lesson_blocks 引用
            new_chapters.append(new_chapter)

            for b in blocks_by_chapter.get(ch.id, []):
                db.add(
                    CourseLessonBlock(
                        chapter_id=new_chapter.id,
                        block_type=b.block_type,
                        content=b.content,
                        sort_order=b.sort_order,
                        ai_generated=b.ai_generated,
                    )
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
        resource="courses",
        resource_id=str(new_course.id),
        ip_address=request.client.host if request.client else None,
    )
    return _course_to_detail(new_course, new_chapters)


# ─── Blueprint → Chapters ─────────────────────────────────────────


@router.post("/{course_id}/confirm-blueprint", response_model=list[ChapterOutput])
async def confirm_blueprint(
    org_id: str,
    course_id: str,
    body: ConfirmBlueprintRequest,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ChapterOutput]:
    """``POST /{course_id}/confirm-blueprint`` 镜像 routes.ts:153-162 + service.ts:465-490。

    删旧 chapters + 按 sessions 重建 + 设 status='content_authoring'. 单 transaction.
    """
    _require_admin_or_counselor(org)
    course_uuid = parse_uuid_or_raise(course_id, field="courseId")

    try:
        await db.execute(delete(CourseChapter).where(CourseChapter.course_id == course_uuid))
        new_chapters: list[CourseChapter] = []
        for idx, s in enumerate(body.sessions):
            ch = CourseChapter(
                course_id=course_uuid,
                title=s.title,
                sort_order=idx,
                session_goal=s.goal,
                core_concepts=s.core_concepts,
                interaction_suggestions=s.interaction_suggestions,
                homework_suggestion=s.homework_suggestion,
            )
            db.add(ch)
            new_chapters.append(ch)
        # 同步 status
        cq = select(Course).where(Course.id == course_uuid).limit(1)
        course = (await db.execute(cq)).scalar_one_or_none()
        if course is None:
            raise NotFoundError("Course", course_id)
        course.status = "content_authoring"
        course.updated_at = datetime.now(UTC)
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return [_chapter_to_output(ch) for ch in new_chapters]


# ─── Lesson Blocks ────────────────────────────────────────────────


@router.get(
    "/{course_id}/chapters/{chapter_id}/blocks",
    response_model=list[LessonBlockOutput],
)
async def list_lesson_blocks(
    org_id: str,
    course_id: str,
    chapter_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[LessonBlockOutput]:
    """``GET /{course_id}/chapters/{chapter_id}/blocks`` 列表."""
    _reject_client(org)
    chapter_uuid = parse_uuid_or_raise(chapter_id, field="chapterId")
    q = (
        select(CourseLessonBlock)
        .where(CourseLessonBlock.chapter_id == chapter_uuid)
        .order_by(asc(CourseLessonBlock.sort_order))
    )
    rows = list((await db.execute(q)).scalars().all())
    return [_block_to_output(b) for b in rows]


@router.put(
    "/{course_id}/chapters/{chapter_id}/blocks",
    response_model=list[LessonBlockOutput],
)
async def upsert_lesson_blocks(
    org_id: str,
    course_id: str,
    chapter_id: str,
    body: LessonBlocksUpsertRequest,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[LessonBlockOutput]:
    """``PUT /{course_id}/chapters/{chapter_id}/blocks`` 镜像 routes.ts:171-179 + service.ts:360-379.

    简单 bulk upsert: 删全部 + 重建.
    """
    _require_admin_or_counselor(org)
    chapter_uuid = parse_uuid_or_raise(chapter_id, field="chapterId")
    try:
        await db.execute(
            delete(CourseLessonBlock).where(CourseLessonBlock.chapter_id == chapter_uuid)
        )
        new_blocks: list[CourseLessonBlock] = []
        for b in body.blocks:
            block = CourseLessonBlock(
                chapter_id=chapter_uuid,
                block_type=b.block_type,
                content=b.content,
                sort_order=b.sort_order,
                ai_generated=bool(b.ai_generated),
                last_ai_instruction=b.last_ai_instruction,
            )
            db.add(block)
            new_blocks.append(block)
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return [_block_to_output(b) for b in new_blocks]


@router.patch(
    "/{course_id}/chapters/{chapter_id}/blocks/{block_id}",
    response_model=LessonBlockOutput,
)
async def update_lesson_block(
    org_id: str,
    course_id: str,
    chapter_id: str,
    block_id: str,
    body: LessonBlockUpdateRequest,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LessonBlockOutput:
    """``PATCH /{course_id}/chapters/{chapter_id}/blocks/{block_id}`` 单 block 更新."""
    _require_admin_or_counselor(org)
    block_uuid = parse_uuid_or_raise(block_id, field="blockId")
    q = select(CourseLessonBlock).where(CourseLessonBlock.id == block_uuid).limit(1)
    block = (await db.execute(q)).scalar_one_or_none()
    if block is None:
        raise NotFoundError("LessonBlock", block_id)

    updates = body.model_dump(exclude_unset=True, by_alias=False)
    for field, value in updates.items():
        setattr(block, field, value)
    block.updated_at = datetime.now(UTC)
    await db.commit()
    return _block_to_output(block)


# ─── Enrollment (self + counselor assign) ─────────────────────────


@router.post(
    "/{course_id}/enroll",
    response_model=EnrollmentOutput,
    status_code=status.HTTP_201_CREATED,
)
async def enroll_self(
    org_id: str,
    course_id: str,
    body: EnrollSelfRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EnrollmentOutput:
    """``POST /{course_id}/enroll`` 自助报名 (镜像 routes.ts:191-203 + service.ts:183-235)."""
    if org is None:
        raise ForbiddenError("org_context_required")
    course_uuid = parse_uuid_or_raise(course_id, field="courseId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    dup_q = (
        select(CourseEnrollment)
        .where(
            and_(
                CourseEnrollment.course_id == course_uuid,
                CourseEnrollment.user_id == user_uuid,
            )
        )
        .limit(1)
    )
    if (await db.execute(dup_q)).scalar_one_or_none() is not None:
        raise ConflictError("User is already enrolled in this course")

    care_uuid: uuid.UUID | None = None
    if body.care_episode_id:
        care_uuid = parse_uuid_or_raise(body.care_episode_id, field="careEpisodeId")
    enrollment = CourseEnrollment(
        course_id=course_uuid,
        user_id=user_uuid,
        care_episode_id=care_uuid,
        enrollment_source="self_enroll",
        approval_status="pending",
    )
    db.add(enrollment)
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="create",
        resource="course_enrollments",
        resource_id=str(enrollment.id),
        ip_address=request.client.host if request.client else None,
    )
    return _enrollment_to_output(enrollment)


@router.post(
    "/{course_id}/assign",
    response_model=EnrollmentOutput,
    status_code=status.HTTP_201_CREATED,
)
async def assign_to_client(
    org_id: str,
    course_id: str,
    body: AssignToClientRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EnrollmentOutput:
    """``POST /{course_id}/assign`` counselor 指派课程给来访者 (镜像 routes.ts:205-221 + service.ts:397-433)."""
    _require_admin_or_counselor(org)
    course_uuid = parse_uuid_or_raise(course_id, field="courseId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")
    client_uuid = parse_uuid_or_raise(body.client_user_id, field="clientUserId")

    dup_q = (
        select(CourseEnrollment)
        .where(
            and_(
                CourseEnrollment.course_id == course_uuid,
                CourseEnrollment.user_id == client_uuid,
            )
        )
        .limit(1)
    )
    if (await db.execute(dup_q)).scalar_one_or_none() is not None:
        raise ConflictError("Client is already enrolled in this course")

    care_uuid: uuid.UUID | None = None
    if body.care_episode_id:
        care_uuid = parse_uuid_or_raise(body.care_episode_id, field="careEpisodeId")
    enrollment = CourseEnrollment(
        course_id=course_uuid,
        user_id=client_uuid,
        care_episode_id=care_uuid,
        assigned_by=user_uuid,
    )
    db.add(enrollment)
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="create",
        resource="course_enrollments",
        resource_id=str(enrollment.id),
        ip_address=request.client.host if request.client else None,
    )
    return _enrollment_to_output(enrollment)


__all__ = ["router"]
