"""
``follow_up_plans`` — 随访计划 (followup 域核心)。

Drizzle 源: ``server/src/db/schema.ts:534-548``

业务语义:
  - 一行 = 一个客户在某 episode 下的随访计划 (e.g. "3 个月后做 PHQ-9 复测")
  - ``plan_type``: 自由文本, 业务侧约定 (e.g. 'periodic_assessment' / 'phone_check')
  - ``assessment_id``: 关联的测评 (NULL = 不强制做某测评, 仅纸面随访)
  - ``frequency``: 自由文本 ("每月" / "每季度" / 自定义 cron 字符串)
  - ``next_due``: 下次应执行时间 (cron 扫描判断是否到期)
  - ``status``: active / paused / completed / cancelled

索引: ``idx_follow_up_plans_due`` on (org_id, next_due) — 用于 cron 扫"该机构所有
即将到期的随访计划"。
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class FollowUpPlan(Base, CreatedAtOnlyMixin):
    __tablename__ = "follow_up_plans"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
    )
    care_episode_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("care_episodes.id"),
    )
    counselor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    plan_type: Mapped[str | None] = mapped_column(Text)
    assessment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assessments.id"),
    )
    frequency: Mapped[str | None] = mapped_column(Text)
    next_due: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(Text, server_default=text("'active'"))
    notes: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (Index("idx_follow_up_plans_due", "org_id", "next_due"),)
