"""
School class router — 镜像 ``server/src/modules/school/school-class.routes.ts`` (138 行)。

挂在 ``/api/orgs/{org_id}/school/classes`` 前缀下。

4 个 endpoint:
  GET    /              — 列出班级 (含按 grade 分组)
  POST   /              — 创建班级 (org_admin)
  PATCH  /{class_id}    — 更新班级 (org_admin)
  DELETE /{class_id}    — 删除班级 (org_admin)

Guard: requireOrgType('school') — 非学校 org 一律 403.
RBAC: GET 任何成员可读; CRUD 必须 org_admin (与 Node ``preHandler: [requireRole('org_admin')]`` 一致).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.school.schemas import (
    ClassCreateRequest,
    ClassCreateResponse,
    ClassListResponse,
    ClassRow,
    ClassUpdateRequest,
    ClassUpdateResponse,
)
from app.core.database import get_db
from app.db.models.school_classes import SchoolClass
from app.db.models.users import User
from app.lib.errors import ForbiddenError, NotFoundError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


def _require_school(org: OrgContext | None) -> OrgContext:
    """``requireOrgType('school')`` 等价 — 非 school org 直接 403."""
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.org_type != "school":
        raise ForbiddenError("school feature requires school org type")
    return org


def _require_school_admin(org: OrgContext | None) -> OrgContext:
    """school org + org_admin 才可写."""
    school = _require_school(org)
    if school.role != "org_admin":
        raise ForbiddenError("insufficient_role")
    return school


def _class_row(c: SchoolClass, teacher_name: str | None = None) -> ClassRow:
    """ORM SchoolClass → ClassRow.

    ``student_count`` 在 DB 端有 ``server_default 0``, 但 Python ORM 构造 (POST 后还没
    refresh) 时 attribute 为 None, fallback 0 与 DB 一致.
    """
    return ClassRow(
        id=str(c.id),
        grade=c.grade,
        class_name=c.class_name,
        homeroom_teacher_id=str(c.homeroom_teacher_id) if c.homeroom_teacher_id else None,
        student_count=c.student_count if c.student_count is not None else 0,
        created_at=getattr(c, "created_at", None),
        teacher_name=teacher_name,
    )


# ─── List Classes ────────────────────────────────────────────────


@router.get("/", response_model=ClassListResponse)
async def list_classes(
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ClassListResponse:
    """列出班级 + 按 grade 分组. 镜像 school-class.routes.ts:28-55."""
    school = _require_school(org)
    org_uuid = parse_uuid_or_raise(school.org_id, field="orgId")

    # left join users 取 teacher_name
    q = (
        select(SchoolClass, User.name)
        .outerjoin(User, User.id == SchoolClass.homeroom_teacher_id)
        .where(SchoolClass.org_id == org_uuid)
        .order_by(SchoolClass.grade, SchoolClass.class_name)
    )
    rows = (await db.execute(q)).all()

    classes: list[ClassRow] = [_class_row(c, t) for c, t in rows]

    grouped: dict[str, list[ClassRow]] = {}
    for cls in classes:
        grouped.setdefault(cls.grade, []).append(cls)

    return ClassListResponse(classes=classes, grouped=grouped)


# ─── Create Class ────────────────────────────────────────────────


@router.post(
    "/",
    response_model=ClassCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_class(
    body: ClassCreateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ClassCreateResponse:
    """创建班级 (org_admin only). 镜像 school-class.routes.ts:58-84."""
    school = _require_school_admin(org)
    org_uuid = parse_uuid_or_raise(school.org_id, field="orgId")

    teacher_uuid = (
        parse_uuid_or_raise(body.homeroom_teacher_id, field="homeroomTeacherId")
        if body.homeroom_teacher_id
        else None
    )

    cls = SchoolClass(
        org_id=org_uuid,
        grade=body.grade.strip(),
        class_name=body.class_name.strip(),
        homeroom_teacher_id=teacher_uuid,
    )
    db.add(cls)
    await db.commit()

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="create",
        resource="school_classes",
        resource_id=str(cls.id),
        ip_address=request.client.host if request.client else None,
    )
    return ClassCreateResponse(**{"class": _class_row(cls)})


# ─── Update Class ────────────────────────────────────────────────


@router.patch("/{class_id}", response_model=ClassUpdateResponse)
async def update_class(
    class_id: str,
    body: ClassUpdateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ClassUpdateResponse:
    """更新班级 (org_admin only). 镜像 school-class.routes.ts:87-118."""
    school = _require_school_admin(org)
    org_uuid = parse_uuid_or_raise(school.org_id, field="orgId")
    c_uuid = parse_uuid_or_raise(class_id, field="classId")

    q = (
        select(SchoolClass)
        .where(and_(SchoolClass.id == c_uuid, SchoolClass.org_id == org_uuid))
        .limit(1)
    )
    cls = (await db.execute(q)).scalar_one_or_none()
    if cls is None:
        raise NotFoundError("Class", class_id)

    if body.grade is not None:
        cls.grade = body.grade.strip()
    if body.class_name is not None:
        cls.class_name = body.class_name.strip()
    if body.homeroom_teacher_id is not None:
        # 显式 None 允许 (清空 teacher); 字段层 ``str | None`` 已表达
        cls.homeroom_teacher_id = (
            parse_uuid_or_raise(body.homeroom_teacher_id, field="homeroomTeacherId")
            if body.homeroom_teacher_id
            else None
        )

    await db.commit()

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="update",
        resource="school_classes",
        resource_id=str(c_uuid),
        ip_address=request.client.host if request.client else None,
    )
    return ClassUpdateResponse(**{"class": _class_row(cls)})


# ─── Delete Class ────────────────────────────────────────────────


@router.delete("/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_class(
    class_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """删除班级 (org_admin only). 镜像 school-class.routes.ts:121-137."""
    school = _require_school_admin(org)
    org_uuid = parse_uuid_or_raise(school.org_id, field="orgId")
    c_uuid = parse_uuid_or_raise(class_id, field="classId")

    q = (
        select(SchoolClass)
        .where(and_(SchoolClass.id == c_uuid, SchoolClass.org_id == org_uuid))
        .limit(1)
    )
    cls = (await db.execute(q)).scalar_one_or_none()
    if cls is None:
        raise NotFoundError("Class", class_id)

    await db.execute(delete(SchoolClass).where(SchoolClass.id == c_uuid))
    await db.commit()

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="delete",
        resource="school_classes",
        resource_id=str(c_uuid),
        ip_address=request.client.host if request.client else None,
    )


__all__ = ["router"]
