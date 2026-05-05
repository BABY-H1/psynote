"""
User API 请求 / 响应 schemas (Pydantic v2)。

镜像 ``server/src/modules/user/user.routes.ts`` 的 JSON shape — client / portal
仍调旧合约 (camelCase), 故所有 schema 走 ``alias_generator=to_camel`` +
``populate_by_name=True``: 内部 Python 用 snake_case, JSON wire 用 camelCase。

复用 auth ``_CamelModel`` 的命名约定但不 import — 让两个模块解耦, 后续任一
模块单独调整 config 不影响对方。
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    """所有 user schema 的基类 — wire camelCase, Python snake_case。"""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        # 防 dump 时多写 alias key (e.g. 既 avatar_url 又 avatarUrl)
        serialize_by_alias=True,
    )


# ─── GET /me ─────────────────────────────────────────────────


class MeUser(_CamelModel):
    """``/me`` 响应里嵌套的 user 主体 (镜像 user.routes.ts:31-39)。"""

    id: str
    email: str | None
    name: str
    avatar_url: str | None
    is_system_admin: bool
    is_guardian_account: bool
    created_at: datetime | None


class MeMember(_CamelModel):
    """
    ``/me`` 响应里嵌套的当前 active org_member 行 (镜像 user.routes.ts:50-59)。

    单 org 用户就只有一条 (.role / .bio etc); 多 org 取最新创建那条。
    ``orgName`` 来自 LEFT JOIN organizations。
    """

    id: str
    org_id: str
    role: str
    bio: str | None
    specialties: list[str] | None
    certifications: list[Any] | None
    max_caseload: int | None
    org_name: str | None


class MeResponse(_CamelModel):
    """``GET /me`` 响应 — user + 最近 active member (允许 None)。"""

    user: MeUser
    member: MeMember | None


# ─── PATCH /me ───────────────────────────────────────────────


class PatchMeRequest(_CamelModel):
    """
    ``PATCH /me`` 请求体 (镜像 user.routes.ts:75-90)。

    两个字段都是 optional:
      - ``name``: 显式给 → trim 后必须非空, 否则 ValidationError
      - ``avatar_url``: 显式给 → 空串 / null 都视作清空
    任意一个都没给 → ValidationError "没有可更新的字段"
    """

    name: str | None = None
    avatar_url: str | None = None


class PatchMeResponse(_CamelModel):
    """``PATCH /me`` 响应 — 更新后的 user 摘要 (镜像 user.routes.ts:96-102)。"""

    id: str
    email: str | None
    name: str
    avatar_url: str | None
    is_system_admin: bool
