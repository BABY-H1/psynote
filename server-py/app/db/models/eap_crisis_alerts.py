"""
``eap_crisis_alerts`` — EAP 危机告警 (员工危机情况 → 通知企业方相关方)。

Drizzle 源: ``server/src/db/schema.ts:1193-1207``

业务语义:
  - 一行 = 一次危机事件 (counselor 触发, 系统通知企业方)
  - ``crisis_type``: self_harm / harm_others / abuse
  - ``description``: 危机描述 (PHI, 仅指定人可见)
  - ``notified_contacts`` JSONB: 已通知的紧急联系人 (家属 / HR / 安全部门)
  - ``status``: open / handling / resolved
  - ``resolution_notes``: 处置结果

cascade: enterprise_org / employee 删除 → 危机告警随删 (与员工实体一起注销)。
索引: ``idx_eap_crisis_org`` on (enterprise_org, status) 用于企业 HR 面板查 open 告警。
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import TimestampMixin


class EAPCrisisAlert(Base, TimestampMixin):
    __tablename__ = "eap_crisis_alerts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    enterprise_org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )
    employee_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
    )
    counselor_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    crisis_type: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    notified_contacts: Mapped[list[Any] | None] = mapped_column(
        JSONB, server_default=text("'[]'::jsonb")
    )
    status: Mapped[str] = mapped_column(Text, server_default=text("'open'"))
    resolution_notes: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (Index("idx_eap_crisis_org", "enterprise_org_id", "status"),)
