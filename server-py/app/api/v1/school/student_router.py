"""
School student router — 镜像 ``server/src/modules/school/school-student.routes.ts`` (235 行)。

挂在 ``/api/orgs/{org_id}/school/students`` 前缀下。

4 个 endpoint:
  GET   /              — 列学生 (?grade / ?className / ?search 过滤)
  GET   /stats         — 学生统计 (按 grade)
  POST  /import        — 批量导入学生 (org_admin, max 500)
  PATCH /{student_profile_id} — 更新学生档案 (org_admin / counselor)

Guard: requireOrgType('school').

POST /import 设计:
  - 每条独立 try/except 收集 success/error (与 Node 一致, 单条失败不阻塞其它)
  - 每条建 user (内部邮箱 ``{studentId}@student.internal`` 或随机) + org_member(client) +
    school_student_profile (如不存在)
  - 默认密码 ``psynote123`` (与 Node hard-code 一致), bcrypt hash 一次复用
  - 学生没有真实邮箱 — 与 Node 一致, 用 student_id 派生内部邮箱
"""

from __future__ import annotations

import secrets
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.school.schemas import (
    StudentGradeStatsEntry,
    StudentImportItem,
    StudentImportRequest,
    StudentImportResponse,
    StudentImportResultEntry,
    StudentImportSummary,
    StudentListResponse,
    StudentRow,
    StudentStatsResponse,
    StudentUpdateRequest,
    StudentUpdateResponse,
)
from app.core.database import get_db
from app.core.security import hash_password
from app.db.models.org_members import OrgMember
from app.db.models.school_student_profiles import SchoolStudentProfile
from app.db.models.users import User
from app.lib.errors import ForbiddenError, NotFoundError, ValidationError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()

# 与 Node ``defaultPassword = 'psynote123'`` 一致 (内部默认密码; 学生需提示自助修改)
DEFAULT_STUDENT_PASSWORD = "psynote123"
MAX_IMPORT_BATCH = 500


