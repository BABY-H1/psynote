"""家长公开绑定 (无 auth) router.

镜像 ``server/src/modules/parent-binding/public-parent-binding.routes.ts`` +
``parent-binding.service.ts`` (loadValidToken / bind 流程).

挂载: ``/api/public/parent-bind`` (无 auth, 应靠 rate-limit 保护)

  GET   /{token}  班级 / org 预览 (老师姓名 / 班级名 / 过期时间, 无学生名单)
  POST  /{token}  提交家长信息 + 学生 3 字段, 严格匹配后建 guardian + 关系 + JWT

W0.4 镜像:
  bind() 创建 guardian user 时, **password 已从 body 必填校验**, password_hash 必填.
  不同于历史 W0.4 (默认 NULL 让任意密码通过) — 本端点必填 password ≥ 6 位,
  guarded by ParentBindBody schema + service 层 ValidationError.

学生身份核验 (parent-binding.service.ts:200-235):
  ALL THREE must match:
    1. user.name == studentName
    2. school_student_profiles.student_id == studentNumber
    3. school_student_profiles.parent_phone 末 4 位 == phoneLast4
  用 inner join + class_id scope 限制不能跨班冒认.

Transactional:
  guardian user + org_member(role='client') + client_relationships 单 commit.
  失败 rollback (避免孤儿 guardian user).
"""

from __future__ import annotations

import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.parent_binding.schemas import (
    ParentBindBody,
    ParentBindChild,
    ParentBindResponse,
    ParentBindTokenPreview,
    ParentBindUser,
    ParentRelation,
)
from app.core.database import get_db
from app.core.security import create_access_token, create_refresh_token, hash_password
from app.db.models.class_parent_invite_tokens import ClassParentInviteToken
from app.db.models.client_relationships import ClientRelationship
from app.db.models.org_members import OrgMember
from app.db.models.organizations import Organization
from app.db.models.school_classes import SchoolClass
from app.db.models.school_student_profiles import SchoolStudentProfile
from app.db.models.users import User
from app.lib.errors import NotFoundError, ValidationError
from app.lib.uuid_utils import parse_uuid_or_raise

router = APIRouter()

_VALID_RELATIONS: frozenset[str] = frozenset({"father", "mother", "guardian", "other"})


async def _load_valid_token(
    db: AsyncSession, token: str
) -> tuple[ClassParentInviteToken, str, str, str]:
    """查 token + class + org. 校验有效性. 返回 (token_row, class_name, grade, org_name).

    镜像 parent-binding.service.ts:127-145.
    """
    q = (
        select(
            ClassParentInviteToken,
            SchoolClass.class_name,
            SchoolClass.grade,
            Organization.name,
        )
        .join(SchoolClass, SchoolClass.id == ClassParentInviteToken.class_id)
        .join(Organization, Organization.id == ClassParentInviteToken.org_id)
        .where(ClassParentInviteToken.token == token)
        .limit(1)
    )
    row = (await db.execute(q)).first()
    if row is None:
        raise NotFoundError("邀请链接无效或已撤销")

    token_row, class_name, grade, org_name = row
    if token_row.revoked_at is not None:
        raise ValidationError("邀请链接已被撤销")
    if token_row.expires_at < datetime.now(UTC):
        raise ValidationError("邀请链接已过期")
    return token_row, class_name, grade, org_name


# ─── GET /{token} ───────────────────────────────────────────────


