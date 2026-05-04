"""
``enrollment_block_responses`` — 学员/参与者对单个内容块的响应记录 (polymorphic)。

Drizzle 源: ``server/src/db/schema.ts:841-858``

polymorphic 设计:
  - ``enrollment_id`` + ``enrollment_type`` 组合 — type='course' 时指 course_enrollments.id,
    'group' 时指 group_enrollments.id
  - ``block_id`` + ``block_type`` 类似 — type 决定指 course_content_blocks 还是
    group_session_blocks
  - **故意不加 FK** 给 enrollment_id / block_id (跨表多态, 业务侧维持引用完整性)

业务语义:
  - 一行 = 一个 enrollment 在某 block 的完成/响应状态
  - ``response`` JSONB nullable: 自由表达 (reflection/worksheet 提交) 或 NULL (单纯 "已看过" 标记)
  - ``safety_flags`` JSONB: 关键词扫描结果 (e.g. 自伤词 → 触发咨询师审核)
  - ``reviewed_by_counselor`` + ``reviewed_at``: 咨询师审核标志

唯一约束: 同 (enrollment_id, enrollment_type, block_id) 不能重复。
索引:
  - ``idx_enrollment_block_responses_enrollment`` 按 enrollment 查全部 response
  - ``idx_enrollment_block_responses_safety`` 按 reviewed_by_counselor 查待审名单
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Index, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import TimestampMixin


class EnrollmentBlockResponse(Base, TimestampMixin):
    __tablename__ = "enrollment_block_responses"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    # polymorphic: enrollment_type='course' → course_enrollments.id;
    #              enrollment_type='group'  → group_enrollments.id
    # 故意不加 FK 约束
    enrollment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    enrollment_type: Mapped[str] = mapped_column(Text)
    # polymorphic: block_type 决定指 course_content_blocks / group_session_blocks
    # 故意不加 FK 约束
    block_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    block_type: Mapped[str] = mapped_column(Text)
    response: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    safety_flags: Mapped[list[Any]] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    reviewed_by_counselor: Mapped[bool] = mapped_column(server_default=text("false"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index(
            "uq_enrollment_block_response",
            "enrollment_id",
            "enrollment_type",
            "block_id",
            unique=True,
        ),
        Index(
            "idx_enrollment_block_responses_enrollment",
            "enrollment_id",
            "enrollment_type",
        ),
        Index("idx_enrollment_block_responses_safety", "reviewed_by_counselor"),
    )
