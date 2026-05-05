"""
Auth API 请求 / 响应 schemas (Pydantic v2)。

镜像 server/src/modules/auth/auth.routes.ts 与 password-reset.routes.ts 的 JSON
shape — client / portal 仍调旧合约 (camelCase), 故所有 schema 走
``alias_generator=to_camel`` + ``populate_by_name=True``: 内部 Python 用 snake_case,
JSON wire 用 camelCase。
"""

from __future__ import annotations

from typing import Self

from pydantic import EmailStr, Field, model_validator

from app.api.v1._schema_base import CamelModel
from app.lib.phone_utils import CN_PHONE_REGEX

# ─── /login ──────────────────────────────────────────────────


class LoginRequest(CamelModel):
    """Phase 5 (2026-05-04): 手机号 OR 邮箱 + 密码登录。

    Founder 决策: 国内市场切手机号, 邮箱保留向后兼容 (legacy 用户邮箱登录仍能用)。
    至少提供 phone / email 之一, 否则 422 (model_validator 抛 ValueError)。
    """

    phone: str | None = Field(default=None, pattern=CN_PHONE_REGEX)
    email: EmailStr | None = None
    password: str = Field(min_length=1)

    @model_validator(mode="after")
    def require_phone_or_email(self) -> Self:
        if not self.phone and not self.email:
            raise ValueError("phone 或 email 必填")
        return self


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
