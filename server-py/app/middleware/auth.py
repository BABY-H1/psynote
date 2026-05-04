"""
Authentication middleware — `get_current_user` FastAPI Dependency。

镜像 server/src/middleware/auth.ts 的 authGuard 行为:
  - 校验 Authorization: Bearer <token>
  - 解码 + 校验 JWT (HS256 pinned, 见 app/core/security.py decode_token)
  - 校验 payload.sub 存在
  - 注入 AuthUser (id, email, is_system_admin) 给路由 handler

用法 (Phase 3+ 模块路由层)::

    from fastapi import APIRouter, Depends
    from app.middleware.auth import AuthUser, get_current_user

    router = APIRouter()

    @router.get("/profile")
    async def my_profile(user: AuthUser = Depends(get_current_user)):
        return {"id": user.id, "email": user.email}

注:
  - Phase 1.6 会接 error_handler.py 把 raise HTTPException 改成 raise AppError
    + 全局 handler 转 HTTP, 让模块代码更干净。本期 (1.2) 暂直接 raise HTTPException。
  - 不在此处校验 refresh token (refresh 走 /api/auth/refresh 端点单独验 type='refresh',
    与 Node auth.routes.ts:115 一致)。
"""

from __future__ import annotations

from typing import Annotated, Any

import jwt as pyjwt
from fastapi import Header, HTTPException, status
from pydantic import BaseModel

from app.core.security import decode_token

# RFC 6750 — 401 响应应带 WWW-Authenticate header 告诉客户端用 Bearer 重试
_INVALID_TOKEN_HEADERS = {"WWW-Authenticate": 'Bearer error="invalid_token"'}


class AuthUser(BaseModel):
    """
    被 `get_current_user` 注入的当前用户。

    镜像 server/src/middleware/auth.ts AuthUser interface 的 (id/email/isSystemAdmin),
    Python 用 snake_case 命名 (is_system_admin)。**JWT payload 里仍是 camelCase
    isSystemAdmin** —— 与 Node 端签名 token 互通的硬约束。
    """

    id: str
    # email 缺失时填 '' (mirrors auth.ts:49 行为, 避免 None 在下游路由里到处判空)
    email: str
    is_system_admin: bool


def _unauthorized(detail: str) -> HTTPException:
    """统一 401 工厂, 带 WWW-Authenticate header (RFC 6750)。"""
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers=_INVALID_TOKEN_HEADERS,
    )


async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
) -> AuthUser:
    """
    FastAPI Dependency — verify Bearer JWT, return AuthUser。

    异常路径全部 401:
      - Missing/invalid Authorization header
      - Empty token after 'Bearer '
      - JWT decode 失败 (alg 错 / sig 错 / 过期 / 格式坏)
      - payload 缺 sub
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise _unauthorized("Missing or invalid authorization header")

    token = authorization[len("Bearer ") :]
    if not token:
        raise _unauthorized("Missing or invalid authorization header")

    try:
        payload: dict[str, Any] = decode_token(token)
    except pyjwt.PyJWTError as exc:
        raise _unauthorized("Invalid or expired token") from exc

    user_id = payload.get("sub")
    if not user_id or not isinstance(user_id, str):
        raise _unauthorized("Invalid token payload")

    return AuthUser(
        id=user_id,
        email=payload.get("email") or "",
        is_system_admin=bool(payload.get("isSystemAdmin", False)),
    )
