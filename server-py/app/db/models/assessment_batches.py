"""
``assessment_batches`` — 批量发放测评 (e.g. "全校新生入学测评" / "员工年度心理普查")。

Drizzle 源: ``server/src/db/schema.ts:228-242``

业务语义:
  - 一行 = 一次批量发放任务
  - ``target_type`` + ``target_config`` 描述谁会被发到 (e.g. {type: 'class', class_ids: [...]})
  - ``stats`` JSONB 累计统计: ``{total: N, completed: M, avg_score: ...}``
  - 客户填完 → 生成 ``assessment_results`` 一行 + ``assessment_results.batch_id`` 反向关联

索引: ``idx_batches_org`` on (org_id, status) 用于"我机构当前在跑的批次"查询。
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


class AssessmentBatch(Base, CreatedAtOnlyMixin):
    __tablename__ = "assessment_batches"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
    )
    assessment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assessments.id"),
    )
    title: Mapped[str] = mapped_column(Text)
    target_type: Mapped[str | None] = mapped_column(Text)
    target_config: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(Text, server_default=text("'active'"))
    stats: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )

    __table_args__ = (Index("idx_batches_org", "org_id", "status"),)
