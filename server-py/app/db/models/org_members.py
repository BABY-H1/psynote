"""
``org_members`` — 用户在机构内的角色 + 权限主表 (RBAC 决策核心)。

Drizzle 源: ``server/src/db/schema.ts:59-92``
关键 migration:
  - 026-role-architecture-skeleton: ``role_v2`` / ``principal_class`` / ``access_profile`` 引入
  - 030-counseling-roles-strict-compliance: ``trg_validate_role_v2`` DB trigger,
    保证 ``role_v2`` ∈ org 的 OrgType 对应合法角色集 (见 ``app.shared.roles``)。

字段语义:
  - ``role``        legacy 三档 ``org_admin / counselor / client``。Phase 1+ 仍写, Phase 4 起新建数据可省略。
  - ``role_v2``     RoleV2 union (Phase 1.3 ``app.shared.roles``)。**nullable** —
                    backfill 没跑前为 NULL, 路由层走 ``legacy_role_to_v2`` fallback。
  - ``principal_class``  ``staff`` / ``subject`` / ``proxy``。决定登录路由 (主 app vs Portal)。
                          DB 端有 CHECK constraint (在 migration 里, 不在 SQLAlchemy 端重复)。
  - ``access_profile``    单点权限补丁 ``{ dataClasses: ..., extraScopes: ..., grantedAt, grantedBy, reason }``,
                          覆盖 Role 默认 policy。Phase 3 UI 接入前默认 NULL。
  - ``permissions``       legacy JSONB, Phase 4 后弃用; 现在写成空对象保持兼容。
  - ``supervisor_id``     **无 FK 约束** (Drizzle 故意): 软关联, 督导链可能跨 org 或离任后悬空。
  - ``full_practice_access``  counselor + FPA → 派生 supervisor (见 ``OrgContext.is_supervisor``)。
  - ``source_partnership_id`` EAP partnership 派遣的咨询师溯源, 反向到 ``eap_partnerships.id``。
  - ``certifications`` / ``specialties`` / ``max_caseload`` / ``bio`` 是 Phase 10 加的 counselor profile。
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class OrgMember(Base, CreatedAtOnlyMixin):
    __tablename__ = "org_members"

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
    role: Mapped[str] = mapped_column(Text)  # legacy: org_admin | counselor | client
    role_v2: Mapped[str | None] = mapped_column(Text)
    principal_class: Mapped[str | None] = mapped_column(Text)
    access_profile: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    permissions: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    status: Mapped[str] = mapped_column(Text, server_default=text("'active'"))
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # supervisor_id 故意不加 FK — Drizzle 注释明确为软关联 (跨 org / 离任后悬空)
    supervisor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    full_practice_access: Mapped[bool] = mapped_column(server_default=text("false"))
    source_partnership_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    certifications: Mapped[list[Any] | None] = mapped_column(
        JSONB, server_default=text("'[]'::jsonb")
    )
    specialties: Mapped[list[str] | None] = mapped_column(
        ARRAY(Text), server_default=text("'{}'::text[]")
    )
    max_caseload: Mapped[int | None] = mapped_column(Integer)
    bio: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        Index("uq_org_members_org_user", "org_id", "user_id", unique=True),
        Index("idx_org_members_org", "org_id"),
        Index("idx_org_members_user", "user_id"),
    )
