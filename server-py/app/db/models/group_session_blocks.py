"""
``group_session_blocks`` — 团辅 session 的内容块 (Phase 9α, 与 course_content_blocks
共用 type/payload 结构)。

Drizzle 源: ``server/src/db/schema.ts:821-833``

业务语义:
  - 一行 = 团辅方案的一个 session 上的内容块 (学员/带头人视角)
  - ``visibility``: participant / facilitator / both — 默认 'both' (团辅场景多双方共用)
  - 与 ``course_content_blocks`` 共享 BlockType + payload 形状 (走 packages/shared)

cascade: scheme_session 删除 → blocks 随删。
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Index, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import TimestampMixin


class GroupSessionBlock(Base, TimestampMixin):
    __tablename__ = "group_session_blocks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    scheme_session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("group_scheme_sessions.id", ondelete="CASCADE"),
    )
    block_type: Mapped[str] = mapped_column(Text)
    visibility: Mapped[str] = mapped_column(Text, server_default=text("'both'"))
    sort_order: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )

    __table_args__ = (Index("idx_group_session_blocks_session", "scheme_session_id", "sort_order"),)
