"""
``assessment_reports`` — 测评聚合分析报告 (一份报告 = 多个 results 的汇总解读)。

Drizzle 源: ``server/src/db/schema.ts:244-257``

业务语义:
  - ``report_type`` 决定聚合范围: 'individual' (单人多次纵向) / 'batch' (一次批量横向) /
    'class' (一个班横向) / 'group' (团辅前后对比) etc
  - ``result_ids`` JSONB array: 该报告涵盖的 ``assessment_results.id`` 列表
  - ``content`` JSONB 必填: 报告主体结构化数据 (图表数据 / 关键发现 / 建议)
  - ``ai_narrative``: AI 生成的文字总结, 直接展示在报告页

关联可选 (任一可空, 不强约束):
  - ``batch_id``: 来自批量测评
  - ``assessment_id``: 单个测评模板的聚合
  - ``scale_id``: 单个量表跨多次的纵向

PHI 级别: phi_summary (如已含个体细节) 或 aggregate (脱敏聚合)。
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class AssessmentReport(Base, CreatedAtOnlyMixin):
    __tablename__ = "assessment_reports"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
    )
    title: Mapped[str] = mapped_column(Text)
    report_type: Mapped[str] = mapped_column(Text)
    # Drizzle 没 .notNull() — nullable=True
    result_ids: Mapped[list[Any] | None] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    batch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assessment_batches.id"),
    )
    assessment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assessments.id"),
    )
    scale_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("scales.id"),
    )
    content: Mapped[dict[str, Any]] = mapped_column(JSONB)  # 必填无默认
    ai_narrative: Mapped[str | None] = mapped_column(Text)
    generated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
