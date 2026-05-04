"""
``treatment_goal_library`` — 治疗目标知识库 (知识库 6 类之一, 跟 scales/note_templates
等共用分发字段)。

Drizzle 源: ``server/src/db/schema.ts:440-456``

业务语义:
  - 一行 = 一个治疗目标模板, 咨询师写治疗计划时从此处选
  - ``problem_area``: anxiety / depression / relationship / trauma / self_esteem /
    grief / anger / substance / other (临床问题大类)
  - ``category``: short_term / long_term
  - ``objectives_template`` JSONB: 该目标下的可量化子目标建议
  - ``intervention_suggestions`` JSONB: 配套干预手段建议
  - ``visibility`` / ``allowed_org_ids``: 与其他知识库表一致的分发机制

org_id 可空 — 平台级 (system_admin 维护)。
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import TimestampMixin


class TreatmentGoalLibrary(Base, TimestampMixin):
    __tablename__ = "treatment_goal_library"

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
    description: Mapped[str | None] = mapped_column(Text)
    problem_area: Mapped[str] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(Text)
    objectives_template: Mapped[list[Any]] = mapped_column(
        JSONB, server_default=text("'[]'::jsonb")
    )
    intervention_suggestions: Mapped[list[Any]] = mapped_column(
        JSONB, server_default=text("'[]'::jsonb")
    )
    visibility: Mapped[str] = mapped_column(Text, server_default=text("'personal'"))
    allowed_org_ids: Mapped[list[Any] | None] = mapped_column(
        JSONB, server_default=text("'[]'::jsonb")
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )

    __table_args__ = (Index("idx_goal_library_org", "org_id", "problem_area"),)
