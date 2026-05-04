"""
``audit_logs`` — 通用变更审计日志 (append-only, 不可改不可删)。

Drizzle 源: ``server/src/db/schema.ts:983-993``

业务语义:
  - 一行 = 一次资源变更 (CRUD 操作)
  - ``action``: 自由文本 ('create' / 'update' / 'delete' / 'access' / ...)
  - ``resource``: 资源类型 ('client' / 'session_note' / 'org_member' / ...)
  - ``resource_id``: 资源 ID (NULL 用于全表级操作如批量导入)
  - ``changes`` JSONB nullable: 变更前后值 (``{before, after}``) 或 patch

PG inet 类型:
  - ``ip_address``: 用 INET 类型存储 IPv4/IPv6 (而非 text), DB 端原生支持子网查询

org_id / user_id 都可空 — 系统级操作 (cron 跑批 / 平台维护) 没有 org/user 上下文。
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class AuditLog(Base, CreatedAtOnlyMixin):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    action: Mapped[str] = mapped_column(Text)
    resource: Mapped[str] = mapped_column(Text)
    resource_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    changes: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    ip_address: Mapped[str | None] = mapped_column(INET)
