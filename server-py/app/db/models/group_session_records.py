"""
``group_session_records`` — 团辅 session 实际执行记录 (group_instances 子表)。

Drizzle 源: ``server/src/db/schema.ts:679-692``

业务语义:
  - 一行 = 一个团辅 instance 的某次 session 实际开了 (e.g. "第 3 次 — 自我觉察, 2026-04-15")
  - ``scheme_session_id``: 来源方案 session 设计 (NULL = 自创团 / 方案 session 已删)
  - ``session_number``: 该次是这个 instance 的第几次 (1-based)
  - ``status``: planned / completed / cancelled
  - ``date``: 实际/计划日期 (date 类型)

cascade:
  - instance 删除 → 记录全删
  - scheme_session 删除 → 记录的 scheme_session_id 置 NULL (记录本身保留)

索引: ``idx_group_session_records_instance`` on instance_id 用于查"该团辅所有 sessions"。
"""

from __future__ import annotations

import uuid
from datetime import date as date_type

from sqlalchemy import Date, ForeignKey, Index, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import TimestampMixin


class GroupSessionRecord(Base, TimestampMixin):
    __tablename__ = "group_session_records"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    instance_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("group_instances.id", ondelete="CASCADE"),
    )
    scheme_session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("group_scheme_sessions.id", ondelete="SET NULL"),
    )
    session_number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(Text)
    date: Mapped[date_type | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(Text, server_default=text("'planned'"))
    notes: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (Index("idx_group_session_records_instance", "instance_id"),)
