"""
``assessment_results`` — 测评提交后的结果记录 (assessment 域核心 PHI 数据)。

Drizzle 源: ``server/src/db/schema.ts:191-226``

业务语义:
  - 一行 = 一次测评的完整结果, 含原始作答 + 计分 + AI 解读
  - 关联 ``care_episodes`` 时表示纳入临床档案 (个案咨询); ``user_id`` IS NULL 时
    是匿名公开测评

PHI 级别: phi_full (含 ``answers`` / ``demographic_data`` / ``ai_interpretation``)。

关键字段:
  - ``answers`` JSONB **必填无默认**: 原始作答, ``{ itemId: value }``
  - ``custom_answers`` JSONB **必填默认 {}**: 自定义题作答 (人口学外的非量表题)
  - ``dimension_scores`` JSONB **必填无默认**: 维度计分 ``{ dimensionId: score }``
  - ``recommendations`` JSONB **必填默认 []**: AI 推荐 (TriageRecommendation[])
  - ``ai_provenance`` JSONB nullable: AI 水印元数据 (model / pipeline / confidence /
    generatedAt), 前端 ``<AIBadge>`` 据此渲染
  - ``client_visible`` BOOL **默认 false**: Phase 9β 重要安全开关 — 咨询师必须
    显式 opt-in 才让客户在 portal 看自己的结果 (与 SimplePractice MBC 模式一致)
  - ``deleted_at``: 软删除

索引:
  - ``idx_results_episode`` on ``care_episode_id`` — 按个案查所有结果
  - ``idx_results_user`` on ``(org_id, user_id)`` — 客户跨次测评纵向追踪
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class AssessmentResult(Base, CreatedAtOnlyMixin):
    __tablename__ = "assessment_results"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
    )
    assessment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assessments.id"),
    )
    # 匿名公开测评 user_id IS NULL
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    care_episode_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("care_episodes.id"),
    )
    demographic_data: Mapped[dict[str, Any]] = mapped_column(
        JSONB, server_default=text("'{}'::jsonb")
    )
    answers: Mapped[dict[str, Any]] = mapped_column(JSONB)  # 必填无默认
    custom_answers: Mapped[dict[str, Any]] = mapped_column(
        JSONB, server_default=text("'{}'::jsonb")
    )
    dimension_scores: Mapped[dict[str, Any]] = mapped_column(JSONB)  # 必填无默认
    total_score: Mapped[Decimal | None] = mapped_column(Numeric)
    risk_level: Mapped[str | None] = mapped_column(Text)
    ai_interpretation: Mapped[str | None] = mapped_column(Text)
    client_visible: Mapped[bool] = mapped_column(server_default=text("false"))
    recommendations: Mapped[list[Any]] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    ai_provenance: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    batch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assessment_batches.id"),
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index("idx_results_episode", "care_episode_id"),
        Index("idx_results_user", "org_id", "user_id"),
    )
