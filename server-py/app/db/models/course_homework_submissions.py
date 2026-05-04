"""
``course_homework_submissions`` — 学员作业提交。

Drizzle 源: ``server/src/db/schema.ts:920-934``

业务语义:
  - 一行 = 一个 enrollment 对一道 homework_def 的提交
  - ``content``: 文本类作业的答案 (text 类型)
  - ``selected_options`` JSONB: 选择题的选项 (single_choice 一个值, multi_choice 数组)
  - ``status``: submitted / reviewed
  - ``review_comment``: 老师批改评论
  - ``reviewed_by`` / ``reviewed_at``: 批改信息

唯一约束: 同 (def, enrollment) 不能重复 — 一题一人一次提交。
cascade: def / enrollment 删除 → submission 随删。
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CourseHomeworkSubmission(Base):
    __tablename__ = "course_homework_submissions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    homework_def_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course_homework_defs.id", ondelete="CASCADE"),
    )
    enrollment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course_enrollments.id", ondelete="CASCADE"),
    )
    content: Mapped[str | None] = mapped_column(Text)
    selected_options: Mapped[list[Any] | None] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(Text, server_default=text("'submitted'"))
    review_comment: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        Index(
            "uq_homework_submission_def_enrollment",
            "homework_def_id",
            "enrollment_id",
            unique=True,
        ),
    )
