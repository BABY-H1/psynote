"""
``notifications`` — 用户通知 (polymorphic ref_type/ref_id, 不加 FK)。

Drizzle 源: ``server/src/db/schema.ts:968-981``

业务语义:
  - 一行 = 一条要给某 user 看的通知
  - ``type``: 自由文本类型 (e.g. 'appointment_reminder' / 'referral_received' / ...)
  - ``ref_type`` + ``ref_id``: polymorphic — 指向触发本通知的源对象
    (e.g. ref_type='appointment', ref_id=<appointment.id>)
  - **故意不加 FK** 给 ref_id (跨多种表多态)
  - ``is_read``: 已读标志

索引: ``idx_notifications_user`` on (user_id, is_read, created_at) — 查"该用户未读
通知按时间倒序", 标准用法。
"""

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class Notification(Base, CreatedAtOnlyMixin):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    type: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    body: Mapped[str | None] = mapped_column(Text)
    ref_type: Mapped[str | None] = mapped_column(Text)
    # ref_id polymorphic: 指向源对象, 故意不加 FK 约束
    ref_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    is_read: Mapped[bool] = mapped_column(server_default=text("false"))

    __table_args__ = (Index("idx_notifications_user", "user_id", "is_read", "created_at"),)
