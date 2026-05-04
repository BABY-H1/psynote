"""
``system_config`` — 系统级配置 (KV store, 超出 organizations.settings 的全局配置)。

Drizzle 源: ``server/src/db/schema.ts:1491-1508``

业务语义:
  - 一行 = 一个 (category, key) 配置项
  - ``category``: 配置大类 (e.g. 'rate_limit' / 'feature_flag' / 'ai_default')
  - ``key``: 类内唯一键
  - ``value`` JSONB: 配置值 (任意结构)
  - ``description``: 人类可读描述
  - ``requires_restart``: 修改后是否需要重启服务 (运维提示)

只有 ``updated_at`` 没 ``created_at`` (Drizzle 端定义如此, 可能是历史 migration 决策).

唯一约束: ``uq_system_config_category_key`` on (category, key) — Migration 017 加,
seed-e2e 的 rate-limit UPSERT 依赖 ``ON CONFLICT (category, key)``.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SystemConfig(Base):
    __tablename__ = "system_config"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    category: Mapped[str] = mapped_column(Text)
    key: Mapped[str] = mapped_column(Text)
    value: Mapped[dict[str, Any]] = mapped_column(JSONB)
    description: Mapped[str | None] = mapped_column(Text)
    requires_restart: Mapped[bool] = mapped_column(server_default=text("false"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )

    __table_args__ = (Index("uq_system_config_category_key", "category", "key", unique=True),)
