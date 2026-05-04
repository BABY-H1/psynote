"""
``organizations`` — 平台机构主表 (75 表的"根节点", 被 20+ 张表 FK 引用)。

Drizzle 源: ``server/src/db/schema.ts:8-19``
基线 migration: ``server/src/db/migrations/005-scheme-assessments.ts``

Phase 2 决策 2026-05-04 新增 (本 SQLAlchemy 模型有, dev DB 暂无):
  - ``parent_org_id``  机构层级预留 (区教委→学校 / 咨询连锁总部→分店)
  - ``org_level``      'leaf' (默认, 无下级) / 后续 Phase 7+ 业务逻辑启动后填 'district' / 'group' 等

  这两个字段会在 Phase 2.7 的 Alembic 0001 migration 里用 ALTER TABLE 加进 dev DB。
  Phase 2 阶段**不写**任何业务逻辑读取这两个字段, 只占位。

不在此处建模的 (与 Drizzle 一致的故意省略):
  - 没有反向 relationship to ``OrgMember`` / ``ClientProfile`` 等 — Phase 3 路由层
    用显式 join 查; SQLAlchemy ORM relationship 在 75 表巨型图里管理成本高于收益。
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import TimestampMixin


class Organization(Base, TimestampMixin):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    name: Mapped[str] = mapped_column(Text)
    slug: Mapped[str] = mapped_column(Text, unique=True)
    plan: Mapped[str] = mapped_column(Text, server_default=text("'free'"))
    license_key: Mapped[str | None] = mapped_column(Text)
    settings: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    triage_config: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    data_retention_policy: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, server_default=text("'{}'::jsonb")
    )

    # ── Phase 2 决策 2026-05-04: 机构层级预留 (Phase 7+ Roadmap §3) ──
    # 业务逻辑不写, 仅 schema 占位; ondelete=SET NULL 让父机构注销时子机构变独立运营。
    parent_org_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="SET NULL"),
    )
    org_level: Mapped[str] = mapped_column(Text, server_default=text("'leaf'"))
