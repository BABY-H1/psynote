"""
``eap_partnerships`` — EAP 企业 ↔ 服务方 合作关系 (eap 域核心)。

Drizzle 源: ``server/src/db/schema.ts:1128-1145``

业务语义:
  - 一行 = 一个企业 org 与一个服务提供商 org 的合作合同
  - ``enterprise_org_id``: 企业方 (买 EAP 服务的公司)
  - ``provider_org_id``: 服务方 (psynote 上提供咨询服务的机构)
  - ``status``: active / suspended / expired
  - ``contract_start`` / ``contract_end``: 合同期
  - ``seat_allocation``: 座席数 (员工可用咨询次数上限)
  - ``service_scope`` JSONB: 服务范围 (含哪些咨询模式 / 危机响应 / 等)

唯一约束: 同 (enterprise, provider) 不能重复 (1 对 1 合作期内只 1 行)。
索引: 双向各一 (按企业方查 / 按服务方查)。
cascade: 任一方注销 → 合作关系随删。
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import TimestampMixin


class EAPPartnership(Base, TimestampMixin):
    __tablename__ = "eap_partnerships"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    enterprise_org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )
    provider_org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )
    status: Mapped[str] = mapped_column(Text, server_default=text("'active'"))
    contract_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    contract_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    seat_allocation: Mapped[int | None] = mapped_column(Integer)
    service_scope: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )

    __table_args__ = (
        Index(
            "uq_eap_partnerships_enterprise_provider",
            "enterprise_org_id",
            "provider_org_id",
            unique=True,
        ),
        Index("idx_eap_partnerships_enterprise", "enterprise_org_id", "status"),
        Index("idx_eap_partnerships_provider", "provider_org_id", "status"),
    )
