"""
Counseling public router — 镜像 ``server/src/modules/counseling/counseling-public.routes.ts`` (218 行)。

挂在 ``/api/public/counseling`` prefix (⚠ 无 auth)。

2 个 endpoint:

  GET  /{org_slug}/info      获取机构基本信息 (name/logo/themeColor)
  POST /{org_slug}/register  注册成来访者 + 建 org_members(client) + clientProfile

⚠ 安全 (W0.4 / W2.10 audit fixes 镜像):

  1. **orgType 校验**: 仅暴露 settings.orgType == 'counseling' 的机构 — 防止
     跨 orgType 越权 (不该让 school/enterprise 类型的机构走 counseling 注册流)。
     非 counseling org → 404, 不暴露 orgSlug 是否存在。

  2. **W0.4 已存在用户必须验密码** (防接管):
     - existing.password_hash 非空 → 必须 bcrypt.compare 验密码; 错 → 401
     - existing.password_hash 为空 → claim flow: 设新密码 + 加入 org

  3. **W2.10 响应一致性** (防 org-membership 信息泄露):
     - 已存在用户 + 已是该 org 成员 + 密码正确 → 返 201 + 'registered' (与"加入"一致)
     - 不再用 200 + 'already_registered' (会暴露 membership 信息)

  4. **缺字段**: name / email / password 必填; password ≥6 位
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.counseling.schemas import (
    CounselingPublicOrgInfo,
    CounselingPublicRegisterRequest,
    CounselingPublicRegisterResponse,
)
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)
from app.db.models.client_profiles import ClientProfile
from app.db.models.org_members import OrgMember
from app.db.models.organizations import Organization
from app.db.models.users import User
from app.lib.errors import NotFoundError, UnauthorizedError, ValidationError
from app.middleware.rate_limit import limiter

router = APIRouter()


# ─── 工具 ─────────────────────────────────────────────────────────


def _is_counseling_org(settings: dict[str, Any] | None) -> bool:
    """settings.orgType == 'counseling'? (镜像 routes.ts:45-48)"""
    s = settings or {}
    return s.get("orgType") == "counseling"


# ─── GET /{org_slug}/info ──────────────────────────────────────


@router.get("/{org_slug}/info", response_model=CounselingPublicOrgInfo)
async def get_org_info(
    org_slug: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CounselingPublicOrgInfo:
    """``GET /{org_slug}/info`` 获取机构基本信息 (镜像 routes.ts:52-80, 无 auth).

    校验:
      - org 存在 (404)
      - settings.orgType == 'counseling' (404, 防跨类型越权暴露)

    返回: name / slug / logoUrl / themeColor (从 settings.branding 取)。
    """
    q = (
        select(Organization.id, Organization.name, Organization.slug, Organization.settings)
        .where(Organization.slug == org_slug)
        .limit(1)
    )
    row = (await db.execute(q)).first()
    if row is None:
        raise NotFoundError("Organization not found")

    settings: dict[str, Any] = row[3] or {}
    if not _is_counseling_org(settings):
        # 不暴露 orgSlug 是否存在但不是 counseling 类
        raise NotFoundError("Organization not found")

    branding: dict[str, Any] = settings.get("branding") or {}
    return CounselingPublicOrgInfo(
        name=row[1],
        slug=row[2],
        logo_url=branding.get("logoUrl"),
        theme_color=branding.get("themeColor"),
    )


# ─── POST /{org_slug}/register ────────────────────────────────


@router.post(
    "/{org_slug}/register",
    response_model=CounselingPublicRegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("5/minute")  # Phase 5 P0 fix (Fix 8): 防灌水/枚举
async def register_client(
    request: Request,  # slowapi 装饰器需要从 request 取 IP 做 key
    org_slug: str,
    body: CounselingPublicRegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CounselingPublicRegisterResponse:
    """``POST /{org_slug}/register`` 来访者自助注册 (镜像 routes.ts:83-216, 无 auth).

    校验序列:
      1. password ≥ 6 位 (Pydantic min_length=1 + 这里二次校验, 与 Node 一致)
      2. org 存在且是 counseling 类 (404)
      3. existing user (按 email):
         - 有 password_hash + 密码对 → 加入 org (W0.4 防接管)
         - 有 password_hash + 密码错 → 401, 不发 token, 不补建 member
         - 无 password_hash → claim flow: 设新密码 + 加入 org
      4. new email → 建 user + 加入 org

    Transactional 单 try/except: user create / claim + member + profile 一起 commit.

    W2.10 安全: 已是成员 + 密码对 → 201 + 'registered' (不暴露 membership)。
    """
    # 1. 校验 password 长度 (Node 端: <6 → 400)
    if len(body.password) < 6:
        raise ValidationError("密码至少 6 位")
    if not body.name.strip() or not body.phone.strip():
        raise ValidationError("姓名、手机号和密码不能为空")

    # 2. org 校验
    oq = (
        select(Organization.id, Organization.settings).where(Organization.slug == org_slug).limit(1)
    )
    org_row = (await db.execute(oq)).first()
    if org_row is None or not _is_counseling_org(org_row[1]):
        raise NotFoundError("Organization not found")
    org_id_uuid = org_row[0]

    phone_norm = body.phone.strip()
    email_norm = str(body.email).strip().lower() if body.email else None

    # 3. existing user lookup — Phase 5: 按手机号查 (主登录字段)
    uq = (
        select(User.id, User.email, User.is_system_admin, User.password_hash)
        .where(User.phone == phone_norm)
        .limit(1)
    )
    existing_user = (await db.execute(uq)).first()

    is_new_user = False
    user_id_str: str
    user_email: str | None
    user_is_admin: bool
    user_uuid: uuid.UUID

    try:
        if existing_user is not None:
            user_uuid = existing_user[0]
            user_id_str = str(user_uuid)
            user_email = existing_user[1]
            user_is_admin = bool(existing_user[2])
            existing_hash = existing_user[3]

            if existing_hash:
                # 必须 bcrypt.compare (W0.4 防接管)
                if not verify_password(body.password, existing_hash):
                    raise UnauthorizedError("账号或密码错误")
            else:
                # claim flow: 设新密码
                new_hash = hash_password(body.password)
                u_q = select(User).where(User.id == existing_user[0]).limit(1)
                u_row = (await db.execute(u_q)).scalar_one_or_none()
                if u_row is not None:
                    u_row.password_hash = new_hash
                    u_row.name = body.name.strip()
        else:
            # new user — Python 端预生成 UUID, 不依赖 db.flush() 拿 server_default 的回填
            # (与 mock test 一致: db.flush() mock 不会触发 PG gen_random_uuid())
            # Phase 5: phone 必填, email 可选
            user_uuid = uuid.uuid4()
            new_user = User(
                id=user_uuid,
                phone=phone_norm,
                email=email_norm,
                name=body.name.strip(),
                password_hash=hash_password(body.password),
            )
            db.add(new_user)
            await db.flush()
            user_id_str = str(user_uuid)
            user_email = new_user.email
            user_is_admin = bool(new_user.is_system_admin)
            is_new_user = True

        # 4. 是否已是 org 成员? (W2.10: 已是成员也走同一响应)
        mq = (
            select(OrgMember.id)
            .where(
                and_(
                    OrgMember.org_id == org_id_uuid,
                    OrgMember.user_id == user_uuid,
                )
            )
            .limit(1)
        )
        member_row = (await db.execute(mq)).first()

        if member_row is None:
            # 补建 org_members (role='client') + client_profiles
            db.add(
                OrgMember(
                    org_id=org_id_uuid,
                    user_id=user_uuid,
                    role="client",
                    status="active",
                )
            )
            db.add(
                ClientProfile(
                    org_id=org_id_uuid,
                    user_id=user_uuid,
                    phone=body.phone,
                )
            )
        await db.commit()
    except (UnauthorizedError, ValidationError, NotFoundError):
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        raise

    # 5. 签 tokens
    access_token = create_access_token(
        user_id=user_id_str, email=user_email, is_system_admin=user_is_admin
    )
    refresh_token = create_refresh_token(user_id=user_id_str)

    return CounselingPublicRegisterResponse(
        status="registered",
        org_id=str(org_id_uuid),
        user_id=user_id_str,
        is_new_user=is_new_user,
        access_token=access_token,
        refresh_token=refresh_token,
    )


__all__ = ["router"]
