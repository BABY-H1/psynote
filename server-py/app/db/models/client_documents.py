"""
``client_documents`` — 文书 (知情同意 / 数据收集 / AI 处理同意书 等), 客户签署存证。

Drizzle 源: ``server/src/db/schema.ts:458-485``

业务语义:
  - 一行 = 一份发给客户签的文书
  - ``content``: 完整文书文本 (从 consent_template 拷贝过来 — 模板更新后存量已发不变)
  - ``consent_type``: treatment / data_collection / ai_processing / ...
  - ``recipient_type``: 'client' (默认, 发给来访者本人) / 'guardian' (发给家长)
    Phase 13 危机处置工作流引入。当 ``recipient_type='guardian'`` 时, 客户端 portal
    不会展示给来访者
  - ``recipient_name``: 监护人姓名/关系 (e.g. "母亲 王某"), 仅 guardian 时填
  - ``status``: pending / signed / declined / cancelled
  - ``signature_data`` JSONB: ``{name, ip, userAgent, timestamp}`` 留证数据

template_id 故意不加 FK — Drizzle 注释明确"FK added after consentTemplates table is created"
(consent_templates 在更后面定义, 跨表延迟引用)。SQLAlchemy 端走字符串引用, 不存在该问题。
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class ClientDocument(Base, CreatedAtOnlyMixin):
    __tablename__ = "client_documents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    care_episode_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("care_episodes.id"),
    )
    # template_id: Drizzle 端无 .references, 软关联到 consent_templates
    template_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    title: Mapped[str] = mapped_column(Text)
    content: Mapped[str | None] = mapped_column(Text)
    doc_type: Mapped[str | None] = mapped_column(Text)
    consent_type: Mapped[str | None] = mapped_column(Text)
    recipient_type: Mapped[str] = mapped_column(Text, server_default=text("'client'"))
    recipient_name: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, server_default=text("'pending'"))
    signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    signature_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    file_path: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )

    __table_args__ = (Index("idx_client_documents_client", "org_id", "client_id", "status"),)
