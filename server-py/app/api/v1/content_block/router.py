"""
Content block API router — 镜像
``server/src/modules/content-block/content-block.routes.ts`` (186 行) +
``content-block.service.ts`` (298 行)。

挂在 ``/api/orgs/{org_id}/content-blocks`` 前缀下, 统一覆盖 course chapter
与 group scheme session 两种 parent 的内容块 CRUD (Phase 9α 设计)。

6 个 endpoint:
  GET  /                  — 按 ?parentType + ?parentId 列出 (client filter visibility)
  GET  /batch             — 按 ?parentType + ?parentIds=a,b,c 批量拉
  POST /                  — 创建 (org_admin / counselor)
  PATCH /{block_id}       — 改 payload / visibility / sort_order (org_admin / counselor)
  DELETE /{block_id}      — 删 (org_admin / counselor)
  POST /reorder           — 批量更新 sort_order (org_admin / counselor)

业务逻辑全部 inline (跟 auth 风格一致), 不分 service.py。

注意:
  - parent 必须属于当前 org (assertCourseChapterInOrg / assertGroupSessionInOrg)
  - 平台级 (org_id IS NULL) chapter / scheme 允许只读穿透; 写操作 org 必须匹配
  - Client role 仅可 GET, 写操作走 require_role 拦截
  - Client GET / list 时按 visibility ∈ {participant, both} 过滤 (BUG-012 fix)
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import and_, asc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.content_block.schemas import (
    ContentBlockResponse,
    CreateBlockRequest,
    ReorderBlocksRequest,
    UpdateBlockRequest,
)
from app.core.database import get_db
from app.db.models.course_chapters import CourseChapter
from app.db.models.course_content_blocks import CourseContentBlock
from app.db.models.courses import Course
from app.db.models.group_scheme_sessions import GroupSchemeSession
from app.db.models.group_schemes import GroupScheme
from app.db.models.group_session_blocks import GroupSessionBlock
from app.lib.errors import ForbiddenError, NotFoundError, ValidationError
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


# ─── 辅助: 角色守门 (镜像 middleware/rbac.ts requireRole) ──────────


def _require_staff_role(user: AuthUser, org: OrgContext | None) -> None:
    """
    org_admin / counselor / system_admin 才允许写操作。

    与 Node ``requireRole('org_admin', 'counselor')`` 一致 — Phase 1.4 的
    ``require_action`` 走 PHI 决策器太重, 内容块写操作只要简单 role 校验。
    """
    if user.is_system_admin:
        return
    if org is None or org.role not in ("org_admin", "counselor"):
        raise ForbiddenError(
            "This action requires one of the following roles: org_admin, counselor"
        )


def _require_org_context(org: OrgContext | None, user: AuthUser) -> OrgContext:
    """非 sysadm 必须有 org context (orgContextGuard 等价)。"""
    if org is not None:
        return org
    if user.is_system_admin:
        # sysadm 不会有 org context (path 没解析或 orgs 表查不到), 但写路径
        # 必须有 orgId 作 audit/scope 的载体. 路由层只在路径里有 org_id 时
        # 才会进来 — 所以理论上 sysadm 也能拿到 OrgContext (sysadm 合成 org_admin).
        # 真正没 OrgContext 的 sysadm 调用 = 配置异常, fail closed.
        raise ForbiddenError("org_context_required")
    raise ForbiddenError("org_context_required")


# ─── 辅助: parent 校验 (镜像 service.ts:42-80) ─────────────────────


async def _assert_course_chapter_in_org(
    db: AsyncSession, chapter_id: str, org_id: str
) -> CourseChapter:
    """
    校验 chapter 属于当前 org. 平台级课 (course.org_id IS NULL) 允许只读穿透;
    写操作必须匹配 org_id.

    与 service.ts:46-60 一致: NotFound → 抛, org 不匹配 → Forbidden。
    """
    try:
        chapter_uuid = uuid.UUID(chapter_id)
    except (ValueError, TypeError) as exc:
        raise NotFoundError("CourseChapter", chapter_id) from exc

    q = (
        select(CourseChapter, Course.org_id)
        .join(Course, Course.id == CourseChapter.course_id)
        .where(CourseChapter.id == chapter_uuid)
        .limit(1)
    )
    row = (await db.execute(q)).first()
    if row is None:
        raise NotFoundError("CourseChapter", chapter_id)
    chapter, course_org_id = row
    # 平台级 (org_id IS NULL) 直接放行; 否则必须严格匹配
    if course_org_id is not None and str(course_org_id) != org_id:
        raise ForbiddenError("Chapter belongs to a different organization")
    return chapter


async def _assert_group_session_in_org(
    db: AsyncSession, scheme_session_id: str, org_id: str
) -> GroupSchemeSession:
    """同上 — 校验 group scheme session 属于当前 org (镜像 service.ts:63-80)。"""
    try:
        session_uuid = uuid.UUID(scheme_session_id)
    except (ValueError, TypeError) as exc:
        raise NotFoundError("GroupSchemeSession", scheme_session_id) from exc

    q = (
        select(GroupSchemeSession, GroupScheme.org_id)
        .join(GroupScheme, GroupScheme.id == GroupSchemeSession.scheme_id)
        .where(GroupSchemeSession.id == session_uuid)
        .limit(1)
    )
    row = (await db.execute(q)).first()
    if row is None:
        raise NotFoundError("GroupSchemeSession", scheme_session_id)
    session, scheme_org_id = row
    if scheme_org_id is not None and str(scheme_org_id) != org_id:
        raise ForbiddenError("Session belongs to a different organization")
    return session


# ─── 辅助: row → response shape ──────────────────────────────────


def _course_block_to_response(block: CourseContentBlock) -> ContentBlockResponse:
    """CourseContentBlock ORM → 统一响应 shape (chapter_id 非 null)。"""
    return ContentBlockResponse(
        id=str(block.id),
        chapter_id=str(block.chapter_id),
        scheme_session_id=None,
        block_type=block.block_type,
        visibility=block.visibility,
        sort_order=block.sort_order,
        payload=block.payload or {},
        created_by=str(block.created_by) if block.created_by else None,
        created_at=block.created_at.isoformat() if getattr(block, "created_at", None) else None,
        updated_at=block.updated_at.isoformat() if getattr(block, "updated_at", None) else None,
    )


def _group_block_to_response(block: GroupSessionBlock) -> ContentBlockResponse:
    """GroupSessionBlock ORM → 统一响应 shape (scheme_session_id 非 null)。"""
    return ContentBlockResponse(
        id=str(block.id),
        chapter_id=None,
        scheme_session_id=str(block.scheme_session_id),
        block_type=block.block_type,
        visibility=block.visibility,
        sort_order=block.sort_order,
        payload=block.payload or {},
        created_by=str(block.created_by) if block.created_by else None,
        created_at=block.created_at.isoformat() if getattr(block, "created_at", None) else None,
        updated_at=block.updated_at.isoformat() if getattr(block, "updated_at", None) else None,
    )


def _filter_for_client(
    blocks: list[ContentBlockResponse], is_client: bool
) -> list[ContentBlockResponse]:
    """
    Client role 只能看 visibility ∈ {participant, both} (BUG-012 fix, 镜像
    routes.ts:48-49 与 service.ts:filterByRole)。staff 看全部。
    """
    if not is_client:
        return blocks
    return [b for b in blocks if b.visibility in ("participant", "both")]


# ─── GET / 列表 (镜像 routes.ts:36-52) ───────────────────────────


@router.get("/", response_model=list[ContentBlockResponse])
async def list_blocks(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    parent_type: Annotated[str | None, Query(alias="parentType")] = None,
    parent_id: Annotated[str | None, Query(alias="parentId")] = None,
) -> list[ContentBlockResponse]:
    """按 parent (course chapter 或 group scheme session) 列出内容块。

    Client 只见 visibility ∈ {participant, both} (facilitator-only 不暴露)。
    """
    if parent_type not in ("course", "group"):
        raise ValidationError("parentType must be course or group")
    if not parent_id:
        raise ValidationError("parentId is required")

    org_ctx = _require_org_context(org, user)
    is_client = (org_ctx.role == "client") if org is not None else False

    if parent_type == "course":
        await _assert_course_chapter_in_org(db, parent_id, org_ctx.org_id)
        try:
            chapter_uuid = uuid.UUID(parent_id)
        except (ValueError, TypeError) as exc:
            raise NotFoundError("CourseChapter", parent_id) from exc
        q = (
            select(CourseContentBlock)
            .where(CourseContentBlock.chapter_id == chapter_uuid)
            .order_by(asc(CourseContentBlock.sort_order))
        )
        course_blocks = (await db.execute(q)).scalars().all()
        all_blocks = [_course_block_to_response(b) for b in course_blocks]
    else:
        await _assert_group_session_in_org(db, parent_id, org_ctx.org_id)
        try:
            session_uuid = uuid.UUID(parent_id)
        except (ValueError, TypeError) as exc:
            raise NotFoundError("GroupSchemeSession", parent_id) from exc
        gq = (
            select(GroupSessionBlock)
            .where(GroupSessionBlock.scheme_session_id == session_uuid)
            .order_by(asc(GroupSessionBlock.sort_order))
        )
        group_blocks = (await db.execute(gq)).scalars().all()
        all_blocks = [_group_block_to_response(b) for b in group_blocks]

    return _filter_for_client(all_blocks, is_client)


# ─── GET /batch 批量 (镜像 routes.ts:58-71) ──────────────────────


@router.get("/batch", response_model=list[ContentBlockResponse])
async def batch_list_blocks(
    db: Annotated[AsyncSession, Depends(get_db)],
    parent_type: Annotated[str | None, Query(alias="parentType")] = None,
    parent_ids: Annotated[str | None, Query(alias="parentIds")] = None,
) -> list[ContentBlockResponse]:
    """
    批量按 parent_ids 列表拉取, 用于 CourseDetail 一次性 hydrate 全课, 防 N+1。

    Node 端没做 org 校验 (服务端 trust 一组 parent ids 由前端按已显示视图给出);
    此处保持一致, 不重做 per-id org 校验 (避免 N×SELECT 抖)。
    """
    if parent_type not in ("course", "group"):
        raise ValidationError("parentType must be course or group")

    raw_ids = (parent_ids or "").split(",")
    ids = [s.strip() for s in raw_ids if s.strip()]
    if not ids:
        return []

    # 解析每个 ID 为 UUID; 任何非法直接 400
    try:
        uuid_ids = [uuid.UUID(s) for s in ids]
    except (ValueError, TypeError) as exc:
        raise ValidationError("parentIds contains an invalid UUID") from exc

    if parent_type == "course":
        cq = (
            select(CourseContentBlock)
            .where(CourseContentBlock.chapter_id.in_(uuid_ids))
            .order_by(asc(CourseContentBlock.sort_order))
        )
        course_rows = (await db.execute(cq)).scalars().all()
        return [_course_block_to_response(b) for b in course_rows]

    gq = (
        select(GroupSessionBlock)
        .where(GroupSessionBlock.scheme_session_id.in_(uuid_ids))
        .order_by(asc(GroupSessionBlock.sort_order))
    )
    group_rows = (await db.execute(gq)).scalars().all()
    return [_group_block_to_response(b) for b in group_rows]


# ─── POST / 创建 (镜像 routes.ts:79-109 + service.ts:138-172) ─────


@router.post("/", response_model=ContentBlockResponse, status_code=status.HTTP_201_CREATED)
async def create_block(
    body: CreateBlockRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
) -> ContentBlockResponse:
    """创建一个内容块。需 org_admin / counselor / system_admin。

    visibility 默认: course → 'participant', group → 'both' (与 Node 一致)。
    """
    org_ctx = _require_org_context(org, user)
    _require_staff_role(user, org)

    # 默认 visibility (镜像 service.ts:140)
    visibility = body.visibility or ("participant" if body.parent_type == "course" else "both")
    sort_order = body.sort_order if body.sort_order is not None else 0
    payload = body.payload if body.payload is not None else {}

    try:
        created_by_uuid = uuid.UUID(user.id)
    except (ValueError, TypeError) as exc:
        raise ValidationError("Invalid user id") from exc

    if body.parent_type == "course":
        await _assert_course_chapter_in_org(db, body.parent_id, org_ctx.org_id)
        try:
            chapter_uuid = uuid.UUID(body.parent_id)
        except (ValueError, TypeError) as exc:
            raise ValidationError("Invalid parentId") from exc
        course_row = CourseContentBlock(
            chapter_id=chapter_uuid,
            block_type=body.block_type,
            visibility=visibility,
            sort_order=sort_order,
            payload=payload,
            created_by=created_by_uuid,
        )
        db.add(course_row)
        await db.commit()
        await db.refresh(course_row)
        new_id_str = str(course_row.id)
        result = _course_block_to_response(course_row)
    else:
        await _assert_group_session_in_org(db, body.parent_id, org_ctx.org_id)
        try:
            session_uuid = uuid.UUID(body.parent_id)
        except (ValueError, TypeError) as exc:
            raise ValidationError("Invalid parentId") from exc
        group_row = GroupSessionBlock(
            scheme_session_id=session_uuid,
            block_type=body.block_type,
            visibility=visibility,
            sort_order=sort_order,
            payload=payload,
            created_by=created_by_uuid,
        )
        db.add(group_row)
        await db.commit()
        await db.refresh(group_row)
        new_id_str = str(group_row.id)
        result = _group_block_to_response(group_row)

    await record_audit(
        db=db,
        org_id=org_ctx.org_id,
        user_id=user.id,
        action="create",
        resource="content_blocks",
        resource_id=new_id_str,
        ip_address=request.client.host if request.client else None,
    )
    return result


# ─── PATCH /{block_id} 更新 (镜像 routes.ts:117-140 + service.ts:185-223) ──


@router.patch("/{block_id}", response_model=ContentBlockResponse)
async def update_block(
    block_id: str,
    body: UpdateBlockRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    parent_type: Annotated[str | None, Query(alias="parentType")] = None,
) -> ContentBlockResponse:
    """更新内容块 (org_admin / counselor / system_admin)。

    parent_type 必须通过 query 传 — 因为同 block_id 可能落 course 或 group 两表之一。
    """
    org_ctx = _require_org_context(org, user)
    _require_staff_role(user, org)

    if parent_type not in ("course", "group"):
        raise ValidationError("parentType query param must be course or group")

    try:
        block_uuid = uuid.UUID(block_id)
    except (ValueError, TypeError) as exc:
        raise NotFoundError(
            "CourseContentBlock" if parent_type == "course" else "GroupSessionBlock", block_id
        ) from exc

    if parent_type == "course":
        existing_q = select(CourseContentBlock).where(CourseContentBlock.id == block_uuid).limit(1)
        existing_course = (await db.execute(existing_q)).scalar_one_or_none()
        if existing_course is None:
            raise NotFoundError("CourseContentBlock", block_id)
        await _assert_course_chapter_in_org(db, str(existing_course.chapter_id), org_ctx.org_id)
        if body.payload is not None:
            existing_course.payload = body.payload
        if body.visibility is not None:
            existing_course.visibility = body.visibility
        if body.sort_order is not None:
            existing_course.sort_order = body.sort_order
        existing_course.updated_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(existing_course)
        result = _course_block_to_response(existing_course)
    else:
        existing_gq = select(GroupSessionBlock).where(GroupSessionBlock.id == block_uuid).limit(1)
        existing_group = (await db.execute(existing_gq)).scalar_one_or_none()
        if existing_group is None:
            raise NotFoundError("GroupSessionBlock", block_id)
        await _assert_group_session_in_org(
            db, str(existing_group.scheme_session_id), org_ctx.org_id
        )
        if body.payload is not None:
            existing_group.payload = body.payload
        if body.visibility is not None:
            existing_group.visibility = body.visibility
        if body.sort_order is not None:
            existing_group.sort_order = body.sort_order
        existing_group.updated_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(existing_group)
        result = _group_block_to_response(existing_group)

    await record_audit(
        db=db,
        org_id=org_ctx.org_id,
        user_id=user.id,
        action="update",
        resource="content_blocks",
        resource_id=block_id,
        ip_address=request.client.host if request.client else None,
    )
    return result


# ─── DELETE /{block_id} 删除 (镜像 routes.ts:145-156 + service.ts:227-247) ──


@router.delete("/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_block(
    block_id: str,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    parent_type: Annotated[str | None, Query(alias="parentType")] = None,
) -> None:
    """删除内容块。need org_admin / counselor / system_admin + parent_type query。"""
    org_ctx = _require_org_context(org, user)
    _require_staff_role(user, org)

    if parent_type not in ("course", "group"):
        raise ValidationError("parentType query param must be course or group")

    try:
        block_uuid = uuid.UUID(block_id)
    except (ValueError, TypeError) as exc:
        raise NotFoundError(
            "CourseContentBlock" if parent_type == "course" else "GroupSessionBlock", block_id
        ) from exc

    if parent_type == "course":
        existing_q = select(CourseContentBlock).where(CourseContentBlock.id == block_uuid).limit(1)
        existing_course = (await db.execute(existing_q)).scalar_one_or_none()
        if existing_course is None:
            raise NotFoundError("CourseContentBlock", block_id)
        await _assert_course_chapter_in_org(db, str(existing_course.chapter_id), org_ctx.org_id)
        await db.delete(existing_course)
        await db.commit()
    else:
        existing_gq = select(GroupSessionBlock).where(GroupSessionBlock.id == block_uuid).limit(1)
        existing_group = (await db.execute(existing_gq)).scalar_one_or_none()
        if existing_group is None:
            raise NotFoundError("GroupSessionBlock", block_id)
        await _assert_group_session_in_org(
            db, str(existing_group.scheme_session_id), org_ctx.org_id
        )
        await db.delete(existing_group)
        await db.commit()

    await record_audit(
        db=db,
        org_id=org_ctx.org_id,
        user_id=user.id,
        action="delete",
        resource="content_blocks",
        resource_id=block_id,
        ip_address=request.client.host if request.client else None,
    )


# ─── POST /reorder 批量排序 (镜像 routes.ts:164-185 + service.ts:251-283) ──


@router.post("/reorder", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_blocks(
    body: ReorderBlocksRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
) -> None:
    """
    批量更新 sort_order — orderedIds 列表的索引即新 sort_order。

    每行用 (block_id + parent_id) 双条件 update, 防意外打到别 parent 的同 id 块
    (镜像 service.ts:264-268 / 277-281 的 and(eq id, eq parent))。
    """
    org_ctx = _require_org_context(org, user)
    _require_staff_role(user, org)

    if body.parent_type == "course":
        await _assert_course_chapter_in_org(db, body.parent_id, org_ctx.org_id)
        try:
            parent_uuid = uuid.UUID(body.parent_id)
        except (ValueError, TypeError) as exc:
            raise ValidationError("Invalid parentId") from exc
        for i, oid in enumerate(body.ordered_ids):
            try:
                oid_uuid = uuid.UUID(oid)
            except (ValueError, TypeError) as exc:
                raise ValidationError(f"orderedIds[{i}] is not a valid UUID") from exc
            row_q = select(CourseContentBlock).where(
                and_(
                    CourseContentBlock.id == oid_uuid,
                    CourseContentBlock.chapter_id == parent_uuid,
                )
            )
            course_row = (await db.execute(row_q)).scalar_one_or_none()
            if course_row is not None:
                course_row.sort_order = i
                course_row.updated_at = datetime.now(UTC)
        await db.commit()
    else:
        await _assert_group_session_in_org(db, body.parent_id, org_ctx.org_id)
        try:
            parent_uuid = uuid.UUID(body.parent_id)
        except (ValueError, TypeError) as exc:
            raise ValidationError("Invalid parentId") from exc
        for i, oid in enumerate(body.ordered_ids):
            try:
                oid_uuid = uuid.UUID(oid)
            except (ValueError, TypeError) as exc:
                raise ValidationError(f"orderedIds[{i}] is not a valid UUID") from exc
            row_gq = select(GroupSessionBlock).where(
                and_(
                    GroupSessionBlock.id == oid_uuid,
                    GroupSessionBlock.scheme_session_id == parent_uuid,
                )
            )
            group_row = (await db.execute(row_gq)).scalar_one_or_none()
            if group_row is not None:
                group_row.sort_order = i
                group_row.updated_at = datetime.now(UTC)
        await db.commit()


__all__: list[str] = ["router"]
