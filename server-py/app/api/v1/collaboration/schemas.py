"""
Collaboration 模块 API schemas (Pydantic v2)。

镜像 ``server/src/modules/collaboration/collaboration.routes.ts`` 的 wire 形状
(camelCase, 与 Node 合约对齐)。

5 个端点 (按 4 tab UI 分组):
  Tab A: GET /unassigned-clients   — 没分派的 client member 列表
         GET /assignments          — 已派单历史 (含 client/counselor name join)
  Tab C: GET /pending-notes        — 督导待审 notes (限 supervisee 范围)
         POST /pending-notes/{noteId}/review  — 督导审签 (approve/reject)
  Audit: GET /audit                — 审计日志查询 (org_admin only)
         GET /phi-access           — PHI 访问日志查询 (org_admin only)

Node 端走 raw SQL (drizzle ``sql`` template) 因有跨 5 表 + UNION 等复杂需求,
Python 端尽量走 SQLAlchemy ``select()``, 复杂 join 走 ``text()`` raw SQL 跟 Node 一致。
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.api.v1._schema_base import CamelModel

# ─── Tab A: Unassigned clients / assignments ─────────────────


class UnassignedClientRow(CamelModel):
    """``GET /unassigned-clients`` 元素 (镜像 routes.ts:51-66)。"""

    id: str
    name: str | None = None
    email: str | None = None
    joined_at: str | None = None


class AssignmentRow(CamelModel):
    """``GET /assignments`` 元素 (镜像 routes.ts:80-91)。"""

    id: str
    client_id: str
    counselor_id: str
    is_primary: bool
    assigned_at: str | None = None
    client_name: str | None = None
    counselor_name: str | None = None


# ─── Tab C: Pending notes for supervisor review ──────────────


class PendingNoteRow(CamelModel):
    """``GET /pending-notes`` 元素 (镜像 routes.ts:124-137)。"""

    id: str
    client_id: str
    counselor_id: str
    session_date: str | None = None
    note_format: str
    status: str
    submitted_for_review_at: str | None = None
    summary: str | None = None
    client_name: str | None = None
    counselor_name: str | None = None


ReviewDecision = Literal["approve", "reject"]


class ReviewNoteRequest(CamelModel):
    """``POST /pending-notes/{note_id}/review`` 请求 (镜像 routes.ts:151)。"""

    decision: ReviewDecision
    annotation: str | None = None


class ReviewNoteResult(CamelModel):
    """``POST /pending-notes/{note_id}/review`` 响应 — 返更新后的 sessionNote 行。

    Node 端直接 ``returning()`` ORM row 返客户端, 字段繁多; Python 端归并为一个
    平铺 row, 与 session_note router 风格保持一致。
    """

    id: str
    org_id: str
    care_episode_id: str | None = None
    appointment_id: str | None = None
    client_id: str
    counselor_id: str
    note_format: str
    template_id: str | None = None
    session_date: str | None = None
    duration: int | None = None
    session_type: str | None = None
    subjective: str | None = None
    objective: str | None = None
    assessment: str | None = None
    plan: str | None = None
    fields: dict[str, Any] = Field(default_factory=dict)
    summary: str | None = None
    tags: list[str] = Field(default_factory=list)
    status: str
    supervisor_annotation: str | None = None
    submitted_for_review_at: str | None = None


# ─── Audit / PHI access query ────────────────────────────────


class AuditLogRow(CamelModel):
    """``GET /audit`` 元素 (audit_logs 行, 镜像 routes.ts:200-205)。"""

    id: str
    org_id: str | None = None
    user_id: str | None = None
    action: str
    resource: str
    resource_id: str | None = None
    changes: dict[str, Any] | None = None
    ip_address: str | None = None
    created_at: str | None = None


class PHIAccessLogRow(CamelModel):
    """``GET /phi-access`` 元素 (phi_access_logs 行, 镜像 routes.ts:232-237)。"""

    id: str
    org_id: str
    user_id: str
    client_id: str
    resource: str
    resource_id: str | None = None
    action: str
    reason: str | None = None
    data_class: str | None = None
    actor_role_snapshot: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    created_at: str | None = None


__all__ = [
    "AssignmentRow",
    "AuditLogRow",
    "PHIAccessLogRow",
    "PendingNoteRow",
    "ReviewDecision",
    "ReviewNoteRequest",
    "ReviewNoteResult",
    "UnassignedClientRow",
]
