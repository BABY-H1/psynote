"""
``session_notes`` — 会谈记录 (PHI 核心, counseling 域最关键 PHI 之一)。

Drizzle 源: ``server/src/db/schema.ts:377-406``

业务语义:
  - 一行 = 一次面询的会谈记录 (按 SOAP / DAP / BIRP / custom 格式)
  - SOAP 字段为内置 4 列 (subjective/objective/assessment/plan); 其它格式走 ``fields`` JSONB
  - ``status``: draft → finalized → submitted_for_review → reviewed (督导审签流)
  - ``supervisor_annotation``: 督导审签时的批注 (可能驳回)
  - ``submitted_for_review_at``: 提交审签时间, NULL = 未提交

PHI 级别: phi_full (含 subjective/objective/assessment 等临床记录)。

特别注意:
  - **没有 ``allowed_org_ids`` 字段** — Drizzle 注释明确: session_notes 是个人临床
    记录, 永不跨机构共享。之前 schema 曾误写过, 实际 DB 列没有 (migration 019
    只把这字段加到 scales/note_templates/treatment_goal_library/group_schemes/courses)
  - 没有 deleted_at — session_notes 是临床记录, 不允许软删除 (合规要求)
"""

from __future__ import annotations

import uuid
from datetime import date as date_type
from datetime import datetime
from typing import Any

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import TimestampMixin


class SessionNote(Base, TimestampMixin):
    __tablename__ = "session_notes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
    )
    care_episode_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("care_episodes.id"),
    )
    appointment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("appointments.id"),
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    counselor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    note_format: Mapped[str] = mapped_column(Text, server_default=text("'soap'"))
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("note_templates.id"),
    )
    session_date: Mapped[date_type] = mapped_column(Date)
    duration: Mapped[int | None] = mapped_column(Integer)
    session_type: Mapped[str | None] = mapped_column(Text)
    subjective: Mapped[str | None] = mapped_column(Text)
    objective: Mapped[str | None] = mapped_column(Text)
    assessment: Mapped[str | None] = mapped_column(Text)
    plan: Mapped[str | None] = mapped_column(Text)
    fields: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    summary: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[list[str] | None] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    status: Mapped[str] = mapped_column(Text, server_default=text("'draft'"))
    supervisor_annotation: Mapped[str | None] = mapped_column(Text)
    submitted_for_review_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
