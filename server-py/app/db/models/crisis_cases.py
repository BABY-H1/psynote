"""
``crisis_cases`` — 危机处置案件 (Phase 13, 1:1 绑定 care_episode)。

Drizzle 源: ``server/src/db/schema.ts:1392-1434``

业务语义:
  - 当咨询师接手危机候选 (candidate_pool.kind='crisis_candidate') 时, 系统原子创建:
    - 一个 care_episode (interventionType='crisis', currentRisk='level_4')
    - 一条 crisis_cases 记录 (清单状态)
  - 并回填 candidate_pool.resolvedRefType='crisis_case' / resolvedRefId=<id>

设计决策:
  - 清单状态 (5 步完成情况) 单独存这里, 不污染 care_episodes 通用表
  - 每次 checklist 步骤更新也往 care_timeline 写一条事件 (CaseTimeline UI 直接渲染)
  - 结案必须督导 sign-off:
    counselor 提交 → pending_sign_off → 督导确认 → closed (同时关闭关联 careEpisode)

字段:
  - ``stage``: 'open' | 'pending_sign_off' | 'closed' | 'reopened'
  - ``checklist`` JSONB: 5 步检查清单状态
    形如 ``{reinterview, parentContact, documents, referral, followUp}``
    每步含 ``{done, completedAt, ...}`` 等结构 (CrisisChecklist 类型定义)
  - ``closure_summary``: 咨询师提交结案时填的摘要 (展示给督导)
  - ``supervisor_note``: 督导结案/退回时的备注
  - ``signed_off_by`` / ``signed_off_at``: 督导 sign-off
  - ``submitted_for_sign_off_at``: 提交审核时间 (督导列表排序用)

cascade: org / episode 删除 → 案件随删; candidate / signed_off_by / created_by → set NULL。
索引:
  - 唯一: ``uq_crisis_cases_episode`` on episode_id (1:1 强保证, 一 episode 不会两案)
  - ``idx_crisis_cases_org_stage``: 督导面板查 pending_sign_off 列表
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import TimestampMixin


class CrisisCase(Base, TimestampMixin):
    __tablename__ = "crisis_cases"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )
    episode_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("care_episodes.id", ondelete="CASCADE"),
    )
    candidate_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("candidate_pool.id", ondelete="SET NULL"),
    )
    stage: Mapped[str] = mapped_column(Text, server_default=text("'open'"))
    checklist: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    closure_summary: Mapped[str | None] = mapped_column(Text)
    supervisor_note: Mapped[str | None] = mapped_column(Text)
    signed_off_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    signed_off_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    submitted_for_sign_off_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )

    __table_args__ = (
        Index("uq_crisis_cases_episode", "episode_id", unique=True),
        Index("idx_crisis_cases_org_stage", "org_id", "stage"),
    )
