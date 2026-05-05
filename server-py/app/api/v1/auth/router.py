"""
Auth API router — 镜像 server/src/modules/auth/{auth,password-reset}.routes.ts。

7 个 endpoint (挂在 ``/api/auth`` prefix):
  POST /register          — 410 Gone, 引导走 OrgType 专属注册入口
  POST /login             — email/password → access + refresh + user
  POST /refresh           — refresh token → 新一对 tokens
  POST /logout            — JWT stateless, 客户端丢 token 即视为 logout
  POST /change-password   — 已认证, legacy 账号 current_password 可省
  POST /forgot-password   — 防枚举, 未知邮箱也返 200
  POST /reset-password    — 一次性 token, 15min TTL, sha256 hash 比对

安全 (镜像 Node 安全审计行为):
  - **W0.x 防 silent any-password bypass**: ``password_hash IS NULL`` 或 ``""`` 一律 fail-closed
  - **W3.4 JWT alg pin** (HS256): 由 ``app.core.security.decode_token`` 强制
  - **防枚举**: 错误密码 / 未知邮箱同 message; forgot-password 未知邮箱也返 200
  - **token 安全**: DB 只存 sha256(token), 邮件链接才有明文; 一次性 (used_at) + 15min 过期
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, Depends, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth.schemas import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse,
    OkResponse,
    RefreshRequest,
    ResetPasswordRequest,
    TokensResponse,
    UserSummary,
)
from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db.models.password_reset_tokens import PasswordResetToken
from app.db.models.users import User
from app.lib.errors import ValidationError
from app.lib.mailer import send_password_reset_email
from app.middleware.auth import AuthUser, get_current_user

router = APIRouter()

# 与 password-reset.routes.ts:23-25 对齐
_TOKEN_BYTES = 32  # 32 字节随机 → 64 字符 hex
_TOKEN_TTL_MINUTES = 15


def _hash_reset_token(token: str) -> str:
    """sha256(token) hex — DB 只存 hash, 邮件链接才有明文。

    与 Node ``crypto.createHash('sha256').update(token).digest('hex')`` 等价 (test
    crypto invariants 已 pin)。
    """
    return hashlib.sha256(token.encode()).hexdigest()


def _generate_reset_token() -> str:
    """32 字节随机 → 64 字符 hex (与 Node ``crypto.randomBytes(32).toString('hex')`` 等价)。"""
    return secrets.token_hex(_TOKEN_BYTES)


def _build_reset_link(token: str) -> str:
    """前端 reset password 页面 URL (镜像 password-reset.routes.ts:35-38)。"""
    settings = get_settings()
    base = (settings.PUBLIC_BASE_URL or settings.CLIENT_URL).rstrip("/")
    return f"{base}/reset-password?token={token}"


# ─── /register (410 Gone) ───────────────────────────────────


@router.post("/register", status_code=status.HTTP_410_GONE)
async def register_deprecated() -> dict[str, str]:
    """已弃用 — alpha 起注册必须走 OrgType 专属公开入口 (counseling / eap / parent-bind)。

    返回 410 Gone (而非 404), 明确告知调用方 "此功能被移除"。
    """
    return {
        "error": "registration_endpoint_deprecated",
        "message": "请通过机构专属注册入口注册(咨询中心 / EAP / 学校家长邀请)",
    }


# ─── /login ──────────────────────────────────────────────────


@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LoginResponse:
    """Phase 5 (2026-05-04): 手机号 OR 邮箱 + 密码登录。

    Schema 已校验 phone/email 至少 1 个 + phone 格式 (中国手机号正则)。
    业务: 按提供的字段精确查 user, 同时提供则按 OR 匹配 (任一命中即可)。

    安全 (fail-closed + 防枚举):
      - password_hash IS NULL / "" → 同样错; 防 silent any-password bypass (W0.x)
      - 任何失败 (查不到 / 密码错 / hash 空) 同 message"账号或密码错误"
    """
    # Schema 已保证至少有一个; 这里按提供字段构造 OR 查询
    where_clauses: list[Any] = []
    if body.phone:
        where_clauses.append(User.phone == body.phone)
    if body.email:
        where_clauses.append(User.email == body.email)

    user_q = select(User).where(or_(*where_clauses)).limit(1)
    user = (await db.execute(user_q)).scalar_one_or_none()

    # password_hash IS NULL / "" → fail-closed (W0.x)
    if user is None or not user.password_hash:
        raise ValidationError("账号或密码错误")

    if not verify_password(body.password, user.password_hash):
        raise ValidationError("账号或密码错误")

    # last_login_at 同 transaction commit (Node 端是 fire-and-forget, Python 走 await
    # 但 SQLAlchemy session 已经 open, 一起 commit 不增 round-trip)
    user.last_login_at = datetime.now(UTC)
    await db.commit()

    return LoginResponse(
        access_token=create_access_token(
            user_id=str(user.id),
            email=user.email,
            is_system_admin=user.is_system_admin,
        ),
        refresh_token=create_refresh_token(user_id=str(user.id)),
        user=UserSummary(
            id=str(user.id),
            email=user.email,
            name=user.name,
            is_system_admin=user.is_system_admin,
        ),
    )


# ─── /refresh ────────────────────────────────────────────────


@router.post("/refresh", response_model=TokensResponse)
async def refresh(
    body: RefreshRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokensResponse:
    """refresh token (含 type='refresh' 标记) → 一对新 tokens。"""
    try:
        payload = decode_token(body.refresh_token)
    except Exception as exc:
        raise ValidationError("Refresh token expired or invalid") from exc

    if payload.get("type") != "refresh":
        raise ValidationError("Invalid refresh token")

    user_id_str = payload.get("sub")
    if not user_id_str:
        raise ValidationError("Invalid refresh token")

    try:
        user_uuid = uuid.UUID(user_id_str)
    except (ValueError, TypeError) as exc:
        raise ValidationError("Invalid refresh token") from exc

    user_q = select(User).where(User.id == user_uuid).limit(1)
    user = (await db.execute(user_q)).scalar_one_or_none()
    if user is None:
        raise ValidationError("用户不存在")

    return TokensResponse(
        access_token=create_access_token(
            user_id=str(user.id),
            email=user.email,
            is_system_admin=user.is_system_admin,
        ),
        refresh_token=create_refresh_token(user_id=str(user.id)),
    )


# ─── /logout ────────────────────────────────────────────────


@router.post("/logout", response_model=OkResponse)
async def logout() -> OkResponse:
    """JWT stateless — 客户端丢 token 即视为 logout, 服务端无状态可清。"""
    return OkResponse()


# ─── /change-password ───────────────────────────────────────


@router.post("/change-password", response_model=OkResponse)
async def change_password(
    body: ChangePasswordRequest,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OkResponse:
    """已认证用户改自己的密码。

    - legacy / seed 账号 (无 password_hash) 可省 ``current_password``
    - 否则 ``current_password`` 必填且需匹配
    - 改完不强制 logout (现有 JWT 仍可用, 与 Node 行为一致)
    """
    try:
        user_uuid = uuid.UUID(user.id)
    except (ValueError, TypeError) as exc:
        raise ValidationError("用户不存在") from exc

    user_q = select(User).where(User.id == user_uuid).limit(1)
    db_user = (await db.execute(user_q)).scalar_one_or_none()
    if db_user is None:
        raise ValidationError("用户不存在")

    # 只在已有 password_hash 时校验 current_password
    if db_user.password_hash:
        if not body.current_password:
            raise ValidationError("请输入当前密码")
        if not verify_password(body.current_password, db_user.password_hash):
            raise ValidationError("当前密码不正确")

    db_user.password_hash = hash_password(body.new_password)
    await db.commit()
    return OkResponse()


# ─── /forgot-password ───────────────────────────────────────


@router.post("/forgot-password", response_model=OkResponse)
async def forgot_password(
    body: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OkResponse:
    """对未知邮箱也返回 200 (防枚举)。已知邮箱: 生成 token + 存 sha256(token) + 发邮件。

    SMTP 用 ``BackgroundTasks`` 异步发 — 慢 / 超时的邮件不阻塞 HTTP response (用户立即拿到 200,
    防枚举 invariant 保留: 任何邮箱响应时间一致)。BackgroundTasks 异常不影响 response, FastAPI 自己 log。
    """
    user_q = select(User).where(User.email == body.email).limit(1)
    user = (await db.execute(user_q)).scalar_one_or_none()

    if user is None:
        # 防枚举: 静默 200
        return OkResponse()

    plain_token = _generate_reset_token()
    new_token = PasswordResetToken(
        user_id=user.id,
        token_hash=_hash_reset_token(plain_token),
        expires_at=datetime.now(UTC) + timedelta(minutes=_TOKEN_TTL_MINUTES),
    )
    db.add(new_token)
    await db.commit()

    # SMTP 走 background task — 不阻塞 HTTP, 不影响防枚举 timing 一致性
    background_tasks.add_task(send_password_reset_email, body.email, _build_reset_link(plain_token))

    return OkResponse()


# ─── /reset-password ────────────────────────────────────────


@router.post("/reset-password", response_model=OkResponse)
async def reset_password(
    body: ResetPasswordRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OkResponse:
    """token + new_password → 改密码 + 标 used_at。任何失败都返 400 ValidationError。"""
    token_hash = _hash_reset_token(body.token)

    token_q = select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash).limit(1)
    token_row = (await db.execute(token_q)).scalar_one_or_none()

    if token_row is None:
        raise ValidationError("重置链接已失效, 请重新申请")
    if token_row.used_at is not None:
        raise ValidationError("重置链接已使用过, 请重新申请")
    if token_row.expires_at < datetime.now(UTC):
        raise ValidationError("重置链接已过期, 请重新申请")

    user_q = select(User).where(User.id == token_row.user_id).limit(1)
    user = (await db.execute(user_q)).scalar_one_or_none()
    if user is None:
        raise ValidationError("用户不存在")

    user.password_hash = hash_password(body.new_password)
    token_row.used_at = datetime.now(UTC)
    await db.commit()
    return OkResponse()
