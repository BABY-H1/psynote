"""
``group_enrollments`` — 用户报名某 group_instance 的关系表。

Drizzle 源: ``server/src/db/schema.ts:666-677``

业务语义:
  - 一行 = 一个用户报名了一个团辅实例
  - ``status``: pending → screening → enrolled → attending → completed / dropped
  - ``screening_result_id``: 筛选阶段提交的入组测评 (可 NULL — 自动审批的团没用筛选)
  - ``care_episode_id``: 关联到该客户的咨询 episode (可 NULL — 单独参团不走个咨)
  - ``enrolled_at``: 正式入组时间 (与 ``created_at`` 区分: 后者是报名提交时间)

唯一约束: 同 instance 同 user 只能 1 行 (防重复报名)。

无 ``updated_at`` (CreatedAtOnlyMixin): status 改变更新这行, 但业务上视作 status 变迁
事件 (走 ``group_session_attendance`` / 业务表), 不依赖 updated_at 时间戳。
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class GroupEnrollment(Base, CreatedAtOnlyMixin):
    __tablename__ = "group_enrollments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    instance_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("group_instances.id", ondelete="CASCADE"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    care_episode_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("care_episodes.id"),
    )
    status: Mapped[str] = mapped_column(Text, server_default=text("'pending'"))
    # 注: assessment_results 表在 Batch 4 才建模, 这里用字符串延迟引用避免 import 顺序
    screening_result_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assessment_results.id"),
    )
    enrolled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index(
            "uq_group_enrollments_instance_user",
            "instance_id",
            "user_id",
            unique=True,
        ),
    )
