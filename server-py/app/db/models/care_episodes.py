"""
``care_episodes`` — 来访者一段咨询周期的总轨迹 (counseling 域核心实体)。

Drizzle 源: ``server/src/db/schema.ts:277-292``

业务语义:
  - 一个 ``care_episode`` = 一个客户在一个机构里的一段连续服务期 (从首咨开通到 close)。
  - 同客户跨机构 / 跨周期, 可以有多个 episode (每段独立计算 risk / 督导 / referral)。
  - 被 15+ 张表 FK 引用 (care_timeline / session_notes / treatment_plans / referrals /
    follow_up_plans / consent_records / group_enrollments / ...) — 几乎全部 PHI 业务挂在这里。

字段:
  - ``client_id``: 来访者 user (一定有, NOT NULL)
  - ``counselor_id``: 主咨询师 (可空 — 候补阶段 / 自助 portal 评估等场景)
  - ``status``: 'active' | 'closed' | 'transferred' | 'archived' (业务约定, DB 不强约束)
  - ``current_risk``: 'level_1' (低) 到 'level_4' (高危) — 危机研判四级 (即用户记忆里的"四级研判")
  - ``intervention_type``: 干预类型自由文本 (CBT / 正念 / 系统家庭 等)
  - ``opened_at`` / ``closed_at``: 业务时间线, 跟 ``created_at`` 不同 — 后者是 DB 行创建时间
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import TimestampMixin


class CareEpisode(Base, TimestampMixin):
    __tablename__ = "care_episodes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    counselor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    status: Mapped[str] = mapped_column(Text, server_default=text("'active'"))
    chief_complaint: Mapped[str | None] = mapped_column(Text)
    current_risk: Mapped[str] = mapped_column(Text, server_default=text("'level_1'"))
    intervention_type: Mapped[str | None] = mapped_column(Text)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (Index("idx_care_episodes_client", "org_id", "client_id"),)
