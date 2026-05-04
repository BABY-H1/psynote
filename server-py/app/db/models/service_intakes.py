"""
``service_intakes`` — 服务申请入口 (Phase 10 引入, 来访者通过 portal 提交服务申请)。

Drizzle 源: ``server/src/db/schema.ts:1080-1095``

业务语义:
  - 一行 = 一个客户对某机构服务的申请 (e.g. "申请咨询" / "申请家庭咨询")
  - ``service_id``: 服务标识 (机构定义的服务键, text 类型而非 FK — 灵活扩展)
  - ``preferred_counselor_id``: 客户偏好的咨询师 (软关联, **不加 FK** — 可能跨机构)
  - ``intake_source``: 默认 'org_portal' (机构 portal 提交); 其它 'eap_link' / 'admin_create' 等
  - ``intake_data`` JSONB: 申请表单数据 (人口学 / 主诉 / 紧急程度 等)
  - ``status``: pending / assigned / cancelled
  - ``assigned_counselor_id``: 分配的咨询师 (软关联, **不加 FK**)
  - ``assigned_at``: 分配时间

cascade: org 删除 → intake 全删 (机构注销, 申请无意义)。
索引:
  - ``idx_service_intakes_org``: 按 org 查
  - ``idx_service_intakes_status``: (org, status) 查待处理
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


class ServiceIntake(Base, CreatedAtOnlyMixin):
    __tablename__ = "service_intakes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )
    service_id: Mapped[str] = mapped_column(Text)
    client_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    # preferred / assigned counselor — Drizzle 端无 .references, 软关联
    preferred_counselor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    intake_source: Mapped[str] = mapped_column(Text, server_default=text("'org_portal'"))
    intake_data: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, server_default=text("'{}'::jsonb")
    )
    status: Mapped[str] = mapped_column(Text, server_default=text("'pending'"))
    assigned_counselor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index("idx_service_intakes_org", "org_id"),
        Index("idx_service_intakes_status", "org_id", "status"),
    )
