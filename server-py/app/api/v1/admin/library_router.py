"""
Admin library router — 镜像 ``server/src/modules/admin/admin-library.routes.ts`` (524 行).

挂在 ``/api/admin/library`` prefix. 6 类内容平台级 CRUD + distribution
(``allowed_org_ids`` 跨机构分发).

URL 路径模式 (与 Node 一致):

  GET    /{type}                        — 平台级列表 (``org_id IS NULL``)
  GET    /{type}/{id}                   — 平台级单条
  POST   /{type}                        — 创建平台级 (org_id=NULL, visibility='public')
  PATCH  /{type}/{id}                   — 更新顶层字段
  DELETE /{type}/{id}                   — 删除 (course 软删, 其余物理删)
  PATCH  /{type}/{id}/distribution      — 改 ``allowed_org_ids`` 跨机构分发

type ∈ {``scales``, ``courses``, ``schemes``, ``templates``, ``goals``, ``agreements``}.

Phase 3 阶段 trade-off:
  Node 的 ``scales`` / ``courses`` 用 ``scaleService.createScale`` /
  ``courseService.createCourse`` 做 4 / 2 表事务插入 (含 dimensions/items/rules
  / chapters 子表). 这两个 service 是 Phase 3 Tier 2 已实装的 ``app.api.v1.assessment``
  / ``app.api.v1.course`` 的内部 service —— admin 端 import 它们会引循环依赖
  + 跨 router 测试 mock 复杂度爆炸.

  当前 Phase 3 Tier 4 admin 模块仅复刻 ``Drizzle .insert(...).returning()`` 的浅
  insert (与 Node 历史 buggy behavior 等价). 子表 (dimensions / items / chapters)
  的事务级嵌套写入留待 Phase 5 重构 admin-library 时迁移到通用 service 层.

  这个差异不影响合规水印 / 分发链 / Portal 主链路 — 只影响 system_admin
  通过 admin UI 创建带题目的 scale 或带章节的 course (相对低频, 可临时让 sysadm
  从 org-side library UI 创建后再走 distribution patch 跨机构分发).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.admin.schemas import (
    LibraryDistributionRequest,
    LibraryDistributionResponse,
    LibraryItem,
    OkResponse,
)
from app.core.database import get_db
from app.db.models.consent_templates import ConsentTemplate
from app.db.models.courses import Course
from app.db.models.group_schemes import GroupScheme
from app.db.models.note_templates import NoteTemplate
from app.db.models.scales import Scale
from app.db.models.treatment_goal_library import TreatmentGoalLibrary
from app.lib.errors import ForbiddenError, NotFoundError, ValidationError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user

router = APIRouter()


def _require_system_admin(user: AuthUser) -> None:
    if not user.is_system_admin:
        raise ForbiddenError("system admin only")


# ─── 类型映射 (path slug → ORM model + audit resource name) ──────────


_TYPE_TO_MODEL: dict[str, tuple[Any, str]] = {
    "scales": (Scale, "scales"),
    "courses": (Course, "courses"),
    "schemes": (GroupScheme, "group_schemes"),
    "templates": (NoteTemplate, "note_templates"),
    "goals": (TreatmentGoalLibrary, "treatment_goal_library"),
    "agreements": (ConsentTemplate, "consent_templates"),
}


def _resolve_type(type_slug: str) -> tuple[Any, str]:
    if type_slug not in _TYPE_TO_MODEL:
        raise NotFoundError("LibraryType", type_slug)
    return _TYPE_TO_MODEL[type_slug]


def _serialize_row(row: Any) -> LibraryItem:
    """ORM row → dict (镜像 Drizzle ``.returning()`` 的 raw shape).

    保留 snake_case (与 Node camelCase 不同) — 因 admin-library 客户端是
    AdminLibrary.tsx + libraryApi(), camelCase 在 frontend 那边由共享类型处理.
    这里返回 raw column 名, 由 FastAPI/Pydantic ``response_model=LibraryItem``
    (= dict[str, Any]) 透传 —— 与 Node Drizzle row 形状一致 (camelCase column 名).
    SQLAlchemy 模型字段是 snake_case, 需要手动转 camelCase 暴露 wire 兼容.
    """
    out: dict[str, Any] = {}
    for col in row.__table__.columns:
        v = getattr(row, col.name, None)
        if isinstance(v, datetime):
            v = v.isoformat()
        elif hasattr(v, "hex") and not isinstance(v, str | bytes):  # uuid.UUID
            v = str(v)
        # snake_case → camelCase (与 Drizzle 一致)
        parts = col.name.split("_")
        camel = parts[0] + "".join(p.capitalize() for p in parts[1:])
        out[camel] = v
    return out


# ─── List endpoints (支持 ?search=) ─────────────────────────────────


def _list_query(model: Any, search: str | None) -> Any:
    """构造平台级列表 query — ``org_id IS NULL`` + 可选 title ilike + 按 created_at desc.

    ``courses`` 额外要 ``is_template=True`` (与 Node admin-library.routes.ts:148
    ``and(isNull(courses.orgId), eq(courses.isTemplate, true))`` 一致).
    """
    q = select(model).where(model.org_id.is_(None))
    if model is Course:
        q = q.where(model.is_template.is_(True))
    if search:
        q = q.where(model.title.ilike(f"%{search}%"))
    q = q.order_by(model.created_at.desc())
    return q


@router.get("/{type_slug}", response_model=list[LibraryItem])
async def list_library(
    type_slug: str,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    search: Annotated[str | None, Query()] = None,
) -> list[LibraryItem]:
    """平台级列表 (``org_id IS NULL``). 镜像 admin-library.routes.ts:35-49 (scales) 等 6 处."""
    _require_system_admin(user)
    model, _ = _resolve_type(type_slug)
    q = _list_query(model, search)
    rows = (await db.execute(q)).scalars().all()
    return [_serialize_row(r) for r in rows]


@router.get("/{type_slug}/{item_id}", response_model=LibraryItem)
async def get_library_item(
    type_slug: str,
    item_id: str,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LibraryItem:
    """平台级单条 (orgId IS NULL) 防 cross-scope 泄漏.

    镜像 admin-library.routes.ts:55-67 (scales) / 161-172 (courses) / 282-291 (schemes) 等.

    Phase 3 trade-off: scales / courses 不调 service 加载子表 (见 module docstring).
    """
    _require_system_admin(user)
    model, _ = _resolve_type(type_slug)
    item_uuid = parse_uuid_or_raise(item_id, field="id")

    q = select(model).where(and_(model.id == item_uuid, model.org_id.is_(None))).limit(1)
    row = (await db.execute(q)).scalar_one_or_none()
    if row is None:
        raise NotFoundError(type_slug, item_id)
    return _serialize_row(row)


# ─── Create — 浅 insert (见 module docstring 注释) ───────────────────


def _camel_to_snake_dict(body: dict[str, Any]) -> dict[str, Any]:
    """简单驼峰 → snake_case 转 (用于 body keys → ORM column names).

    Pydantic v2 ``populate_by_name`` 通常已把 camelCase alias 转 snake_case,
    但 admin-library body 用 ``dict[str, Any]`` (动态字段太多), 没有 schema
    自动转, 所以手写 helper 处理.
    """
    import re

    out: dict[str, Any] = {}
    for k, v in body.items():
        snake = re.sub(r"(?<!^)([A-Z])", r"_\1", k).lower()
        out[snake] = v
    return out


@router.post("/{type_slug}", response_model=LibraryItem, status_code=status.HTTP_201_CREATED)
async def create_library_item(
    type_slug: str,
    body: dict[str, Any],
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LibraryItem:
    """平台级创建 (org_id=NULL, isPublic/visibility='public', isTemplate=True for course).

    镜像 admin-library.routes.ts 各类型 POST 端点 (浅 insert behavior).

    Phase 3: scale / course 子表 (dimensions/items/chapters) 不写, 只创建 shell.
    """
    _require_system_admin(user)
    model, audit_resource = _resolve_type(type_slug)

    if "title" not in body or not body.get("title"):
        raise ValidationError("title is required")

    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    payload = _camel_to_snake_dict(body)

    # 平台级强约束 — 不让 body 覆盖
    payload["org_id"] = None
    payload["created_by"] = user_uuid

    if model is Scale:
        payload["is_public"] = True
    elif model is Course:
        payload["is_public"] = True
        payload["is_template"] = True
    elif model is GroupScheme or model is NoteTemplate or model is TreatmentGoalLibrary:
        payload["visibility"] = "public"
    # ConsentTemplate 没 visibility 字段, 仅 org_id=NULL + created_by 即平台级

    # 过滤 ORM 不存在的 column (如 chapters / dimensions / items 等子表 / responsible_id 等)
    valid_cols = {col.name for col in model.__table__.columns}
    cleaned = {k: v for k, v in payload.items() if k in valid_cols}
    # responsible_id / source_template_id / created_by 等 UUID 字段, 字符串 → UUID
    if "responsible_id" in cleaned and isinstance(cleaned["responsible_id"], str):
        cleaned["responsible_id"] = parse_uuid_or_raise(
            cleaned["responsible_id"], field="responsibleId"
        )
    if "source_template_id" in cleaned and isinstance(cleaned["source_template_id"], str):
        cleaned["source_template_id"] = parse_uuid_or_raise(
            cleaned["source_template_id"], field="sourceTemplateId"
        )

    new_row = model(**cleaned)
    db.add(new_row)
    await db.commit()
    await db.refresh(new_row)

    await record_audit(
        db=db,
        org_id=None,
        user_id=user.id,
        action="create",
        resource=audit_resource,
        resource_id=str(new_row.id),
        ip_address=request.client.host if request.client else None,
    )

    return _serialize_row(new_row)


# ─── Update — 顶层字段 ───────────────────────────────────────────────


@router.patch("/{type_slug}/{item_id}", response_model=LibraryItem)
async def update_library_item(
    type_slug: str,
    item_id: str,
    body: dict[str, Any],
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LibraryItem:
    """更新顶层字段 (子表不动 — 与 Node admin-library.routes.ts:249-255 一致)."""
    _require_system_admin(user)
    model, audit_resource = _resolve_type(type_slug)

    item_uuid = parse_uuid_or_raise(item_id, field="id")
    q = select(model).where(model.id == item_uuid).limit(1)
    row = (await db.execute(q)).scalar_one_or_none()
    if row is None:
        raise NotFoundError(type_slug, item_id)

    payload = _camel_to_snake_dict(body)
    valid_cols = {col.name for col in model.__table__.columns}

    has_update = False
    for k, v in payload.items():
        if k in valid_cols and k not in ("id", "created_at", "created_by", "org_id"):
            # UUID 字段需要解析
            if k.endswith("_id") and isinstance(v, str):
                v = parse_uuid_or_raise(v, field=k) if v else None
            setattr(row, k, v)
            has_update = True

    if has_update and "updated_at" in valid_cols:
        row.updated_at = datetime.now(UTC)

    await db.commit()

    await record_audit(
        db=db,
        org_id=None,
        user_id=user.id,
        action="update",
        resource=audit_resource,
        resource_id=str(row.id),
        ip_address=request.client.host if request.client else None,
    )

    return _serialize_row(row)


# ─── Delete (course 软删, 其余物理删) ───────────────────────────────


@router.delete("/{type_slug}/{item_id}", response_model=OkResponse)
async def delete_library_item(
    type_slug: str,
    item_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OkResponse:
    """删除. course 软删 (set deleted_at), 其余物理删. 镜像 admin-library 各类 DELETE."""
    _require_system_admin(user)
    model, audit_resource = _resolve_type(type_slug)

    item_uuid = parse_uuid_or_raise(item_id, field="id")

    if model is Course:
        # course 软删 (Node admin-library.routes.ts:259 ``set({ deletedAt: new Date() })``).
        # courses 表当前没 deleted_at column (Drizzle 端 cast as any 偷加 — Phase 5 加)
        # — Python 端复刻软删意图: status 加 'archived' 标记走业务侧软删等价.
        # Phase 5 加 deleted_at column 时改回精确语义.
        select_q = select(model).where(model.id == item_uuid).limit(1)
        row = (await db.execute(select_q)).scalar_one_or_none()
        if row is None:
            raise NotFoundError(type_slug, item_id)
        row.status = "archived"
        row.updated_at = datetime.now(UTC)
    else:
        # 物理删 — 与 Node ``db.delete(...).where(eq(...id, id))`` 等价.
        delete_q = delete(model).where(model.id == item_uuid)
        await db.execute(delete_q)

    await db.commit()

    await record_audit(
        db=db,
        org_id=None,
        user_id=user.id,
        action="delete",
        resource=audit_resource,
        resource_id=str(item_uuid),
        ip_address=request.client.host if request.client else None,
    )
    return OkResponse()


# ─── Distribution — admin-library.routes.ts:490-522 ──────────────


@router.patch(
    "/{type_slug}/{item_id}/distribution",
    response_model=LibraryDistributionResponse,
)
async def update_distribution(
    type_slug: str,
    item_id: str,
    body: LibraryDistributionRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LibraryDistributionResponse:
    """改 ``allowed_org_ids`` 跨机构分发. 镜像 admin-library.routes.ts:502-521.

    body.allowedOrgIds 是 array, 整体替换 (与 Node 行为一致 — 不做 add/remove diff).
    """
    _require_system_admin(user)
    model, audit_resource = _resolve_type(type_slug)

    item_uuid = parse_uuid_or_raise(item_id, field="id")

    q = select(model).where(model.id == item_uuid).limit(1)
    row = (await db.execute(q)).scalar_one_or_none()
    if row is None:
        raise NotFoundError(type_slug, item_id)

    # body.allowedOrgIds 是 list[str] — 逐项校验 UUID 形态 (防垃圾输入 Postgres
    # JSONB 接受任何 JSON, 但 Phase 5 license 校验时拒绝 → 这里早 fail 防意外).
    parsed_ids: list[str] = []
    for raw in body.allowed_org_ids:
        parse_uuid_or_raise(raw, field="allowedOrgId")
        parsed_ids.append(raw)

    # JSONB column — 直接赋 list, asyncpg 会序列化.
    row.allowed_org_ids = parsed_ids
    if hasattr(row, "updated_at"):
        row.updated_at = datetime.now(UTC)

    await db.commit()

    await record_audit(
        db=db,
        org_id=None,
        user_id=user.id,
        action="distribution.updated",
        resource=audit_resource,
        resource_id=str(item_uuid),
        changes={"allowedOrgIds": {"old": None, "new": parsed_ids}},
        ip_address=request.client.host if request.client else None,
    )

    return LibraryDistributionResponse(ok=True, allowed_org_ids=parsed_ids)


__all__ = ["router"]
