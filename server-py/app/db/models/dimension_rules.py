"""
``dimension_rules`` — 量表维度的分级规则 (得分区间 → 风险等级 + 解读 + 建议)。

Drizzle 源: ``server/src/db/schema.ts:141-150``

例 (PHQ-9 总分维度):
  - 0-4   "无抑郁倾向"
  - 5-9   "轻度抑郁倾向"   risk_level=level_2
  - 10-14 "中度抑郁倾向"   risk_level=level_3
  - 15-27 "重度抑郁倾向"   risk_level=level_4

字段:
  - ``min_score`` / ``max_score`` 用 ``Numeric`` (允许小数, 量表常见加权得分)
  - ``risk_level``: level_1 / level_2 / level_3 / level_4 (与 ``care_episodes.current_risk`` 同套)
  - ``advice``: 推荐给客户的建议 (在结果页展示)
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DimensionRule(Base):
    __tablename__ = "dimension_rules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    dimension_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("scale_dimensions.id", ondelete="CASCADE"),
    )
    min_score: Mapped[Decimal] = mapped_column(Numeric)
    max_score: Mapped[Decimal] = mapped_column(Numeric)
    label: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    advice: Mapped[str | None] = mapped_column(Text)
    risk_level: Mapped[str | None] = mapped_column(Text)
