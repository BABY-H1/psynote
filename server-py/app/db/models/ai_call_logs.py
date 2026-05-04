"""
``ai_call_logs`` — AI 调用日志 (按机构统计 token 用量, 对照 monthlyTokenLimit)。

Drizzle 源: ``server/src/db/schema.ts:1360-1372``

业务语义:
  - 一行 = 一次 AI pipeline 调用的 token 消耗记录
  - ``pipeline``: 调用类型 ('triage' / 'soap-analysis' / 'risk-detection' / ...)
  - ``model``: 实际使用的模型 (e.g. 'gpt-4o' / 'claude-3-5-sonnet')
  - ``prompt_tokens`` / ``completion_tokens`` / ``total_tokens``: 用量
  - 写入由 AIClient 在 chat 请求成功后自动完成

cascade: org 删除 → log 随删; user 删除 → user_id 置 NULL (log 保留, 用于历史统计)。
索引: ``idx_ai_call_logs_org_created`` 用于按月汇总用量。
"""

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Index, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class AICallLog(Base, CreatedAtOnlyMixin):
    __tablename__ = "ai_call_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    pipeline: Mapped[str] = mapped_column(Text)
    model: Mapped[str | None] = mapped_column(Text)
    prompt_tokens: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    completion_tokens: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    total_tokens: Mapped[int] = mapped_column(Integer, server_default=text("0"))

    __table_args__ = (Index("idx_ai_call_logs_org_created", "org_id", "created_at"),)
