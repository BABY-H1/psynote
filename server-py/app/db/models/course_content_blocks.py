"""
``course_content_blocks`` — 学员视角课程内容块 (Phase 9α C-facing consumable)。

Drizzle 源: ``server/src/db/schema.ts:803-815``

业务语义:
  - 一行 = 学员在 course reader 里看到的一个内容块
  - 与 ``course_lesson_blocks`` 区别: 后者是教师授课大纲 (作者视角), 本表是学员消费视角
  - ``block_type``: video / audio / rich_text / pdf / quiz / reflection / worksheet /
    check_in
  - ``visibility``: participant / facilitator / both — 控制谁能看到 (老师讲义 vs 学员练习)
  - ``payload`` JSONB: 块类型对应的数据 (e.g. video 块存 ``{url, duration}``,
    quiz 块存 ``{questions, correctAnswers}``)

cascade: chapter 删除 → blocks 随删。
索引: ``idx_course_content_blocks_chapter`` on (chapter, sort_order) 用于学员侧按序加载。
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Index, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import TimestampMixin


class CourseContentBlock(Base, TimestampMixin):
    __tablename__ = "course_content_blocks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    chapter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course_chapters.id", ondelete="CASCADE"),
    )
    block_type: Mapped[str] = mapped_column(Text)
    visibility: Mapped[str] = mapped_column(Text, server_default=text("'participant'"))
    sort_order: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )

    __table_args__ = (Index("idx_course_content_blocks_chapter", "chapter_id", "sort_order"),)
