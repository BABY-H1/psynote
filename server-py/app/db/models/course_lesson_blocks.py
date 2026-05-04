"""
``course_lesson_blocks`` — 课程章节内的"教学内容块" (老师视角的教案 outline)。

Drizzle 源: ``server/src/db/schema.ts:768-780``

业务语义:
  - 一行 = 章节里的一个内容块 (e.g. "开场介绍" / "核心理论" / "案例展示" 等)
  - ``block_type``: opening / objectives / core_content / case_demo / interaction /
    practice / homework / post_reminder / counselor_notes
  - 与 ``course_content_blocks`` 区别: lesson_blocks 是教师授课大纲 (作者视角),
    content_blocks 是学员真正消费的内容 (学员视角)
  - ``ai_generated``: AI 生成标志
  - ``last_ai_instruction``: AI 上次生成时的指令 (再次生成时复用)

cascade: chapter 删除 → blocks 随删。
索引: ``idx_lesson_blocks_chapter`` on (chapter, sort_order) 用于按章节按序加载。
"""

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Index, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import TimestampMixin


class CourseLessonBlock(Base, TimestampMixin):
    __tablename__ = "course_lesson_blocks"

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
    content: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    ai_generated: Mapped[bool] = mapped_column(server_default=text("false"))
    last_ai_instruction: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (Index("idx_lesson_blocks_chapter", "chapter_id", "sort_order"),)
