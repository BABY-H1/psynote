"""
``courses`` — 课程主表 (心理课 / 团辅活动 / 工作坊, 知识库 6 类之一)。

Drizzle 源: ``server/src/db/schema.ts:707-732``

业务语义:
  - course = 一个完整心理教育课程的"模板"或"实例" (用 ``is_template`` 区分)
  - 模板课 → 通过 ``courses_instances`` 派生实例 (机构具体开课)
  - 课程结构: ``course_chapters`` (章节) → ``course_lesson_blocks`` /
    ``course_content_blocks`` (内容块)

知识库分发 (与 ``scales`` 同套机制):
  - ``org_id IS NULL`` → 平台级
  - ``is_public`` + ``allowed_org_ids`` → 跨机构白名单
  - 启动期: system_admin 走 admin UI"分发范围编辑器"维护 (Phase 1 决策 2026-05-04)

特殊字段:
  - ``status``: draft / blueprint / content_authoring / published / archived (5 阶段生命周期)
  - ``creation_mode``: 'ai_assisted' / 'manual' (AI 辅助生成 vs 手动)
  - ``course_type``: micro_course / series / group_facilitation / workshop
  - ``source_template_id``: 自引用 — 实例课指向其模板 (NULL = 不是从模板生成)
  - ``blueprint_data`` JSONB: AI 生成的章节蓝图, 用户审核后展开成 chapters
  - ``requirements_config`` JSONB: AI 生成时的结构化输入要求
  - ``responsible_id``: 课程负责人 (与 created_by 区分: 创建者 vs 当前负责人)
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import TimestampMixin


class Course(Base, TimestampMixin):
    __tablename__ = "courses"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    # nullable: 平台级课程 org_id IS NULL
    org_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
    )
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(Text)
    cover_url: Mapped[str | None] = mapped_column(Text)
    duration: Mapped[str | None] = mapped_column(Text)
    is_public: Mapped[bool] = mapped_column(server_default=text("false"))
    status: Mapped[str] = mapped_column(Text, server_default=text("'draft'"))
    creation_mode: Mapped[str] = mapped_column(Text, server_default=text("'manual'"))
    course_type: Mapped[str | None] = mapped_column(Text)
    target_audience: Mapped[str | None] = mapped_column(Text)
    scenario: Mapped[str | None] = mapped_column(Text)
    responsible_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    is_template: Mapped[bool] = mapped_column(server_default=text("false"))
    # 自引用: 实例课指向其模板课 (Drizzle 用 () => courses.id, SQLAlchemy 等价用字符串延迟解析)
    source_template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courses.id"),
    )
    requirements_config: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, server_default=text("'{}'::jsonb")
    )
    blueprint_data: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, server_default=text("'{}'::jsonb")
    )
    tags: Mapped[list[str] | None] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    allowed_org_ids: Mapped[list[Any] | None] = mapped_column(
        JSONB, server_default=text("'[]'::jsonb")
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
