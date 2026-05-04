"""
``care_timeline`` — 个案 timeline 事件流 (CaseTimeline UI 渲染源)。

Drizzle 源: ``server/src/db/schema.ts:294-306``

业务语义:
  - 一条 = 一个发生在 care_episode 上的"事件" (note 提交 / appointment 完成 /
    assessment 提交 / referral / consent 签 / 危机清单步骤更新 等)
  - ``ref_id`` 软关联到事件源 (note.id / appointment.id 等), 不强制 FK
  - ``metadata`` JSONB: 事件附加数据 (status / score / 跨事件冗余字段)
  - cascade: care_episode 删除时事件流随删

索引: ``idx_care_timeline_episode`` on (care_episode_id, created_at) — 按 episode
查 timeline 时按时间排序, 标准 PG B-tree 高效。
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class CareTimeline(Base, CreatedAtOnlyMixin):
    __tablename__ = "care_timeline"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    care_episode_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("care_episodes.id", ondelete="CASCADE"),
    )
    event_type: Mapped[str] = mapped_column(Text)
    # ref_id 软关联 — 事件源跨多种表 (note / appointment / assessment / ...), 不加 FK
    ref_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    title: Mapped[str] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, server_default=text("'{}'::jsonb")
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )

    __table_args__ = (Index("idx_care_timeline_episode", "care_episode_id", "created_at"),)
