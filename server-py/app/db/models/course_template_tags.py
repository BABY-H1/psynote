"""
``course_template_tags`` — 机构级课程模板标签 (筛选课程用)。

Drizzle 源: ``server/src/db/schema.ts:782-790``

业务语义:
  - 一行 = 一个机构定义的标签 (e.g. "焦虑" / "亲子" / "新生入学")
  - ``color``: 标签颜色 (hex / 预设色名), 前端展示用
  - 用法: courses.tags JSONB 引用本表 name 字段 (软关联)

唯一约束: 同 (org_id, name) 不能重复。
"""

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Index, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class CourseTemplateTag(Base, CreatedAtOnlyMixin):
    __tablename__ = "course_template_tags"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
    )
    name: Mapped[str] = mapped_column(Text)
    color: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (Index("uq_course_template_tags_org_name", "org_id", "name", unique=True),)
