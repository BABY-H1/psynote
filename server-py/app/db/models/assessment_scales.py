"""
``assessment_scales`` — Assessment ↔ Scale M:N 关联表 (composite PK)。

Drizzle 源: ``server/src/db/schema.ts:183-189``

无独立 id 字段, 主键 = ``(assessment_id, scale_id)``。
``sort_order`` 决定多 scale 在 assessment 里的展示顺序。

cascade: assessment 删除时关联行删除; scale 删除被拒 (DEFAULT NO ACTION)。
"""

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Integer, PrimaryKeyConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AssessmentScale(Base):
    __tablename__ = "assessment_scales"

    assessment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assessments.id", ondelete="CASCADE"),
    )
    scale_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("scales.id"),
    )
    sort_order: Mapped[int] = mapped_column(Integer, server_default=text("0"))

    __table_args__ = (PrimaryKeyConstraint("assessment_id", "scale_id"),)