@router.get("/{token}", response_model=ParentBindTokenPreview)
async def get_token_preview(
    token: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ParentBindTokenPreview:
    """预览页 — 老师 / 班级 / 过期时间, 不暴露学生名单 (防爆破)."""
    token_row, class_name, grade, org_name = await _load_valid_token(db, token)
    return ParentBindTokenPreview(
        org_name=org_name,
        class_name=class_name,
        class_grade=grade,
        expires_at=token_row.expires_at.isoformat(),
    )


# ─── POST /{token} ──────────────────────────────────────────────


@router.post("/{token}", status_code=status.HTTP_201_CREATED)
async def bind_parent(
    token: str,
    body: ParentBindBody,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> JSONResponse:
    """提交家长 + 学生信息, 严格 3 字段匹配后绑定 + 签 JWT.

    镜像 parent-binding.service.ts:172-310. Transactional: guardian user +
    org_member + client_relationships 单 commit, 失败 rollback.
    """
    # ── Validate inputs (与 Node service 严格一致) ─────────────
    student_name = (body.student_name or "").strip()
    student_number = (body.student_number or "").strip()
    phone_last4 = (body.phone_last4 or "").strip()
    relation: ParentRelation | None = body.relation
    my_name = (body.my_name or "").strip()
    password = body.password or ""

    if not student_name:
        raise ValidationError("请填写孩子姓名")
    if not student_number:
        raise ValidationError("请填写学号")
    if not re.match(r"^\d{4}$", phone_last4):
        raise ValidationError("请填写您手机号的后 4 位（4 个数字）")
    if relation not in _VALID_RELATIONS:
        raise ValidationError("请选择与孩子的关系")
    if not my_name:
        raise ValidationError("请填写您的姓名")
    if len(password) < 6:
        raise ValidationError("登录密码至少 6 位")

    token_row, _class_name, _grade, _org_name = await _load_valid_token(db, token)
    org_id = token_row.org_id
    class_id = token_row.class_id

    # ── 找匹配学生 (3 字段必须全 match, class scope) ───────────
    # parent-binding.service.ts:200-235
    matches_q = (
        select(
            SchoolStudentProfile.user_id,
            User.name,
            SchoolStudentProfile.student_id,
            SchoolStudentProfile.parent_phone,
        )
        .join(User, User.id == SchoolStudentProfile.user_id)
        .join(
            SchoolClass,
            and_(
                SchoolClass.grade == SchoolStudentProfile.grade,
                SchoolClass.class_name == SchoolStudentProfile.class_name,
                SchoolClass.org_id == SchoolStudentProfile.org_id,
            ),
        )
        .where(
            and_(
                SchoolStudentProfile.org_id == org_id,
                SchoolClass.id == class_id,
                SchoolStudentProfile.student_id == student_number,
                User.name == student_name,
            )
        )
        .limit(2)
    )
    matches = (await db.execute(matches_q)).all()
    if not matches:
        raise ValidationError("信息核对失败，请联系班主任确认孩子姓名/学号")
    if len(matches) > 1:
        # uq_school_students_org_user 应防止此情况, 但保留 defensive 兜底.
        raise ValidationError("信息核对失败：匹配到多名学生，请联系老师")

    student_user_id, matched_student_name, _matched_student_number, parent_phone = matches[0]
    recorded_phone = re.sub(r"\D", "", parent_phone or "")
    if not recorded_phone or recorded_phone[-4:] != phone_last4:
        raise ValidationError("信息核对失败，手机号后 4 位与老师录入的不一致")

    child_user_id: uuid.UUID = student_user_id

    # ── Transactional: guardian user + org_member + relationship ──
    guardian_user: User
    relationship_row: ClientRelationship
    try:
        # guardian user (合成 email — internal domain, 防与现有用户碰撞)
        guardian_email = f"g_{secrets.token_hex(6)}@guardian.internal"
        guardian_user = User(
            email=guardian_email,
            name=my_name,
            password_hash=hash_password(password),
            is_guardian_account=True,
            is_system_admin=False,  # 显式 False — server_default 在 flush 才生效
        )
        db.add(guardian_user)
        await db.flush()

        # 加入 org as 'client' (Node 端写 client; principal_class 由 Phase 接入后派生)
        member = OrgMember(
            org_id=org_id,
            user_id=guardian_user.id,
            role="client",
            status="active",
        )
        db.add(member)
        await db.flush()

        # 检查关系是否已存在 (defensive — 新建 user 不应碰 unique, 但加防呆)
        ex_q = (
            select(ClientRelationship)
            .where(
                and_(
                    ClientRelationship.org_id == org_id,
                    ClientRelationship.holder_user_id == guardian_user.id,
                    ClientRelationship.related_client_user_id == child_user_id,
                )
            )
            .limit(1)
        )
        existing = (await db.execute(ex_q)).scalar_one_or_none()
        if existing is not None:
            relationship_row = existing
        else:
            relationship_row = ClientRelationship(
                org_id=org_id,
                holder_user_id=guardian_user.id,
                related_client_user_id=child_user_id,
                relation=relation,
                status="active",
                bound_via_token_id=token_row.id,
            )
            db.add(relationship_row)
            await db.flush()

        await db.commit()
    except Exception:
        await db.rollback()
        raise

    # ── Mint JWT ────────────────────────────────────────────────
    access_token = create_access_token(
        user_id=str(guardian_user.id),
        email=guardian_user.email,
        is_system_admin=guardian_user.is_system_admin,
    )
    refresh_token = create_refresh_token(user_id=str(guardian_user.id))

    response = ParentBindResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=ParentBindUser(
            id=str(guardian_user.id),
            email=guardian_user.email,
            name=guardian_user.name,
            is_system_admin=guardian_user.is_system_admin,
        ),
        org_id=str(org_id),
        child=ParentBindChild(
            id=str(child_user_id),
            name=matched_student_name,
            relation=relation,
        ),
    )
    _ = parse_uuid_or_raise  # silence unused (kept for future child_id uuid validation)
    _ = timedelta  # silence unused (timedelta available for future expires_in fields)
    _ = Any  # silence unused
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=response.model_dump(by_alias=True),
    )


__all__ = ["router"]
