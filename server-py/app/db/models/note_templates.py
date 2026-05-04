"""
``note_templates`` — 会谈记录模板 (知识库 6 类之一, SOAP/DAP/BIRP/自定义)。

Drizzle 源: ``server/src/db/schema.ts:358-375``

业务语义:
  - ``format``: soap / dap / birp / custom (4 种结构化笔记格式)
  - ``field_definitions`` JSONB: ``[{key, label, placeholder, required, order}]``
    定义 custom 格式有哪些字段 (SOAP/DAP/BIRP 字段固定, custom 才用此)
  - ``is_default``: 该机构 / 平台默认模板 (写笔记时 prefill)
  - ``visibility``: personal / organization / public (与其他知识库表一致)
  - ``allowed_org_ids`` JSONB: 平台级模板的跨机构白名单

org_id 可空 — 平台级模板 (system_admin 维护)。
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import TimestampMixin


class NoteTemplate(Base, TimestampMixin):
    __tablename__ = "note_templates"

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
    format: Mapped[str] = mapped_column(Text)
    field_definitions: Mapped[list[Any]] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    is_default: Mapped[bool] = mapped_column(server_default=text("false"))
    visibility: Mapped[str] = mapped_column(Text, server_default=text("'personal'"))
    allowed_org_ids: Mapped[list[Any] | None] = mapped_column(
        JSONB, server_default=text("'[]'::jsonb")
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )

    __table_args__ = (Index("idx_note_templates_org", "org_id", "format"),)
