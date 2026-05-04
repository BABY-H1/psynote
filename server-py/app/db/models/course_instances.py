"""
``course_instances`` — 课程模板的实例化 (机构具体开班), 类似 group_instances。

Drizzle 源: ``server/src/db/schema.ts:860-881``

业务语义:
  - 一行 = 一个机构按某课程模板开的一期班 (e.g. "高一 (3) 班 — 心理健康课程 第 1 期")
  - ``publish_mode``: assign (定向指派) / class (按班级批量) / public (面向所有人)
  - ``status``: draft / active / closed / archived
  - ``capacity``: 人数上限
  - ``target_group_label``: 自由文本目标群体说明 (e.g. "高一新生")
  - ``responsible_id``: 课程负责人 (可与课程作者不同)
  - ``assessment_config`` JSONB: 该实例使用的评估配置
  - ``schedule``: 排期 (cron / 文本描述)

cascade: org / course 删除 → instance 全删。
索引:
  - ``idx_course_instances_org``: (org, status) 按机构筛活跃班
  - ``idx_course_instances_course``: 按 course_id 查"该课程在哪些机构开了"
"""

from __future__ import annotations

import uuid
from datetime import date as date_type
from typing import Any

from sqlalchemy import Date, ForeignKey, Index, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import TimestampMixin


class CourseInstance(Base, TimestampMixin):
    __tablename__ = "course_instances"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courses.id", ondelete="CASCADE"),
    )
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    publish_mode: Mapped[str] = mapped_column(Text, server_default=text("'assign'"))
    status: Mapped[str] = mapped_column(Text, server_default=text("'draft'"))
    capacity: Mapped[int | None] = mapped_column(Integer)
    target_group_label: Mapped[str | None] = mapped_column(Text)
    responsible_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    assessment_config: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, server_default=text("'{}'::jsonb")
    )
    location: Mapped[str | None] = mapped_column(Text)
    start_date: Mapped[date_type | None] = mapped_column(Date)
    schedule: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )

    __table_args__ = (
        Index("idx_course_instances_org", "org_id", "status"),
        Index("idx_course_instances_course", "course_id"),
    )
