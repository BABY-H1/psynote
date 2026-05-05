"""
Enrollment response API 请求 / 响应 schemas (Pydantic v2)。

镜像 ``server/src/modules/enrollment-response/response.{routes,service}.ts`` 的
JSON shape — wire camelCase, Python snake_case (与 auth / content_block 同
pattern, 复用 ``alias_generator=to_camel`` + ``populate_by_name=True``)。

EnrollmentType 仅 'course' / 'group' 两值 (与 Node service.ts:22 一致, 也是
``enrollment_block_responses.enrollment_type`` 列存的字符串)。
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.api.v1._schema_base import CamelModel

# 与 service.ts:22 一致 — polymorphic enrollment_id 的判别值
EnrollmentType = Literal["course", "group"]
# 与 keyword-scanner.ts:111 topSeverity 输出一致
SafetySeverity = Literal["critical", "warning", "info"]


# ─── POST /client/enrollment-responses 请求 (镜像 routes.ts:95-117) ──


class SubmitResponseRequest(CamelModel):
    """
    学员提交单个 block 响应。

    ``response`` 故意不限定 shape (Node ``unknown`` 类型) —
      - reflection / worksheet 提交是 dict (e.g. ``{text: "..."}`` 或表单 KV)
      - quiz 提交是 list (选项索引数组)
      - check_in 也可以是 string
      - **None** 显式表达 "已观看 / 已完成" (无回答)

    服务端不做 type 校验 (Node 也没做), 只 JSONB 存盘 + 走文本扫毒。
    """

    enrollment_id: str = Field(min_length=1)
    enrollment_type: EnrollmentType
    block_id: str = Field(min_length=1)
    response: Any | None = None


# ─── 单条 enrollment_block_responses 行响应 (与 Node service.ts:96-108 一致) ─


class EnrollmentResponseRow(CamelModel):
    """
    单条 ``enrollment_block_responses`` 行。

    list / submit / mark-reviewed / pending-safety 都返这个 shape (pending-safety
    的 raw SQL 多了个 ``user_id``, 见 ``PendingSafetyRow``)。
    """

    id: str
    enrollment_id: str
    enrollment_type: str
    block_id: str
    block_type: str
    response: Any | None = None
    completed_at: str | None = None
    safety_flags: list[dict[str, Any]] = Field(default_factory=list)
    reviewed_by_counselor: bool = False
    reviewed_at: str | None = None


# ─── safety scan crisis 资源 (镜像 keyword-scanner.ts:123-141) ───────


class CrisisResourceItem(CamelModel):
    """单条危机干预资源 (镜像 ``packages/shared/src/types/content-block.ts:194``)。"""

    name: str
    phone: str
    hours: str | None = None
    description: str | None = None


class CrisisInfo(CamelModel):
    """``submitResponse`` 触发 critical/warning 时返的 crisis payload。"""

    severity: SafetySeverity
    resources: list[CrisisResourceItem]


# ─── POST /client/enrollment-responses 响应 (与 service.ts:96-110 一致) ─


class SubmitResponseResult(CamelModel):
    """
    ``submitResponse`` 返回 — 包外层 ``response`` + 可选 ``crisis``。

    ``crisis`` 为 None 表示无危机词命中 (info 级也不弹门户 popup);
    critical / warning 命中时填默认危机资源, 让门户立即弹热线提示。
    """

    response: EnrollmentResponseRow
    crisis: CrisisInfo | None = None


# ─── pending-safety 的 raw SQL 行 (服务端 join 出 user_id, 与 Node 一致) ──


class PendingSafetyRow(CamelModel):
    """
    ``GET /pending-safety`` 元素 — 比 ``EnrollmentResponseRow`` 多 user_id (从
    course_enrollments / group_enrollments JOIN 出)。

    Node 端走 raw SQL (see service.ts:266-277), Python 端走 SQLAlchemy ``select`` +
    table join, 但 wire shape 完全一致。
    """

    id: str
    enrollment_id: str
    enrollment_type: str
    block_id: str
    block_type: str
    response: Any | None = None
    safety_flags: list[dict[str, Any]] = Field(default_factory=list)
    completed_at: str | None = None
    user_id: str
