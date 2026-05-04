"""
``class_parent_invite_tokens`` — 班级家长邀请二维码 token (Phase 14)。

Drizzle 源: ``server/src/db/schema.ts:1446-1457``

设计核心:
  - 老师不能一人一发邀请 (学生太多)
  - 改成给每个班级生成一个共享 token, 二维码贴到家长群里, N 个家长扫码自助绑定
  - 同班学生共享一个 token — 防止跨班冒认靠 ``class_id`` 限定查询范围

字段:
  - ``token``: 不透明字符串, unique 全局唯一
  - ``expires_at`` notnull: 过期时间 (强制要求, 防 token 泄露后无限期使用)
  - ``revoked_at`` nullable: 撤销时间 (老师手动作废)
  - ``created_by``: 创建老师 (无 FK ondelete cascade — 老师离职后 token 应保留, 但 Drizzle
    端写了 set NULL)

cascade: org / class 删除 → token 随删 (班级注销, token 无意义); created_by → set NULL。
索引: ``idx_class_parent_tokens_class`` 按 class 查 token。
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class ClassParentInviteToken(Base, CreatedAtOnlyMixin):
    __tablename__ = "class_parent_invite_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )
    class_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("school_classes.id", ondelete="CASCADE"),
    )
    token: Mapped[str] = mapped_column(Text, unique=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (Index("idx_class_parent_tokens_class", "class_id"),)
