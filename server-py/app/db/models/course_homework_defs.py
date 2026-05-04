"""
``course_homework_defs`` — 课程作业定义 (per instance, per chapter)。

Drizzle 源: ``server/src/db/schema.ts:905-918``

业务语义:
  - 一行 = 一道作业题目 (e.g. "请描述本周的情绪变化")
  - ``question_type``: text / single_choice / multi_choice
  - ``options`` JSONB: 选择题选项 (text 类型为 NULL)
  - ``is_required``: 是否必填
  - ``sort_order``: 题目顺序

cascade: instance 删除 → defs 全删。
索引: ``idx_course_homework_defs_instance`` on (instance, chapter) 用于按 chapter 查作业。
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Index, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class CourseHomeworkDef(Base, CreatedAtOnlyMixin):
    __tablename__ = "course_homework_defs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    instance_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course_instances.id", ondelete="CASCADE"),
    )
    chapter_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course_chapters.id"),
    )
    title: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    question_type: Mapped[str] = mapped_column(Text, server_default=text("'text'"))
    options: Mapped[list[Any] | None] = mapped_column(JSONB)
    is_required: Mapped[bool] = mapped_column(server_default=text("true"))
    sort_order: Mapped[int] = mapped_column(Integer, server_default=text("0"))

    __table_args__ = (Index("idx_course_homework_defs_instance", "instance_id", "chapter_id"),)
