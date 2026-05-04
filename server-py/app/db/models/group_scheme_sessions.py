"""
``group_scheme_sessions`` — 团辅方案的单次 session 设计 (group_schemes 子表)。

Drizzle 源: ``server/src/db/schema.ts:626-641``

业务语义:
  - 一行 = 团辅方案中的一次 session 设计 (e.g. "第 3 次 — 自我觉察练习")
  - ``phases`` JSONB: ``SessionPhase[]`` 结构化活动阶段 (开场 / 主题活动 / 总结)
  - ``related_goals`` JSONB: ``number[]`` — 索引指向 ``group_schemes.specific_goals``
  - ``related_assessments`` JSONB: ``uuid[]`` — 该次 session 关联的评估
  - ``sort_order``: 在方案中的展示顺序

无时间戳: 与方案 (group_schemes) 一起更新, 不需独立时间戳。

cascade: scheme 删除 → sessions 全删 (设计内容随方案走)。
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class GroupSchemeSession(Base):
    __tablename__ = "group_scheme_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    scheme_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("group_schemes.id", ondelete="CASCADE"),
    )
    title: Mapped[str] = mapped_column(Text)
    goal: Mapped[str | None] = mapped_column(Text)
    phases: Mapped[list[Any] | None] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    materials: Mapped[str | None] = mapped_column(Text)
    duration: Mapped[str | None] = mapped_column(Text)
    homework: Mapped[str | None] = mapped_column(Text)
    assessment_notes: Mapped[str | None] = mapped_column(Text)
    related_goals: Mapped[list[int] | None] = mapped_column(
        JSONB, server_default=text("'[]'::jsonb")
    )
    session_theory: Mapped[str | None] = mapped_column(Text)
    session_evaluation: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    related_assessments: Mapped[list[Any] | None] = mapped_column(
        JSONB, server_default=text("'[]'::jsonb")
    )
