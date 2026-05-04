"""
``consent_templates`` — 知情同意书模板 (知识库 6 类之一, 与其他知识库共用分发字段)。

Drizzle 源: ``server/src/db/schema.ts:1040-1056``

业务语义:
  - 一行 = 一份同意书模板 (e.g. "心理咨询知情同意书 / 数据收集同意 / AI 处理同意")
  - ``consent_type``: treatment / data_collection / ai_processing / data_sharing / research
  - ``content``: 模板正文 (用 ClientDocument 拷贝下发)
  - ``visibility`` / ``allowed_org_ids``: 跨机构分发机制 (与 scales/note_templates 一致)

org_id 可空 — 平台级模板 (system_admin 维护, Migration 023 引入)。
索引: ``idx_consent_templates_org`` on (org_id, consent_type)。
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import TimestampMixin


class ConsentTemplate(Base, TimestampMixin):
    __tablename__ = "consent_templates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
    )
    title: Mapped[str] = mapped_column(Text)
    consent_type: Mapped[str] = mapped_column(Text)
    content: Mapped[str] = mapped_column(Text)
    visibility: Mapped[str] = mapped_column(Text, server_default=text("'personal'"))
    allowed_org_ids: Mapped[list[Any] | None] = mapped_column(
        JSONB, server_default=text("'[]'::jsonb")
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )

    __table_args__ = (Index("idx_consent_templates_org", "org_id", "consent_type"),)
