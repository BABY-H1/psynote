"""
``client_relationships`` — 家长 ↔ 来访者 (孩子) 绑定关系 (Phase 14)。

Drizzle 源: ``server/src/db/schema.ts:1469-1487``

MVP 极简设计:
  - 不在表上做权限粒度字段
  - 数据可见性由 client.routes 的硬编码白名单/黑名单实现
    (只有 dashboard / appointments / documents / consents / counselors 这些路由才接受
    ``?as=`` 参数, 其它一律 403)

字段:
  - ``holder_user_id``: 家长的 user.id (持有关系的人)
  - ``related_client_user_id``: 孩子的 user.id (被关联的来访者)
  - ``relation``: 'father' | 'mother' | 'guardian' | 'other'
  - ``status``: 'active' | 'revoked'
  - ``bound_via_token_id``: 通过哪个班级 token 绑定的 (审计 + "由 X 老师邀请"提示)
  - ``accepted_at``: 接受时间 (默认 now)
  - ``revoked_at``: 撤销时间

唯一约束: 同 (org, holder, related) 不能重复 — 一对家长-孩子关系只 1 行。
索引: 双向各一 (按家长查孩子 / 按孩子查家长)。
cascade: org / 任一 user 删除 → 关系随删; bound_via_token → set NULL (token 删了关系保留)。
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class ClientRelationship(Base, CreatedAtOnlyMixin):
    __tablename__ = "client_relationships"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )
    holder_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
    )
    related_client_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
    )
    relation: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, server_default=text("'active'"))
    bound_via_token_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("class_parent_invite_tokens.id", ondelete="SET NULL"),
    )
    accepted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index(
            "uq_client_rel_org_holder_related",
            "org_id",
            "holder_user_id",
            "related_client_user_id",
            unique=True,
        ),
        Index("idx_client_rel_holder", "holder_user_id"),
        Index("idx_client_rel_related", "related_client_user_id"),
    )
