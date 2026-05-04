"""
``reminder_settings`` — 机构级提醒配置 (1 行 / org)。

Drizzle 源: ``server/src/db/schema.ts:345-356``

字段:
  - ``channels`` JSONB: 默认 ``['email']``, 可加 'sms' (与 Drizzle ``default(['email'])`` 一致)
  - ``remind_before`` JSONB: 默认 ``[1440, 60]`` (24h + 1h 前各发一次, 分钟数)
  - ``email_config`` / ``sms_config`` JSONB: 渠道凭据 (SMTP / 短信厂商)
  - ``message_template`` JSONB: ``{subject, body}`` 模板 (含占位符 ``{clientName}`` 等)

unique 约束: org_id 上 — 一个机构最多 1 个配置 (用 ``.unique()``)。
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import TimestampMixin


class ReminderSettings(Base, TimestampMixin):
    __tablename__ = "reminder_settings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
        unique=True,
    )
    enabled: Mapped[bool] = mapped_column(server_default=text("true"))
    channels: Mapped[list[str]] = mapped_column(JSONB, server_default=text("'[\"email\"]'::jsonb"))
    remind_before: Mapped[list[int]] = mapped_column(
        JSONB, server_default=text("'[1440, 60]'::jsonb")
    )
    email_config: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, server_default=text("'{}'::jsonb")
    )
    sms_config: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, server_default=text("'{}'::jsonb")
    )
    message_template: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, server_default=text("'{}'::jsonb")
    )
