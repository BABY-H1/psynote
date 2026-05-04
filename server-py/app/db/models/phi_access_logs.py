"""
``phi_access_logs`` — PHI 访问审计 (HIPAA 合规要求, 比 audit_logs 字段更全)。

Drizzle 源: ``server/src/db/schema.ts:995-1011``

业务语义:
  - 每次访问 PHI (查看 session_note / 测评结果 / 客户档案 等) 写一行
  - ``user_id``: 访问者
  - ``client_id``: 被访问的来访者 (PHI 所属人)
  - ``resource``: 资源类型 (note / assessment_result / care_episode 等)
  - ``action``: view / export / share / etc.
  - ``reason``: 访问理由 (业务侧填, 合规要求)

Migration 026 字段:
  - ``data_class``: PHI 密级 (与 RoleV2 对应, 见 ``app.shared.tier``)
  - ``actor_role_snapshot``: 冻结当时的角色 — 即使后来角色变了, 审计可追溯当时的权限

PG inet 类型: ``ip_address`` 用 INET; ``user_agent`` text。
"""

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import INET, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class PHIAccessLog(Base, CreatedAtOnlyMixin):
    __tablename__ = "phi_access_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    resource: Mapped[str] = mapped_column(Text)
    resource_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    action: Mapped[str] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text)
    data_class: Mapped[str | None] = mapped_column(Text)
    actor_role_snapshot: Mapped[str | None] = mapped_column(Text)
    ip_address: Mapped[str | None] = mapped_column(INET)
    user_agent: Mapped[str | None] = mapped_column(Text)
