"""
``appointments`` — 咨询预约 (会面) 主表。

Drizzle 源: ``server/src/db/schema.ts:323-343``

业务语义:
  - ``status``: pending / confirmed / completed / cancelled / no_show
  - ``type``: online / offline / phone (业务自定义, 默认空)
  - ``source``: 来源标识 (admin_create / client_self_book / referral 等)
  - ``reminder_sent_24h`` / ``reminder_sent_1h``: 提醒发送标志 (cron 维护)
  - ``client_confirmed_at``: 客户点确认链接的时间 — 配 ``confirm_token``
  - ``confirm_token``: 一次性确认 token (邮件发出去的链接里)

care_episode_id 可空 — 部分预约 (e.g. 评估 intake 第一次) 还没建 episode。
索引: 按 (counselor, start_time) 与 (client, start_time) 各一, 用于双向日历视图。
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class Appointment(Base, CreatedAtOnlyMixin):
    __tablename__ = "appointments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
    )
    care_episode_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("care_episodes.id"),
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    counselor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(Text, server_default=text("'pending'"))
    type: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    reminder_sent_24h: Mapped[bool] = mapped_column(server_default=text("false"))
    reminder_sent_1h: Mapped[bool] = mapped_column(server_default=text("false"))
    client_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    confirm_token: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        Index("idx_appointments_counselor", "counselor_id", "start_time"),
        Index("idx_appointments_client", "client_id", "start_time"),
    )
