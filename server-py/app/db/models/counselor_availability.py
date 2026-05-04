"""
``counselor_availability`` — 咨询师每周可预约时段 (appointment 调度引擎读取源)。

Drizzle 源: ``server/src/db/schema.ts:308-321``

业务语义:
  - 一行 = 一个咨询师在某周几的某时段开放 (e.g. 周二 14:00-15:00)
  - ``day_of_week``: 0=周日 ... 6=周六 (与 JS Date.getDay() 一致, 不是 ISO)
  - ``start_time`` / ``end_time``: "HH:mm" 字符串 (而非 time 类型 — Drizzle 选 text
    避免时区/DST 麻烦)
  - ``session_type``: online / offline / phone (NULL = 不限)

唯一约束: 同 (org, counselor, day_of_week, start_time) 不能重复 — 防止同时段重复登记。
"""

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Index, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class CounselorAvailability(Base, CreatedAtOnlyMixin):
    __tablename__ = "counselor_availability"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
    )
    counselor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    day_of_week: Mapped[int] = mapped_column(Integer)
    start_time: Mapped[str] = mapped_column(Text)
    end_time: Mapped[str] = mapped_column(Text)
    session_type: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))

    __table_args__ = (
        Index("idx_availability_counselor", "org_id", "counselor_id", "day_of_week"),
        Index(
            "uq_availability_slot",
            "org_id",
            "counselor_id",
            "day_of_week",
            "start_time",
            unique=True,
        ),
    )
