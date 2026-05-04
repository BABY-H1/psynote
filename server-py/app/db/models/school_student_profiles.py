"""
``school_student_profiles`` — 学生档案扩展 (学校 org 用户的扩展信息)。

Drizzle 源: ``server/src/db/schema.ts:1224-1239``

业务语义:
  - 一行 = 学生 user 在学校 org 的扩展档案
  - ``student_id``: 学籍号
  - ``grade`` / ``class_name``: 冗余记录 (与 school_classes 软关联, 学生跳级/分班需 sync)
  - ``parent_name`` / ``parent_phone`` / ``parent_email``: 家长基本信息 (合规字段)
  - ``entry_method``: 默认 'import' (批量导入); 其它 'qr_code' / 'self_register'

唯一约束: 同 (org, user) 不能重复。
索引: ``idx_school_students_org_grade`` 按年级查学生。
cascade: org / user 删除 → 档案随删。
"""

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class SchoolStudentProfile(Base, CreatedAtOnlyMixin):
    __tablename__ = "school_student_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
    )
    student_id: Mapped[str | None] = mapped_column(Text)
    grade: Mapped[str | None] = mapped_column(Text)
    class_name: Mapped[str | None] = mapped_column(Text)
    parent_name: Mapped[str | None] = mapped_column(Text)
    parent_phone: Mapped[str | None] = mapped_column(Text)
    parent_email: Mapped[str | None] = mapped_column(Text)
    entry_method: Mapped[str | None] = mapped_column(Text, server_default=text("'import'"))

    __table_args__ = (
        Index("uq_school_students_org_user", "org_id", "user_id", unique=True),
        Index("idx_school_students_org_grade", "org_id", "grade"),
    )
