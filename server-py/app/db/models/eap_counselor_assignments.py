"""
``eap_counselor_assignments`` — EAP 咨询师调度 (服务方咨询师被派到企业 org 服务)。

Drizzle 源: ``server/src/db/schema.ts:1147-1161``

业务语义:
  - 一行 = 一个咨询师在某 partnership 下被派到某企业 org 服务
  - 用于"服务方派 N 位咨询师服务一家企业" 的场景
  - ``status``: active / removed
  - ``assigned_by`` / ``assigned_at`` / ``removed_at``: 派遣 / 撤销审计

唯一约束: 同 (enterprise, counselor) 不能重复活跃 (一个咨询师在一家企业只 1 个有效派遣)。
索引: 双向各一 (按咨询师查派遣 / 按企业查咨询师列表)。
cascade: partnership / counselor / 任一 org 删除 → 派遣随删。
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class EAPCounselorAssignment(Base):
    __tablename__ = "eap_counselor_assignments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    partnership_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("eap_partnerships.id", ondelete="CASCADE"),
    )
    counselor_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
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
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    assigned_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index(
            "uq_eap_assignments_enterprise_counselor",
            "enterprise_org_id",
            "counselor_user_id",
            unique=True,
        ),
        Index("idx_eap_assignments_counselor", "counselor_user_id", "status"),
        Index("idx_eap_assignments_enterprise", "enterprise_org_id", "status"),
    )
