"""
``course_feedback_responses`` — 反馈表单的提交响应。

Drizzle 源: ``server/src/db/schema.ts:895-903``

业务语义:
  - 一行 = 一个 enrollment 提交了一份 form 的答卷
  - ``answers`` JSONB: 答案数组 (题序对应 form.questions)
  - ``submitted_at``: 提交时间 (替代 created_at)

唯一约束: 同 (form, enrollment) 不能重复 — 一份表单一人只填一次。
cascade: form / enrollment 删除 → response 随删。
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CourseFeedbackResponse(Base):
    __tablename__ = "course_feedback_responses"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    form_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course_feedback_forms.id", ondelete="CASCADE"),
    )
    enrollment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course_enrollments.id", ondelete="CASCADE"),
    )
    answers: Mapped[list[Any]] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    __table_args__ = (
        Index("uq_feedback_response_form_enrollment", "form_id", "enrollment_id", unique=True),
    )
