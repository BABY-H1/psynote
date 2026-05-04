"""
``treatment_plans`` — 治疗计划 (个案级 — episode 内)。

Drizzle 源: ``server/src/db/schema.ts:421-438``

业务语义:
  - 一行 = 一份治疗计划 (一个 episode 可能有多份 — 阶段性更新或新版本)
  - ``status``: draft / active / completed / archived
  - ``approach``: 自由文本 (CBT / 人本主义 / 整合取向 等)
  - ``goals`` JSONB: ``TreatmentGoal[]`` (从 ``treatment_goal_library`` 拉模板填进来)
  - ``interventions`` JSONB: ``TreatmentIntervention[]``
  - ``session_plan``: 自由文本 ("每周一次, 预计 12-16 次")
  - ``review_date``: 下次回顾日期 (date 类型)

索引: ``idx_treatment_plans_episode`` on (episode, status) — 查"某个案的活跃计划"。
"""

from __future__ import annotations

import uuid
from datetime import date as date_type
from typing import Any

from sqlalchemy import Date, ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import TimestampMixin


class TreatmentPlan(Base, TimestampMixin):
    __tablename__ = "treatment_plans"

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
    status: Mapped[str] = mapped_column(Text, server_default=text("'draft'"))
    title: Mapped[str | None] = mapped_column(Text)
    approach: Mapped[str | None] = mapped_column(Text)
    goals: Mapped[list[Any]] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    interventions: Mapped[list[Any]] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    session_plan: Mapped[str | None] = mapped_column(Text)
    progress_notes: Mapped[str | None] = mapped_column(Text)
    review_date: Mapped[date_type | None] = mapped_column(Date)

    __table_args__ = (Index("idx_treatment_plans_episode", "care_episode_id", "status"),)
