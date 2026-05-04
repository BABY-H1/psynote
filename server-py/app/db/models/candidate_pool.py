"""
``candidate_pool`` — 候选池 (workflow 域核心: 规则引擎不会自动执行的动作产物)。

Drizzle 源: ``server/src/db/schema.ts:1315-1350``

设计原则:
  - 规则引擎触发后, 不会直接建个案 / 派咨询师 — 而是写一条 candidate 记录
  - 咨询师在协作中心"待处理候选"tab 看到, 决定是否执行
  - 这是合规 + 责任边界设计 (e.g. 危机候选必须人工二次访谈再决定联系家长)

polymorphic kind:
  - ``kind``: 'episode_candidate' | 'group_candidate' | 'crisis_candidate' | 'course_candidate'
  - 决定卡片在哪类 UI 展示, 以及 accepted 后创建什么实体

字段:
  - ``client_user_id``: 候选人 (来访者)
  - ``suggestion``: 规则产生的建议 (显示在卡片上)
  - ``reason``: 入池原因 (规则文案 / 风险等级)
  - ``priority``: low / normal / high / urgent
  - ``source_rule_id``: 来源规则 (NULL 时可能是手工添加)
  - ``source_result_id``: 触发源 assessment_results.id (软关联, 不强制 FK)
  - ``source_payload`` JSONB: 触发事件 payload 快照
  - ``status``: pending / accepted / dismissed / expired
  - ``assigned_to_user_id``: 建议处理人 (轮值咨询师)
  - ``handled_by_user_id`` / ``handled_at`` / ``handled_note``: 实际处理审计
  - ``resolved_ref_type`` / ``resolved_ref_id``: 接受后关联到的实体 (e.g. crisis_case.id)
  - ``target_group_instance_id`` / ``target_course_instance_id``: 目标服务 (group/course
    候选才有意义)

cascade: org / client / 任一 user 删除 → 候选随删 (主体丢失候选无意义); rule / target /
handled_by / assigned 删除 → 各字段 set NULL (候选保留)。
4 个索引: 按 status / 按客户 / 按目标团辅 / 按目标课程。
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class CandidatePool(Base, CreatedAtOnlyMixin):
    __tablename__ = "candidate_pool"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )
    client_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
    )
    kind: Mapped[str] = mapped_column(Text)
    suggestion: Mapped[str] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text)
    priority: Mapped[str] = mapped_column(Text, server_default=text("'normal'"))
    source_rule_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workflow_rules.id", ondelete="SET NULL"),
    )
    # source_result_id 软关联到 assessment_results — 不强制 FK (触发源可能扩展)
    source_result_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    source_payload: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, server_default=text("'{}'::jsonb")
    )
    status: Mapped[str] = mapped_column(Text, server_default=text("'pending'"))
    assigned_to_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    handled_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    handled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    handled_note: Mapped[str | None] = mapped_column(Text)
    resolved_ref_type: Mapped[str | None] = mapped_column(Text)
    resolved_ref_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    target_group_instance_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("group_instances.id", ondelete="SET NULL"),
    )
    target_course_instance_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course_instances.id", ondelete="SET NULL"),
    )

    __table_args__ = (
        Index("idx_candidate_pool_org_status_kind", "org_id", "status", "kind"),
        Index("idx_candidate_pool_client", "client_user_id", "status"),
        Index("idx_candidate_pool_target_group", "target_group_instance_id", "status"),
        Index("idx_candidate_pool_target_course", "target_course_instance_id", "status"),
    )
