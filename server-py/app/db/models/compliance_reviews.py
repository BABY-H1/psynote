"""
``compliance_reviews`` — 合规审查 (note 合规度 / 治疗质量 / golden_thread 一致性)。

Drizzle 源: ``server/src/db/schema.ts:950-966``

业务语义:
  - 一行 = 一次合规检查的结果, 通常 AI 自动跑 (reviewed_by='ai' 默认)
  - ``review_type``: note_compliance / treatment_quality / golden_thread
  - ``score``: 0-100 综合得分
  - ``findings`` JSONB: ``[{category, severity, description, suggestion}]``
  - ``golden_thread_score``: 临床推理一致性 (主诉 → 评估 → 计划是否对应)
  - ``quality_indicators`` JSONB: ``{empathy, clinicalJudgment, interventionSpecificity,
    documentationCompleteness}``
  - ``reviewed_by``: 默认 'ai', 也可填具体审核人 (人工复核)

无 ``updated_at`` (CreatedAtOnlyMixin): 审查结果一锤定音, 不再修改 (要重审就新建一行)。
但 Drizzle 有 ``reviewed_at`` 单独时间戳, 用 server_default=now()。
索引: ``idx_compliance_reviews_episode`` / ``idx_compliance_reviews_note``。
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ComplianceReview(Base):
    __tablename__ = "compliance_reviews"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
    )
    care_episode_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("care_episodes.id"),
    )
    note_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("session_notes.id"),
    )
    counselor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    review_type: Mapped[str] = mapped_column(Text)
    score: Mapped[int | None] = mapped_column(Integer)
    findings: Mapped[list[Any]] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    golden_thread_score: Mapped[int | None] = mapped_column(Integer)
    quality_indicators: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, server_default=text("'{}'::jsonb")
    )
    reviewed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    reviewed_by: Mapped[str] = mapped_column(Text, server_default=text("'ai'"))

    __table_args__ = (
        Index("idx_compliance_reviews_episode", "care_episode_id"),
        Index("idx_compliance_reviews_note", "note_id"),
    )
