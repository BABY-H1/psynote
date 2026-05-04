"""
``school_classes`` — 学校班级 (school 域基础)。

Drizzle 源: ``server/src/db/schema.ts:1211-1222``

业务语义:
  - 一行 = 一个班级 (e.g. "高一 (3) 班")
  - ``grade``: 年级 (text — 可能是数字字符串 / 分中外学制)
  - ``class_name``: 班级名 ("3 班" / "实验班" 等)
  - ``homeroom_teacher_id``: 班主任 user (可空 — 老师离职 set null)
  - ``student_count``: 学生数 (业务侧 trigger 维护)

唯一约束: 同 (org, grade, class_name) 不能重复。
cascade: org 删除 → 班级随删; teacher 删除 → 班主任字段置 NULL (班级保留)。
"""

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Index, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class SchoolClass(Base, CreatedAtOnlyMixin):
    __tablename__ = "school_classes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )
    grade: Mapped[str] = mapped_column(Text)
    class_name: Mapped[str] = mapped_column(Text)
    homeroom_teacher_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    student_count: Mapped[int] = mapped_column(Integer, server_default=text("0"))

    __table_args__ = (
        Index(
            "uq_school_classes_org_grade_class",
            "org_id",
            "grade",
            "class_name",
            unique=True,
        ),
        Index("idx_school_classes_org", "org_id"),
    )
