"""
``password_reset_tokens`` — 密码重置一次性 token (W3.x 安全 fix)。

Drizzle 源: ``server/src/db/schema.ts:47-57``
基线 migration: ``server/src/db/migrations/027-password-reset.ts``

安全设计 (从 Drizzle 注释照搬):
  - DB 只存 ``sha256(token)``, 邮件链接里才是明文。即使 DB 被偷, token 不可回放。
  - 15 分钟过期 (``expires_at``)。
  - 一次性 (``used_at IS NOT NULL`` 即作废)。
  - 忘记密码对未知邮箱也返回 200, 不暴露"邮箱是否注册" (路由层职责)。
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class PasswordResetToken(Base, CreatedAtOnlyMixin):
    __tablename__ = "password_reset_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
    )
    token_hash: Mapped[str] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        # uniqueIndex('uq_password_reset_token_hash').on(t.tokenHash)
        Index("uq_password_reset_token_hash", "token_hash", unique=True),
        # index('idx_password_reset_user_expires').on(t.userId, t.expiresAt)
        Index("idx_password_reset_user_expires", "user_id", "expires_at"),
    )