def _require_school(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.org_type != "school":
        raise ForbiddenError("school feature requires school org type")
    return org


def _require_school_admin(org: OrgContext | None) -> OrgContext:
    school = _require_school(org)
    if school.role != "org_admin":
        raise ForbiddenError("insufficient_role")
    return school


def _require_school_staff(org: OrgContext | None) -> OrgContext:
    """admin or counselor 都可写学生档案 (与 Node ``requireRole('org_admin', 'counselor')`` 等价)."""
    school = _require_school(org)
    if school.role not in ("org_admin", "counselor"):
        raise ForbiddenError("insufficient_role")
    return school


def _student_row(
    p: SchoolStudentProfile,
    user_name: str | None = None,
    user_email: str | None = None,
) -> StudentRow:
    return StudentRow(
        id=str(p.id),
        user_id=str(p.user_id),
        student_id=p.student_id,
        grade=p.grade,
        class_name=p.class_name,
        parent_name=p.parent_name,
        parent_phone=p.parent_phone,
        created_at=getattr(p, "created_at", None),
        user_name=user_name,
        user_email=user_email,
    )


# ─── List Students ───────────────────────────────────────────────


@router.get("/", response_model=StudentListResponse)
async def list_students(
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    grade: Annotated[str | None, Query()] = None,
    class_name: Annotated[str | None, Query(alias="className")] = None,
    search: Annotated[str | None, Query()] = None,
) -> StudentListResponse:
    """列学生 + 客户端过滤. 镜像 school-student.routes.ts:30-65.

    保留 Node 行为: filter 在 Python (内存) 而非 SQL — 与 Node 一致, 与 SQL 端 ORDER BY
    同次取出后过滤 (学生数据量不大, OK).
    """
    school = _require_school(org)
    org_uuid = parse_uuid_or_raise(school.org_id, field="orgId")

    q = (
        select(
            SchoolStudentProfile,
            User.name,
            User.email,
        )
        .outerjoin(User, User.id == SchoolStudentProfile.user_id)
        .where(SchoolStudentProfile.org_id == org_uuid)
        .order_by(SchoolStudentProfile.grade, SchoolStudentProfile.class_name)
    )
    rows = (await db.execute(q)).all()
    students: list[StudentRow] = [_student_row(p, name, email) for p, name, email in rows]

    if grade:
        students = [s for s in students if s.grade == grade]
    if class_name:
        students = [s for s in students if s.class_name == class_name]
    if search:
        ql = search.lower()
        students = [
            s
            for s in students
            if (s.user_name and ql in s.user_name.lower())
            or (s.student_id and ql in s.student_id.lower())
            or (s.parent_name and ql in s.parent_name.lower())
        ]

    return StudentListResponse(students=students)


# ─── Stats ───────────────────────────────────────────────────────


@router.get("/stats", response_model=StudentStatsResponse)
async def get_stats(
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StudentStatsResponse:
    """学生统计 (总数 + 按 grade). 镜像 school-student.routes.ts:68-86."""
    school = _require_school(org)
    org_uuid = parse_uuid_or_raise(school.org_id, field="orgId")

    tq = (
        select(func.count())
        .select_from(SchoolStudentProfile)
        .where(SchoolStudentProfile.org_id == org_uuid)
    )
    total = (await db.execute(tq)).scalar_one() or 0

    gq = (
        select(SchoolStudentProfile.grade, func.count())
        .where(SchoolStudentProfile.org_id == org_uuid)
        .group_by(SchoolStudentProfile.grade)
    )
    g_rows = (await db.execute(gq)).all()
    grades = [StudentGradeStatsEntry(name=row[0] or "未分配", count=int(row[1])) for row in g_rows]
    return StudentStatsResponse(total=int(total), grades=grades)


# ─── Bulk Import ─────────────────────────────────────────────────


def _student_email(stu: StudentImportItem) -> str:
    """生成学生内部邮箱: ``{student_id}@student.internal`` 或随机 8 字符前缀.

    与 Node 一致: 学生无真实邮箱, 走内部域名占位.
    """
    if stu.student_id:
        return f"{stu.student_id}@student.internal"
    # crypto.randomUUID().slice(0, 8) 等价 — Python 用 secrets.token_hex
    return f"{secrets.token_hex(4)}@student.internal"


async def _import_one_student(
    db: AsyncSession,
    *,
    org_uuid: uuid.UUID,
    stu: StudentImportItem,
    password_hash: str,
) -> StudentImportResultEntry:
    """单条 import 的核心. 失败抛, 由外层 catch 转 'error' 状态.

    与 Node 行为一致: 已存在 user/profile → 'existing', 新建 → 'created'.
    """
    email = _student_email(stu)

    # 找已有 user (按内部邮箱)
    uq = select(User).where(User.email == email).limit(1)
    existing_user = (await db.execute(uq)).scalar_one_or_none()
    if existing_user is not None:
        user_id = existing_user.id
    else:
        new_user = User(
            email=email,
            name=stu.name.strip(),
            password_hash=password_hash,
        )
        db.add(new_user)
        await db.flush()
        user_id = new_user.id

    # 加 client 成员 (如未加)
    mq = (
        select(OrgMember.id)
        .where(and_(OrgMember.org_id == org_uuid, OrgMember.user_id == user_id))
        .limit(1)
    )
    existing_member = (await db.execute(mq)).scalar_one_or_none()
    if existing_member is None:
        db.add(
            OrgMember(
                org_id=org_uuid,
                user_id=user_id,
                role="client",
                status="active",
            )
        )

    # 建 student profile (如未建); 已有 → 标 existing
    pq = (
        select(SchoolStudentProfile.id)
        .where(
            and_(
                SchoolStudentProfile.org_id == org_uuid,
                SchoolStudentProfile.user_id == user_id,
            )
        )
        .limit(1)
    )
    existing_profile = (await db.execute(pq)).scalar_one_or_none()
    if existing_profile is not None:
        return StudentImportResultEntry(name=stu.name, status="existing")

    db.add(
        SchoolStudentProfile(
            org_id=org_uuid,
            user_id=user_id,
            student_id=stu.student_id,
            grade=stu.grade,
            class_name=stu.class_name,
            parent_name=stu.parent_name,
            parent_phone=stu.parent_phone,
            parent_email=stu.parent_email,
            entry_method="import",
        )
    )
    return StudentImportResultEntry(name=stu.name, status="created")


@router.post("/import", response_model=StudentImportResponse)
async def import_students(
    body: StudentImportRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StudentImportResponse:
    """批量导入学生 (org_admin only, max 500). 镜像 school-student.routes.ts:89-198.

    每条独立 try/except 收集 success/error — 单条失败不阻塞其它. 默认密码
    ``psynote123`` (与 Node hardcode 一致).
    """
    school = _require_school_admin(org)
    org_uuid = parse_uuid_or_raise(school.org_id, field="orgId")

    if len(body.students) > MAX_IMPORT_BATCH:
        raise ValidationError(f"Maximum {MAX_IMPORT_BATCH} students per import")

    password_hash = hash_password(DEFAULT_STUDENT_PASSWORD)
    results: list[StudentImportResultEntry] = []

    for stu in body.students:
        try:
            result = await _import_one_student(
                db,
                org_uuid=org_uuid,
                stu=stu,
                password_hash=password_hash,
            )
            await db.commit()
            results.append(result)
        except Exception as exc:
            await db.rollback()
            results.append(
                StudentImportResultEntry(
                    name=stu.name or "",
                    status="error",
                    error=str(exc) or exc.__class__.__name__,
                )
            )

    created = sum(1 for r in results if r.status == "created")
    existing = sum(1 for r in results if r.status == "existing")
    errors = sum(1 for r in results if r.status == "error")

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="bulk_import",
        resource="school_student_profiles",
        resource_id=None,
        changes={
            "counts": {
                "old": None,
                "new": {"created": created, "existing": existing, "errors": errors},
            }
        },
        ip_address=request.client.host if request.client else None,
    )
    return StudentImportResponse(
        summary=StudentImportSummary(
            total=len(results),
            created=created,
            existing=existing,
            errors=errors,
        ),
        results=results,
    )


# ─── Update Student Profile ──────────────────────────────────────


@router.patch("/{student_profile_id}", response_model=StudentUpdateResponse)
async def update_student(
    student_profile_id: str,
    body: StudentUpdateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StudentUpdateResponse:
    """更新学生档案 (admin / counselor). 镜像 school-student.routes.ts:201-233."""
    school = _require_school_staff(org)
    org_uuid = parse_uuid_or_raise(school.org_id, field="orgId")
    p_uuid = parse_uuid_or_raise(student_profile_id, field="studentProfileId")

    q = (
        select(SchoolStudentProfile)
        .where(
            and_(
                SchoolStudentProfile.id == p_uuid,
                SchoolStudentProfile.org_id == org_uuid,
            )
        )
        .limit(1)
    )
    p = (await db.execute(q)).scalar_one_or_none()
    if p is None:
        raise NotFoundError("StudentProfile", student_profile_id)

    if body.student_id is not None:
        p.student_id = body.student_id
    if body.grade is not None:
        p.grade = body.grade
    if body.class_name is not None:
        p.class_name = body.class_name
    if body.parent_name is not None:
        p.parent_name = body.parent_name
    if body.parent_phone is not None:
        p.parent_phone = body.parent_phone
    if body.parent_email is not None:
        p.parent_email = body.parent_email

    await db.commit()

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="update",
        resource="school_student_profiles",
        resource_id=str(p_uuid),
        ip_address=request.client.host if request.client else None,
    )
    return StudentUpdateResponse(student=_student_row(p))


__all__ = ["DEFAULT_STUDENT_PASSWORD", "MAX_IMPORT_BATCH", "router"]
