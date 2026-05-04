"""
``referrals`` — 转介 (双向流程, Phase 9δ 大改: 状态机 + 数据包 + 客户同意)。

Drizzle 源: ``server/src/db/schema.ts:487-532``

状态机 (status):
  - pending    咨询师发起, 等客户同意
  - consented  客户同意, 等接收方接受 (或 external 模式拿 PDF)
  - accepted   接收方接受
  - rejected   接收方拒绝
  - completed  全流程结束
  - cancelled  发送方撤销 (consented 之前)

模式 (mode, Phase 9δ):
  - 'external'  生成 PDF + 一次性下载链接, 线下交接 (默认, 与现有兼容)
  - 'platform'  接收方是 psynote 用户/机构, 站内转介

数据包 (Phase 9δ):
  - ``data_package_spec`` JSONB: ``{sessionNoteIds, assessmentResultIds,
    treatmentPlanIds, includeChiefComplaint, includeRiskHistory}`` —
    咨询师选哪些临床记录共享给接收方
  - ``download_token`` + ``download_expires_at``: external 模式专用 (一次性下载链)

时间戳 (Phase 9δ): consented_at / accepted_at / rejected_at + rejection_reason。

索引: 3 个 — 按 episode / 按接收咨询师 / 按接收机构 各一。
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import TimestampMixin


class Referral(Base, TimestampMixin):
    __tablename__ = "referrals"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
    )
    care_episode_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("care_episodes.id"),
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    referred_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    reason: Mapped[str] = mapped_column(Text)
    risk_summary: Mapped[str | None] = mapped_column(Text)
    target_type: Mapped[str | None] = mapped_column(Text)
    target_name: Mapped[str | None] = mapped_column(Text)
    target_contact: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, server_default=text("'pending'"))
    follow_up_plan: Mapped[str | None] = mapped_column(Text)
    follow_up_notes: Mapped[str | None] = mapped_column(Text)
    mode: Mapped[str] = mapped_column(Text, server_default=text("'external'"))
    to_counselor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    to_org_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
    )
    data_package_spec: Mapped[dict[str, Any]] = mapped_column(
        JSONB, server_default=text("'{}'::jsonb")
    )
    consented_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    download_token: Mapped[str | None] = mapped_column(Text)
    download_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index("idx_referrals_episode", "care_episode_id"),
        Index("idx_referrals_to_counselor", "to_counselor_id", "status"),
        Index("idx_referrals_to_org", "to_org_id", "status"),
    )
