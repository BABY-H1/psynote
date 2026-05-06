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
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, status
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
from app.lib.phone_utils import is_valid_cn_phone
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.rate_limit import limiter

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
@limiter.limit("10/minute")  # Phase 5 P0 fix (Fix 8): 防 token 重放/暴破
async def bind_parent(
    request: Request,  # slowapi 装饰器需要从 request 取 IP 做 key
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
    # Phase 5: 家长真实手机号 (登录用)
    parent_phone_full = (body.phone or "").strip()

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
    # Phase 5: phone 必填 + 中国大陆格式
    if not is_valid_cn_phone(parent_phone_full):
        raise ValidationError("请填写正确的手机号(中国大陆 11 位)")
    # 业务一致性: 末 4 位必须 == phone_last4 (schema validator 也会拦, 这里二次保护)
    if parent_phone_full[-4:] != phone_last4:
        raise ValidationError("手机号末 4 位与上方填写不一致")

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

    # ── Phase 5 P0 fix (Fix 6): token replay protection ────────────
    # 同 token + 同 phone 多次 POST → 不应每次建 guardian user (数据冗余 + 之前
    # 的 token + relationship 也会被重复挂). 流程:
    #   1. 按 phone 找已有 guardian user (is_guardian_account=True)
    #   2. 如果有: 检查 (org_id, holder=guardian, child) 关系是否已存在
    #      - 已存在 → 复用关系 (token 重放安全)
    #      - 不存在 → 用现有 guardian + 新建关系 (复用 user account)
    #   3. 如果没 guardian user → 新建 (常规路径, 与之前一致)
    existing_guardian_q = (
        select(User)
        .where(
            and_(
                User.phone == parent_phone_full,
                User.is_guardian_account == True,  # noqa: E712 — SQLAlchemy 不支持 'is True'
            )
        )
        .limit(1)
    )
    existing_guardian = (await db.execute(existing_guardian_q)).scalar_one_or_none()

    # ── Transactional: guardian user + org_member + relationship ──
    guardian_user: User
    relationship_row: ClientRelationship
    try:
        if existing_guardian is not None:
            # Fix 6 path A: 复用 guardian user, 不再新建 (避免同手机号 N 个账号).
            guardian_user = existing_guardian
            # 不动 password / name (不让重放 token 改 guardian 信息).

            # 检查 org_member 是否已存在 (复用账户但可能首次进此 org)
            mq = (
                select(OrgMember.id)
                .where(
                    and_(
                        OrgMember.org_id == org_id,
                        OrgMember.user_id == guardian_user.id,
                    )
                )
                .limit(1)
            )
            existing_member = (await db.execute(mq)).scalar_one_or_none()
            if existing_member is None:
                member = OrgMember(
                    org_id=org_id,
                    user_id=guardian_user.id,
                    role="client",
                    status="active",
                )
                db.add(member)
                await db.flush()
        else:
            # Fix 6 path B: 没现有 guardian → 常规建账户 (Phase 5 原行为).
            # phone=家长填的真手机号, email=None (Phase 7+ 短信验证后 phone_verified=true).
            guardian_user = User(
                phone=parent_phone_full,
                email=None,
                name=my_name,
                password_hash=hash_password(password),
                is_guardian_account=True,
                is_system_admin=False,  # 显式 False — server_default 在 flush 才生效
            )
            db.add(guardian_user)
            await db.flush()

            # 加入 org as 'client'
            member = OrgMember(
                org_id=org_id,
                user_id=guardian_user.id,
                role="client",
                status="active",
            )
            db.add(member)
            await db.flush()

        # 检查关系是否已存在 (Fix 6: 同 child 不重复建)
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
