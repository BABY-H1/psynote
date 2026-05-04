"""
``group_session_attendance`` — 团辅 session 出勤记录 (一人一行)。

Drizzle 源: ``server/src/db/schema.ts:694-703``

业务语义:
  - 一行 = 一个 enrollment 在某 session 的出勤情况
  - ``status``: present / absent / excused / late
  - ``note``: 缺席原因 / 迟到说明等

唯一约束: 同 (session_record, enrollment) 不能重复 — 防止重复登记同一人。
cascade: session_record 删除 → 出勤记录全删。
"""

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class GroupSessionAttendance(Base, CreatedAtOnlyMixin):
    __tablename__ = "group_session_attendance"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    session_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("group_session_records.id", ondelete="CASCADE"),
    )
    enrollment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("group_enrollments.id"),
    )
    status: Mapped[str] = mapped_column(Text, server_default=text("'present'"))
    note: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        Index(
            "uq_group_attendance_session_enrollment",
            "session_record_id",
            "enrollment_id",
            unique=True,
        ),
    )
