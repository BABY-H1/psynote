"""
``distributions`` — 测评分发任务 (与 ``assessment_batches`` 区别: distribution 偏渠道,
batch 偏目标群体)。

Drizzle 源: ``server/src/db/schema.ts:259-273``

业务语义:
  - ``mode``: 'public' (公开链接) / 'invite' (定向邀请) / 'embed' (嵌入到 portal)
  - ``targets`` JSONB array: 分发目标列表 (邀请 user_id 或 公开 token)
  - ``schedule`` JSONB: 时间策略 (e.g. ``{startAt, endAt, reminderInterval}``)
  - ``completed_count``: 已完成数 (业务侧 trigger / cron 维护)

索引: ``idx_distributions_assessment`` on assessment_id 用于查"某测评的所有分发实例"。

cascade: assessment 删除时分发任务跟着删 (业务一致)。
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Index, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class Distribution(Base, CreatedAtOnlyMixin):
    __tablename__ = "distributions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
    )
    assessment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assessments.id", ondelete="CASCADE"),
    )
    mode: Mapped[str] = mapped_column(Text, server_default=text("'public'"))
    batch_label: Mapped[str | None] = mapped_column(Text)
    targets: Mapped[list[Any]] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    schedule: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    status: Mapped[str] = mapped_column(Text, server_default=text("'active'"))
    completed_count: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )

    __table_args__ = (Index("idx_distributions_assessment", "assessment_id"),)
