"""Parent binding API schemas (Pydantic v2).

镜像:
  - server/src/modules/parent-binding/parent-binding.routes.ts (admin 侧 token 管理)
  - server/src/modules/parent-binding/public-parent-binding.routes.ts (家长公开绑定)
  - server/src/modules/parent-binding/portal-children.routes.ts (家长 portal)
"""

from __future__ import annotations

from typing import Literal, Self

from pydantic import Field, model_validator

from app.api.v1._schema_base import CamelModel
from app.lib.phone_utils import CN_PHONE_REGEX

# ─── admin: POST /parent-invite-tokens body ─────────────────────


class CreateClassTokenBody(CamelModel):
    """``POST .../parent-invite-tokens`` body. Phase 5: 默认 365 天 (1 学年).

    镜像 parent-binding.routes.ts:31-37。

    Phase 5 (2026-05-04) 决策: 学校班级 token 默认有效期 30 → 365 天 (= 1 学年),
    班主任仍可在 1~365 范围内调整。学校场景中, token 是公开二维码贴墙 / 印通讯
    录, 30 天太短家长还没看到就过期; 365 天覆盖一学年, 更新一次即可。
    """

    expires_in_days: int | None = Field(default=None, ge=1, le=365)


# ─── public: POST /public/parent-bind/{token} body ──────────────


# 与 server/src/modules/parent-binding/parent-binding.service.ts:51 完全一致
ParentRelation = Literal["father", "mother", "guardian", "other"]


class ParentBindBody(CamelModel):
    """``POST /api/public/parent-bind/{token}`` body.

    所有字段在 service 层做严格校验 (空字串 / phoneLast4 4 位数字 / 关系白名单 /
    密码 ≥6 位); 这里只做最弱 schema, 让校验集中在 service 错误信息精确控制.

    Phase 5 (2026-05-04): 加 ``phone`` (家长真实手机号), 废之前的合成 email.
    保留 ``phone_last4`` 是因为它语义不同 — 老师录入时只填末 4 位用于核身,
    而家长此处填的是完整手机号用于登录. 加 model_validator 强制末 4 位一致,
    防家长填错手机号自相矛盾.
    """

    student_name: str = ""
    student_number: str = ""
    phone_last4: str = ""
    relation: ParentRelation | None = None
    my_name: str = ""
    password: str = ""
    # Phase 5: 家长真实手机号 (登录用), 中国大陆 11 位
    phone: str = Field(default="", pattern=rf"({CN_PHONE_REGEX})|^$")

    @model_validator(mode="after")
    def phone_last4_must_match_phone(self) -> Self:
        """业务一致性: 若 phone 给齐 11 位, 末 4 位必须 == phone_last4 (防家长填错)."""
        if self.phone and self.phone_last4 and self.phone[-4:] != self.phone_last4:
            raise ValueError("phone 末 4 位与 phoneLast4 不一致")
        return self


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
