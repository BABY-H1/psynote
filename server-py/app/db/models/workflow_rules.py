"""
``workflow_rules`` — 机构级自动化规则引擎 (workflow 域核心, MVP)。

Drizzle 源: ``server/src/db/schema.ts:1257-1284``

业务语义:
  - 语义: **当** trigger_event 发生 + **满足** conditions + **执行** actions
  - MVP 范围:
    - trigger_event 仅支持 'assessment_result.created'
    - conditions 是下拉式 JSON 数组 (见 WorkflowCondition 类型)
    - actions 是按序执行的数组, 仅支持 'assign_course' 和 'create_candidate_entry'

关键设计:
  - 规则引擎**不**直接发短信/邮件等对外联系
  - 所有外部动作一律走 ``candidate_pool``, 由对应角色 (咨询师 / 心理老师 / 管理员)
    在 UI 里手动决定 — 这是合规 + 责任边界的硬性要求

字段:
  - ``scope_assessment_id``: 规则作用域 — 非空 = 测评级规则 (该 assessment 触发时执行),
    NULL = 跨测评通用规则 (暂未开放 UI)
  - ``trigger_event``: 触发事件类型
  - ``conditions`` JSONB: WorkflowCondition[] 数组
  - ``actions`` JSONB: WorkflowAction[] 数组
  - ``priority``: 高在前 (高优先级先匹配)
  - ``source``: 'assessment_wizard' (向导自动同步) / 'manual'

cascade: org 删除 → 规则随删; created_by 删除 → set NULL (规则保留)。
索引: 主查询索引 (org, trigger, active) + scope_assessment 反查。
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Index, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import TimestampMixin


class WorkflowRule(Base, TimestampMixin):
    __tablename__ = "workflow_rules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )
    # scope_assessment_id 故意不加 FK — Drizzle 端无 .references()
    scope_assessment_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    name: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    trigger_event: Mapped[str] = mapped_column(Text)
    conditions: Mapped[list[Any]] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    actions: Mapped[list[Any]] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))
    priority: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    source: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )

    __table_args__ = (
        Index(
            "idx_workflow_rules_org_trigger_active",
            "org_id",
            "trigger_event",
            "is_active",
        ),
        Index("idx_workflow_rules_scope_assessment", "scope_assessment_id"),
    )
