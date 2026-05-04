"""
``consent_records`` — 同意书签署记录 (PHI 关键合规证据链)。

Drizzle 源: ``server/src/db/schema.ts:1058-1076``

业务语义:
  - 一行 = 一个客户对某类同意的当前状态 (granted / revoked / expired)
  - ``consent_type``: treatment / data_collection / ai_processing / ...
  - ``scope`` JSONB: 同意范围 (e.g. ``{aiPipelines: ['triage', 'soap'], dataSharing: false}``)
  - ``granted_at`` / ``revoked_at`` / ``expires_at``: 同意生命周期 (3 个独立时间戳)
  - ``document_id``: 关联具体签署的 client_document (NULL = 业务直接登记同意未走文书)
  - ``signer_on_behalf_of``: Phase 14 — 家长代孩子签时, 此字段记签字人 (家长) 的 user.id;
    ``client_id`` 仍是孩子. 默认 NULL = 来访者本人签的
  - ``status``: active / revoked / expired (业务状态, DB 不强约束)

无 ``updated_at`` (CreatedAtOnlyMixin): 状态变更通过新建记录或 revoked_at 时间戳追踪,
不依赖 updated_at。
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class ConsentRecord(Base, CreatedAtOnlyMixin):
    __tablename__ = "consent_records"

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
    consent_type: Mapped[str] = mapped_column(Text)
    scope: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    granted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("client_documents.id"),
    )
    signer_on_behalf_of: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    status: Mapped[str] = mapped_column(Text, server_default=text("'active'"))
