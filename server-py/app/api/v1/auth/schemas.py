"""
Auth API 请求 / 响应 schemas (Pydantic v2)。

镜像 server/src/modules/auth/auth.routes.ts 与 password-reset.routes.ts 的 JSON
shape — client / portal 仍调旧合约 (camelCase), 故所有 schema 走
``alias_generator=to_camel`` + ``populate_by_name=True``: 内部 Python 用 snake_case,
JSON wire 用 camelCase。
"""

from __future__ import annotations

from pydantic import EmailStr, Field

from app.api.v1._schema_base import CamelModel

# ─── /login ──────────────────────────────────────────────────


class LoginRequest(CamelModel):
    email: EmailStr
    password: str = Field(min_length=1)


class UserSummary(CamelModel):
    """登录响应里嵌套的 user 简表 (镜像 Node auth.routes.ts:99)。"""

    id: str
    email: str | None
    name: str
    is_system_admin: bool


class TokensResponse(CamelModel):
    """``/refresh`` 响应 — 仅 tokens, 无 user。"""

    access_token: str
    refresh_token: str


class LoginResponse(TokensResponse):
    """``/login`` 响应 — tokens + user。"""

    user: UserSummary


# ─── /refresh ────────────────────────────────────────────────


class RefreshRequest(CamelModel):
    refresh_token: str = Field(min_length=1)


# ─── /change-password ────────────────────────────────────────


class ChangePasswordRequest(CamelModel):
    """legacy / OAuth 账号 (无 password_hash) 可省 current_password。"""

    current_password: str | None = None
    new_password: str = Field(min_length=6)


# ─── /forgot-password ────────────────────────────────────────


class ForgotPasswordRequest(CamelModel):
    email: EmailStr


# ─── /reset-password ─────────────────────────────────────────


class ResetPasswordRequest(CamelModel):
    """token: 64 字符 hex (32 字节 randomBytes 转 hex)。"""

    token: str = Field(min_length=64, max_length=64, pattern=r"^[a-f0-9]{64}$")
    new_password: str = Field(min_length=6)


# ─── 通用 OK 响应 ───────────────────────────────────────────


class OkResponse(CamelModel):
    ok: bool = True
