"""
``group_instances`` — 团辅方案的实例化 (机构具体开团), 是 group_schemes 派生的运行实体。

Drizzle 源: ``server/src/db/schema.ts:643-664``

业务语义:
  - 一行 = 一个机构按某团辅方案实际开的一次团辅 (e.g. "高一 (3) 班 8 周正念团辅")
  - ``scheme_id``: 来源方案 (NULL = 不基于知识库, 直接自创团)
  - ``status``: draft / open_for_enrollment / running / completed / cancelled
  - ``capacity``: 人数上限
  - ``recruitment_assessments`` / ``overall_assessments``: 实际使用的评估 (拷贝自方案
    或团带头人手动覆盖)
  - ``assessment_config`` JSONB: 完整生命周期评估配置 (招募 / 中期 / 末期)
"""

from __future__ import annotations

import uuid
from datetime import date as date_type
from typing import Any

from sqlalchemy import Date, ForeignKey, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import TimestampMixin


class GroupInstance(Base, TimestampMixin):
    __tablename__ = "group_instances"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
    )
    scheme_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("group_schemes.id"),
    )
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(Text)
    leader_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    schedule: Mapped[str | None] = mapped_column(Text)
    duration: Mapped[str | None] = mapped_column(Text)
    start_date: Mapped[date_type | None] = mapped_column(Date)
    location: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, server_default=text("'draft'"))
    capacity: Mapped[int | None] = mapped_column(Integer)
    recruitment_assessments: Mapped[list[Any] | None] = mapped_column(
        JSONB, server_default=text("'[]'::jsonb")
    )
    overall_assessments: Mapped[list[Any] | None] = mapped_column(
        JSONB, server_default=text("'[]'::jsonb")
    )
    screening_notes: Mapped[str | None] = mapped_column(Text)
    assessment_config: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, server_default=text("'{}'::jsonb")
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
