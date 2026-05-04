"""
``scale_dimensions`` — 量表维度子表 (一个 scale 含 N 个维度, 每维度独立计分)。

Drizzle 源: ``server/src/db/schema.ts:132-139``

例 (PHQ-9 抑郁量表):
  - 维度 1: 情感低落 (题 1-3 加权 / 阈值)
  - 维度 2: 兴趣丧失 (题 4-5)
  - 维度 3: 躯体症状 (题 6-9)

字段:
  - ``calculation_method``: sum / avg / max / 自定义公式 (默认 sum)
  - ``sort_order``: 维度展示顺序

无 ``created_at`` / ``updated_at``: 维度作为量表的"配置一部分", 跟随 scale 一起
创建/更新, 不需独立时间戳。
"""

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ScaleDimension(Base):
    __tablename__ = "scale_dimensions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    scale_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("scales.id", ondelete="CASCADE"),
    )
    name: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    calculation_method: Mapped[str] = mapped_column(Text, server_default=text("'sum'"))
    sort_order: Mapped[int] = mapped_column(Integer, server_default=text("0"))
