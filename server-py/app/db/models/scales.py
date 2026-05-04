"""
``scales`` — 心理测量量表 (assessment 域根, 知识库 6 类之一)。

Drizzle 源: ``server/src/db/schema.ts:118-130``

业务语义:
  - 一张 ``scale`` 对应一份完整量表 (e.g. PHQ-9, GAD-7, SCL-90)
  - 子表: ``scale_dimensions`` (维度) → ``dimension_rules`` (分级规则) + ``scale_items`` (题目)
  - 与 ``assessments`` 的关系: 一个 assessment 可包多个 scale (M:N 关联表 ``assessment_scales``)

知识库分发 (Phase 1 决策 2026-05-04):
  - ``org_id IS NULL`` → 平台级量表 (官方维护, 跨所有机构可见)
  - ``org_id = X`` → X 机构自建量表
  - ``is_public=true`` → 全平台公开
  - ``allowed_org_ids JSONB array`` → 显式授权给指定机构 (system_admin 走 admin UI 配)
  - 启动期不做带期限授权; ``knowledge_grants`` 表移到 Phase 7+

权限读取逻辑 (Phase 3+ 实装):
  ``WHERE org_id = my_org OR (org_id IS NULL AND is_public=true) OR
         my_org = ANY(allowed_org_ids::uuid[])``
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import TimestampMixin


class Scale(Base, TimestampMixin):
    __tablename__ = "scales"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    # nullable: 平台级量表 org_id IS NULL (无 ondelete: 默认 NO ACTION)
    org_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
    )
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    instructions: Mapped[str | None] = mapped_column(Text)
    scoring_mode: Mapped[str] = mapped_column(Text, server_default=text("'sum'"))
    is_public: Mapped[bool] = mapped_column(server_default=text("false"))
    allowed_org_ids: Mapped[list[Any] | None] = mapped_column(
        JSONB, server_default=text("'[]'::jsonb")
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
