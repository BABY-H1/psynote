"""
EAP Public router — 镜像 ``server/src/modules/eap/eap-public.routes.ts`` (200 行)。

挂在 ``/api/public/eap`` 前缀下 (**完全无 auth**, 用于员工自助注册).

2 个 endpoint:
  GET  /{org_slug}/info       — 企业 EAP 主页基本信息 (logo / theme / departments)
  POST /{org_slug}/register   — 员工自助注册 (transactional)

⚠ W0.4 安全审计 (2026-05-03): same takeover-prevention pattern as counseling-public.
  邮箱已是 user 时:
    - 有 password_hash → bcrypt 验密码; 错 → 401, 不附加成员关系
    - 无 password_hash → claim 流, 设密码 + 加入
  防止任意 user row 被附加到攻击者的 org 作 client (无 ownership 证明).

⚠ W2.10 (security audit 2026-05-03): 已是成员 + 密码正确 → 与"加入"分支响应一致
  (status='registered'), 不暴露 org-membership 状态 (防 email enumeration).

⚠ Transactional: 单 try/except + rollback. 任何 DB 错滚回 (绝不留半截 user / member).

⚠ password_hash=None (W0.4 镜像): 新建 user 时 ``password_hash`` 设为真实 hash, 不是
  fake UUID. 这是与 ``counseling-public`` 一致的 password hashing 规则. (这里我们走真
  hash, 因为 register 给了 password 字段; 与 group-public 那种 name-only 不同.)
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.eap.schemas import (
    PublicDepartmentEntry,
    PublicOrgInfoResponse,
    PublicRegisterRequest,
    PublicRegisterResponse,
)
from app.core.database import get_db
from app.core.security import hash_password, verify_password
from app.db.models.eap_employee_profiles import EAPEmployeeProfile
from app.db.models.org_members import OrgMember
from app.db.models.organizations import Organization
from app.db.models.users import User
from app.lib.errors import NotFoundError, UnauthorizedError, ValidationError
from app.middleware.audit import record_audit
from app.middleware.rate_limit import limiter
from app.shared.tier import has_feature, plan_to_tier

router = APIRouter()


def _resolve_org_tier(org: Organization) -> str:
    """``resolveOrgTier`` 等价 — 镜像 eap-public.routes.ts:24-30.

    Phase 1.6 license JWT 验证暂未 port (见 middleware/org_context.py 注释),
    回落到 plan_to_tier(plan). 与 Node 行为相同 (license_key 无效时也 fallback).
    """
    # Phase 1.6 license JWT verify 没 port — 一律走 plan_to_tier
    _ = org.license_key
    return plan_to_tier(org.plan)


# ─── GET /{org_slug}/info ────────────────────────────────────────


@router.get("/{org_slug}/info", response_model=PublicOrgInfoResponse)
async def get_eap_org_info(
    org_slug: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PublicOrgInfoResponse:
    """企业 EAP 主页基本信息. 镜像 eap-public.routes.ts:36-76.

    要求 org 有 'eap' feature, 否则统一 404 (防 enumeration).
    """
    q = select(Organization).where(Organization.slug == org_slug).limit(1)
    org = (await db.execute(q)).scalar_one_or_none()
    if org is None:
        raise NotFoundError("Organization", org_slug)

    tier = _resolve_org_tier(org)
    if not has_feature(tier, "eap", org_type=(org.settings or {}).get("orgType")):
        # 统一 404 防 enumeration (即非 enterprise org 也走 not found)
        raise NotFoundError("Organization", org_slug)

    settings: dict[str, Any] = org.settings or {}
    eap_config: dict[str, Any] = settings.get("eapConfig") or {}
    branding: dict[str, Any] = settings.get("branding") or {}

    departments = [
        PublicDepartmentEntry(id=d.get("id", ""), name=d.get("name", ""))
        for d in (eap_config.get("departments") or [])
    ]

    return PublicOrgInfoResponse(
        name=org.name,
        slug=org.slug,
        logo_url=branding.get("logoUrl"),
        theme_color=branding.get("themeColor"),
        departments=departments,
    )


# ─── POST /{org_slug}/register ───────────────────────────────────


@router.post(
    "/{org_slug}/register",
    response_model=PublicRegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("5/minute")  # Phase 5 P0 fix (Fix 8): 防灌水/枚举
async def register_employee(
    request: Request,  # slowapi 装饰器需要从 request 取 IP 做 key (已存在, 不动)
    org_slug: str,
    body: PublicRegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PublicRegisterResponse:
    """员工自助注册 — transactional. 镜像 eap-public.routes.ts:79-198.

    流程:
      1. 验 org 存在 + 有 'eap' feature
      2. 邮箱已是 user:
         - 有 hash → bcrypt 验密码; 错 → 401 (W0.4 防 takeover)
         - 无 hash → claim 流, set hash + name
      3. 邮箱新 → 建 user (含真实 password_hash)
      4. 加成员 (client) + 建 employee_profile, 单 commit. 已是成员 → W2.10 同一响应.
    """
    # 入参校验 — pydantic min_length 已拦, 这里再走业务规则 (密码 >=6)
    if len(body.password) < 6:
        raise ValidationError("密码至少 6 位")

    # 1. 验 org 存在 + 有 'eap' feature
    oq = select(Organization).where(Organization.slug == org_slug).limit(1)
    org = (await db.execute(oq)).scalar_one_or_none()
    if org is None:
        raise NotFoundError("Organization", org_slug)

    tier = _resolve_org_tier(org)
    if not has_feature(tier, "eap", org_type=(org.settings or {}).get("orgType")):
        raise NotFoundError("Organization", org_slug)

    phone = body.phone.strip()
    email = body.email.strip().lower() if body.email else None

    # 2. 找已有 user — Phase 5: 按手机号查 (主登录字段)
    uq = select(User).where(User.phone == phone).limit(1)
    existing_user = (await db.execute(uq)).scalar_one_or_none()

    is_new_user = False

    try:
        if existing_user is not None:
            # 2a. W0.4: 已存在用户 - 必须验密码
            if existing_user.password_hash:
                if not verify_password(body.password, existing_user.password_hash):
                    # 错密码 → 401, 不附加 member / profile
                    raise UnauthorizedError("账号或密码错误")
            else:
                # 无 hash → claim, 设密码 + 名字
                existing_user.password_hash = hash_password(body.password)
                existing_user.name = body.name.strip()
            user_id = existing_user.id
        else:
            # 2b. 新手机号 → 创建 user (含真实 password_hash, 与 W0.4 一致)
            # Phase 5: phone 必填, email 可选
            new_user = User(
                phone=phone,
                email=email,
                name=body.name.strip(),
                password_hash=hash_password(body.password),
            )
            db.add(new_user)
            await db.flush()
            user_id = new_user.id
            is_new_user = True

        # 3. 检查是否已是成员
        mq = (
            select(OrgMember.id)
            .where(and_(OrgMember.org_id == org.id, OrgMember.user_id == user_id))
            .limit(1)
        )
        existing_member = (await db.execute(mq)).scalar_one_or_none()

        if existing_member is None:
            # 加 client 成员
            db.add(
                OrgMember(
                    org_id=org.id,
                    user_id=user_id,
                    role="client",
                    status="active",
                )
            )
            # 建 employee profile
            db.add(
                EAPEmployeeProfile(
                    org_id=org.id,
                    user_id=user_id,
                    employee_id=body.employee_id,
                    department=body.department,
                    entry_method="link",
                    is_anonymous=False,
                )
            )
        # 已是成员 → W2.10: 同一响应, 不写新行 (避免暴露 org membership)

        await db.commit()
    except UnauthorizedError:
        # 401 不算 transaction 失败, 但仍 rollback 防止 partial state
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=str(org.id),
        user_id=str(user_id),
        action="create",
        resource="eap_employee_profiles",
        resource_id=None,
        ip_address=request.client.host if request.client else None,
    )
    return PublicRegisterResponse(
        status="registered",
        org_id=str(org.id),
        is_new_user=is_new_user,
    )


__all__ = ["router"]
