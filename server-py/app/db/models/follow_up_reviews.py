"""
``follow_up_reviews`` — 单次随访执行记录 (一次执行 = 一行)。

Drizzle 源: ``server/src/db/schema.ts:550-562``

业务语义:
  - 一行 = 一次执行了 plan 上的检查 (e.g. "2026-04-01 给客户做了 PHQ-9 复测")
  - ``review_date``: 执行时间 (默认 now)
  - ``result_id``: 该次随访产生的 assessment_result (如果做了测评)
  - ``risk_before`` / ``risk_after``: 随访前后的风险等级 (level_1...level_4)
  - ``decision``: 随访后的决策 (continue / step_up / refer / discharge)
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class FollowUpReview(Base, CreatedAtOnlyMixin):
    __tablename__ = "follow_up_reviews"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("follow_up_plans.id"),
    )
    care_episode_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("care_episodes.id"),
    )
    counselor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    review_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    result_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assessment_results.id"),
    )
    risk_before: Mapped[str | None] = mapped_column(Text)
    risk_after: Mapped[str | None] = mapped_column(Text)
    clinical_note: Mapped[str | None] = mapped_column(Text)
    decision: Mapped[str | None] = mapped_column(Text)
