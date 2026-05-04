"""
``workflow_executions`` — 规则执行日志 (调试 / UI 展示用)。

Drizzle 源: ``server/src/db/schema.ts:1290-1303``

业务语义:
  - 一行 = 一次规则触发的执行记录 (包括条件不匹配的 skipped)
  - ``trigger_event``: 冗余记录 (与 rule.trigger_event 一致, rule 删除后可保留事件类型)
  - ``event_payload`` JSONB: 触发时的完整事件数据 (调试用)
  - ``conditions_matched``: 条件是否匹配
  - ``actions_result`` JSONB: ``[{actionType, status, detail}]`` 每个动作的执行结果
  - ``status``: 'success' | 'partial' | 'failed' | 'skipped'
  - ``error_message``: 失败时的错误说明

cascade: rule 删除 → execution 随删 (执行记录与规则强绑定)。
索引: ``idx_workflow_executions_org_rule`` on (org, rule, time) — 按规则查近期执行。
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class WorkflowExecution(Base, CreatedAtOnlyMixin):
    __tablename__ = "workflow_executions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )
    rule_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workflow_rules.id", ondelete="CASCADE"),
    )
    trigger_event: Mapped[str] = mapped_column(Text)
    event_payload: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    conditions_matched: Mapped[bool] = mapped_column()
    actions_result: Mapped[list[Any]] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    status: Mapped[str] = mapped_column(Text)
    error_message: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (Index("idx_workflow_executions_org_rule", "org_id", "rule_id", "created_at"),)
