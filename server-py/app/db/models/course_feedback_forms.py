"""
``course_feedback_forms`` — 课程反馈表单定义 (按 instance 配置, 也可针对单 chapter)。

Drizzle 源: ``server/src/db/schema.ts:883-893``

业务语义:
  - 一行 = 一份反馈表单 (e.g. "课程结束后总评" / "第 3 章理解度")
  - ``chapter_id``: 关联章节 (NULL = 整个 instance 通用反馈)
  - ``questions`` JSONB: 题目列表 (Likert / 文本 / 选择题等)
  - ``is_active``: 关闭老表单 (历史回答仍保留)

cascade: instance 删除 → forms 全删。
索引: ``idx_course_feedback_forms_instance`` on (instance, chapter) 用于按 instance + 章节查表单。
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class CourseFeedbackForm(Base, CreatedAtOnlyMixin):
    __tablename__ = "course_feedback_forms"

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
    questions: Mapped[list[Any]] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))

    __table_args__ = (Index("idx_course_feedback_forms_instance", "instance_id", "chapter_id"),)
