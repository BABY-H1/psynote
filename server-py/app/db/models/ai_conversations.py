"""
``ai_conversations`` — AI 对话归档 (note 草稿 / 计划生成 / 模拟来访 / 督导对话 4 类)。

Drizzle 源: ``server/src/db/schema.ts:566-588``

业务语义:
  - ``mode``: 'note' | 'plan' | 'simulate' | 'supervise' (BUG-009 修: 全 4 类都归档)
  - ``messages`` JSONB: ``ChatMessage[]`` (role + content + timestamp)
  - ``summary``: AI 生成的对话摘要
  - ``session_note_id``: Phase I Issue 1 — note 模式对话被关联到新建的 session_note
    LeftPanel 用此字段把草稿显示在"会谈记录"区而不是"AI 对话"区
    plan/simulate/supervise 恒 NULL (它们不绑定 sessionNote)

cascade:
  - care_episode 删除 → 对话随删 (PHI 关联)
  - session_note 删除 → ai_conversations.session_note_id 置 NULL (对话本身保留)
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import TimestampMixin


class AIConversation(Base, TimestampMixin):
    __tablename__ = "ai_conversations"

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
        ForeignKey("care_episodes.id", ondelete="CASCADE"),
    )
    counselor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    mode: Mapped[str] = mapped_column(Text)
    title: Mapped[str | None] = mapped_column(Text)
    messages: Mapped[list[Any]] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    summary: Mapped[str | None] = mapped_column(Text)
    session_note_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("session_notes.id", ondelete="SET NULL"),
    )

    __table_args__ = (
        Index("idx_ai_conversations_episode", "care_episode_id", "mode"),
        Index("idx_ai_conversations_session_note", "session_note_id"),
    )
