"""客户 portal API 请求 / 响应 schemas (Pydantic v2).

镜像 ``server/src/modules/client-portal/*.routes.ts`` 各端点 body / response shape.
所有 schema 走 ``CamelModel`` 共享基类 (alias_generator=to_camel + populate_by_name)
让 wire camelCase, 内部 Python snake_case (与 Node API 合约对齐)。

设计:
  - request body 只声明真正用到的字段, 不消费的字段不写 (Pydantic 默认忽略 extra)
  - response model 大多用 ``dict[str, Any]`` (router 返回) 而非严格 schema —
    Node 端 routes 也是返回 ORM row 直 serialize (drizzle 形态), 严格 schema
    维护成本高于价值。仅 strict 化 client.routes.ts 期望 typed 的少数 endpoint.
"""

from __future__ import annotations

from pydantic import Field

from app.api.v1._schema_base import CamelModel

# ─── /appointment-requests ─────────────────────────────────────


class AppointmentRequestBody(CamelModel):
    """``POST /appointment-requests`` body. 镜像 client-appointments.routes.ts:38-44."""

    counselor_id: str = Field(min_length=1)
    start_time: str = Field(min_length=1)  # ISO8601, parser 在 router
    end_time: str = Field(min_length=1)
    type: str | None = None
    notes: str | None = None


# ─── /documents/{doc_id}/sign ──────────────────────────────────


class SignDocumentBody(CamelModel):
    """``POST /documents/{doc_id}/sign`` body. 镜像 client-documents-consents.routes.ts:43."""

    name: str = Field(min_length=1)


# ─── /referrals/{referral_id}/consent ──────────────────────────


class ReferralConsentBody(CamelModel):
    """``POST /referrals/{referral_id}/consent`` body.

    镜像 client-documents-consents.routes.ts:95-98 — ``consent: boolean`` 必填。
    """

    consent: bool


__all__ = [
    "AppointmentRequestBody",
    "ReferralConsentBody",
    "SignDocumentBody",
]


# 不导出的辅助类型, 仅用于 docstring 解释响应 shape, 不强校验:
#   /dashboard           -> dict[str, Any]
#   /timeline            -> list[dict[str, Any]]
#   /counselors          -> list[dict[str, Any]]
#   /results, /results/{id}, /results/trajectory/{scaleId} -> list/dict
#   /my-assessments      -> list[dict[str, Any]]
#   /my-courses, /my-groups, /groups, /courses, /courses/{id}, /groups/{id}
#                        -> list/dict[str, Any]
#   /documents, /documents/{id}, /consents, /consents/{id}/revoke -> list/dict
#   /referrals           -> list[dict[str, Any]]

# 这些响应 shape 全部由 router 直接 dict 返回, 与 Node 端"返 drizzle ORM row"
# 行为一致, 不在此处再画一遍 schema 重复。Pydantic v2 EmailStr 留作 future
# 类型保护需要时启用。
