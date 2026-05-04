"""
``course_chapters`` — 课程章节 (courses 子表)。

Drizzle 源: ``server/src/db/schema.ts:734-748``

业务语义:
  - 一行 = 课程的一个章节
  - ``video_url`` / ``content``: 章节主体 (视频或图文)
  - ``related_assessment_id``: 关联测评 (如"学完做个自评")
  - 蓝图字段 (Phase AI-assisted): ``session_goal`` / ``core_concepts`` /
    ``interaction_suggestions`` / ``homework_suggestion`` — AI 生成蓝图阶段填写,
    用户审核后展开成具体 ``course_lesson_blocks`` / ``course_content_blocks``

无时间戳: 章节作为课程的"内容拼装单元", 跟着课程一起更新, 不需独立时间戳。

cascade: 课程删除 → 章节随删。
"""

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CourseChapter(Base):
    __tablename__ = "course_chapters"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courses.id", ondelete="CASCADE"),
    )
    title: Mapped[str] = mapped_column(Text)
    content: Mapped[str | None] = mapped_column(Text)
    video_url: Mapped[str | None] = mapped_column(Text)
    duration: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    related_assessment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assessments.id"),
    )
    session_goal: Mapped[str | None] = mapped_column(Text)
    core_concepts: Mapped[str | None] = mapped_column(Text)
    interaction_suggestions: Mapped[str | None] = mapped_column(Text)
    homework_suggestion: Mapped[str | None] = mapped_column(Text)
