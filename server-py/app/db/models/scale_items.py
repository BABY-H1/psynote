"""
``scale_items`` — 量表题目 (单题原子单元)。

Drizzle 源: ``server/src/db/schema.ts:152-160``

字段:
  - ``text``: 题干文本 (e.g. "我感到情绪低落")
  - ``is_reverse_scored``: 反向计分题 (e.g. "我感到精力充沛" 选"完全是" 应该减分而非加分)
  - ``options`` JSONB: ``[{label, value}]`` — Likert 4-7 档可选, e.g.
    ``[{"label": "完全没有", "value": 0}, {"label": "几天", "value": 1}, ...]``
  - ``dimension_id``: 该题归属的维度 (允许空, 便于"总分模式"量表不分维度)
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Integer, Text, func
from sqlalchemy import text as sql_text  # 字段名 'text' 与 sqlalchemy.text 函数冲突, 此处 alias
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ScaleItem(Base):
    __tablename__ = "scale_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    scale_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("scales.id", ondelete="CASCADE"),
    )
    dimension_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("scale_dimensions.id"),
    )
    # Drizzle 字段名是 'text' (题干文本), 用 sql_text alias 避免跟字段名冲突
    text: Mapped[str] = mapped_column(Text)
    is_reverse_scored: Mapped[bool] = mapped_column(server_default=sql_text("false"))
    options: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)  # 无 default, 必填
    sort_order: Mapped[int] = mapped_column(Integer, server_default=sql_text("0"))
