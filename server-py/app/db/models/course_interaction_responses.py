"""
``course_interaction_responses`` — 课程内互动块的响应 (poll / 情绪打卡 / 匿名提问)。

Drizzle 源: ``server/src/db/schema.ts:936-946``

业务语义:
  - 一行 = 一次互动 block 的提交 (匿名打卡可能 enrollment_id 为空)
  - ``response_type``: poll / emotion_checkin / anonymous_qa
  - ``response_data`` JSONB: 响应数据 (e.g. poll 选项 / 情绪文字 / 问题文本)

cascade: lesson_block 删除 → response 随删。
索引: ``idx_course_interaction_responses_block`` on (block, instance)。
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class CourseInteractionResponse(Base, CreatedAtOnlyMixin):
    __tablename__ = "course_interaction_responses"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    block_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course_lesson_blocks.id", ondelete="CASCADE"),
    )
    instance_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course_instances.id"),
    )
    enrollment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course_enrollments.id"),
    )
    response_type: Mapped[str] = mapped_column(Text)
    response_data: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))

    __table_args__ = (Index("idx_course_interaction_responses_block", "block_id", "instance_id"),)
