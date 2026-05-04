"""
``user_role_audit`` — 角色与权限变更专用审计 (Migration 026)。

Drizzle 源: ``server/src/db/schema.ts:1022-1038``

设计理由 (与 audit_logs 区别):
  - audit_logs 是通用变更日志, 不含 role snapshot 字段
  - 此表每次 ``org_members.role_v2`` / ``access_profile`` / ``principal_class`` 变更时
    写一行, 把变更前后快照 + 执行人当时角色一起冻结, 便于按角色演变倒查

业务语义:
  - ``action``: 'role_change' | 'access_profile_change' | 'principal_class_change'
  - ``role_before`` / ``role_after``: text (RoleV2)
  - ``access_profile_before`` / ``access_profile_after``: JSONB (含 dataClasses / extraScopes)
  - ``actor_id``: 执行变更的人 (一般是 org_admin)
  - ``actor_role_snapshot``: 执行人当时的角色

cascade: org / user 删除 → 审计随删 (合规 — 主体删了, 审计无意义)。
索引:
  - ``idx_user_role_audit_org_user``: 按 (org, user, time) 倒查某人角色史
  - ``idx_user_role_audit_actor``: 按 (actor, time) 查某管理员的所有变更操作
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Index, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class UserRoleAudit(Base, CreatedAtOnlyMixin):
    __tablename__ = "user_role_audit"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
    )
    action: Mapped[str] = mapped_column(Text)
    role_before: Mapped[str | None] = mapped_column(Text)
    role_after: Mapped[str | None] = mapped_column(Text)
    access_profile_before: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    access_profile_after: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    actor_role_snapshot: Mapped[str | None] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        Index("idx_user_role_audit_org_user", "org_id", "user_id", "created_at"),
        Index("idx_user_role_audit_actor", "actor_id", "created_at"),
    )
