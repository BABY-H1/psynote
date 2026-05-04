"""
``course_enrollments`` — 用户报名某课程 (实例) 的关系表。

Drizzle 源: ``server/src/db/schema.ts:750-766``

业务语义:
  - 一行 = 一个用户在某课程上的报名 (可能挂某 instance, 也可能直接挂 course)
  - ``instance_id``: 课程实例 ID (NULL = 挂在课程模板上, 旧数据兼容场景)
  - ``enrollment_source``: assigned / class_batch / public_apply / self_enroll
  - ``approval_status``: pending / approved / rejected / auto_approved
  - ``progress`` JSONB: 进度数据 ``{chapterId: {completed, watchedSeconds, ...}}``
  - ``status``: enrolled / completed / dropped (业务状态)
  - ``enrolled_at``: 报名时间 (默认 now)
  - ``completed_at``: 完成时间 (NULL = 未完成)

唯一约束: 同 (course, user) 不能重复 — 防同一课程重复报名。
cascade: course 删除 → 报名随删。

instance_id 自引用 course_instances (course_instances 在更后面定义, Drizzle 用 ``(): any =>``
forward 引用; SQLAlchemy 端走字符串)。
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CourseEnrollment(Base):
    __tablename__ = "course_enrollments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courses.id", ondelete="CASCADE"),
    )
    instance_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course_instances.id"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    care_episode_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("care_episodes.id"),
    )
    assigned_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    enrollment_source: Mapped[str | None] = mapped_column(
        Text, server_default=text("'self_enroll'")
    )
    approval_status: Mapped[str | None] = mapped_column(
        Text, server_default=text("'auto_approved'")
    )
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    progress: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    status: Mapped[str] = mapped_column(Text, server_default=text("'enrolled'"))
    enrolled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index("uq_course_enrollments_course_user", "course_id", "user_id", unique=True),
    )
