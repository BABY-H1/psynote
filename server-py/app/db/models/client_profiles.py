"""
``client_profiles`` — 来访者人口学 + 主诉档案 (1 user × 1 org × 1 profile)。

Drizzle 源: ``server/src/db/schema.ts:94-114``

设计要点:
  - 与 ``users`` 表分开 (users 是身份, profile 是临床档案), 一个 user 在多个 org
    各有独立 profile (跨机构隐私边界)。``uniqueIndex(org_id, user_id)`` 保 1:1。
  - PHI 级别: ``phi_full`` — 含 ``presenting_issues`` (主诉) / ``medical_history`` /
    ``family_background`` 等高敏感字段。访问受 Phase 1.3 ``data_class.py`` 守门。
  - ``emergency_contact`` JSONB: ``{ name, phone, relationship }`` (Drizzle 注释)。
  - ``presenting_issues`` JSONB array: 字符串列表 (e.g. ``["焦虑", "失眠"]``)。
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from sqlalchemy import Date, ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import TimestampMixin


class ClientProfile(Base, TimestampMixin):
    __tablename__ = "client_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
    )
    phone: Mapped[str | None] = mapped_column(Text)
    gender: Mapped[str | None] = mapped_column(Text)
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    address: Mapped[str | None] = mapped_column(Text)
    occupation: Mapped[str | None] = mapped_column(Text)
    education: Mapped[str | None] = mapped_column(Text)
    marital_status: Mapped[str | None] = mapped_column(Text)
    emergency_contact: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    medical_history: Mapped[str | None] = mapped_column(Text)
    family_background: Mapped[str | None] = mapped_column(Text)
    presenting_issues: Mapped[list[str] | None] = mapped_column(
        JSONB, server_default=text("'[]'::jsonb")
    )
    notes: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (Index("uq_client_profile_org_user", "org_id", "user_id", unique=True),)
