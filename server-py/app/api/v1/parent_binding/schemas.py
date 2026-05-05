"""Parent binding API schemas (Pydantic v2).

镜像:
  - server/src/modules/parent-binding/parent-binding.routes.ts (admin 侧 token 管理)
  - server/src/modules/parent-binding/public-parent-binding.routes.ts (家长公开绑定)
  - server/src/modules/parent-binding/portal-children.routes.ts (家长 portal)
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.api.v1._schema_base import CamelModel

# ─── admin: POST /parent-invite-tokens body ─────────────────────


class CreateClassTokenBody(CamelModel):
    """``POST .../parent-invite-tokens`` body. 默认 30 天 (服务侧).

    镜像 parent-binding.routes.ts:31-37.
    """

    expires_in_days: int | None = Field(default=None, ge=1, le=365)


# ─── public: POST /public/parent-bind/{token} body ──────────────


# 与 server/src/modules/parent-binding/parent-binding.service.ts:51 完全一致
ParentRelation = Literal["father", "mother", "guardian", "other"]


class ParentBindBody(CamelModel):
    """``POST /api/public/parent-bind/{token}`` body.

    所有字段在 service 层做严格校验 (空字串 / phoneLast4 4 位数字 / 关系白名单 /
    密码 ≥6 位); 这里只做最弱 schema, 让校验集中在 service 错误信息精确控制.
    """

    student_name: str = ""
    student_number: str = ""
    phone_last4: str = ""
    relation: ParentRelation | None = None
    my_name: str = ""
    password: str = ""


# ─── public: response (login-shape payload) ─────────────────────


class ParentBindUser(CamelModel):
    id: str
    email: str | None
    name: str
    is_system_admin: bool


class ParentBindChild(CamelModel):
    id: str
    name: str
    relation: ParentRelation


class ParentBindResponse(CamelModel):
    """与 ``/auth/login`` 同形态 (前端可一份 store 接). 含绑定的 child 摘要."""

    access_token: str
    refresh_token: str
    user: ParentBindUser
    org_id: str
    child: ParentBindChild


class ParentBindTokenPreview(CamelModel):
    """``GET /api/public/parent-bind/{token}`` 响应 (老师 + 班 + 过期)."""

    org_name: str
    class_name: str
    class_grade: str
    expires_at: str  # ISO8601


__all__ = [
    "CreateClassTokenBody",
    "ParentBindBody",
    "ParentBindChild",
    "ParentBindResponse",
    "ParentBindTokenPreview",
    "ParentBindUser",
    "ParentRelation",
]
