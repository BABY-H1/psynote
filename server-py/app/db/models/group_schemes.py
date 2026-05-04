"""
``group_schemes`` — 团辅方案模板 (知识库 6 类之一, group 域根)。

Drizzle 源: ``server/src/db/schema.ts:592-624``

业务语义:
  - 团辅方案 = 一套结构化团体辅导设计 (e.g. "8 周正念减压团辅"), 含目标 / 阶段 / 评估
  - 子表 ``group_scheme_sessions`` 是单次团辅 session 的详细设计
  - 派生 ``group_instances`` (机构实际开团), 实例化时拷贝结构 + 调整时间地点
  - 招募评估: ``recruitment_assessments`` 关联 assessments, 入团前先做筛选
  - 全程评估: ``overall_assessments`` 用于过程性纵向追踪 (前测 / 中测 / 后测)

知识库可见性 (Drizzle 用 ``visibility`` 字段, 与 ``scales`` 的 is_public 略有不同):
  - ``visibility = 'personal'``: 创建者本人可见
  - ``visibility = 'organization'``: 整个机构可见
  - ``visibility = 'public'``: 全平台 (system_admin 维护时常用)
  - ``allowed_org_ids``: 跨机构白名单 (与其他知识库表一致)

字段总览 (字段多, 按业务分组):
  - 基本: title / description / theory
  - 目标: overall_goal / specific_goals (string[])
  - 受众: target_audience / age_range / selection_criteria
  - 设置: recommended_size / total_sessions / session_duration / frequency
  - 主持评估: facilitator_requirements / evaluation_method / notes (含伦理 / 退出 / 危机预案)
  - 评估: recruitment_assessments (uuid[]) / overall_assessments (uuid[]) / screening_notes
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import TimestampMixin


class GroupScheme(Base, TimestampMixin):
    __tablename__ = "group_schemes"

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
    theory: Mapped[str | None] = mapped_column(Text)

    # 目标
    overall_goal: Mapped[str | None] = mapped_column(Text)
    specific_goals: Mapped[list[str] | None] = mapped_column(
        JSONB, server_default=text("'[]'::jsonb")
    )

    # 受众
    target_audience: Mapped[str | None] = mapped_column(Text)
    age_range: Mapped[str | None] = mapped_column(Text)
    selection_criteria: Mapped[str | None] = mapped_column(Text)

    # 设置
    recommended_size: Mapped[str | None] = mapped_column(Text)
    total_sessions: Mapped[int | None] = mapped_column(Integer)
    session_duration: Mapped[str | None] = mapped_column(Text)
    frequency: Mapped[str | None] = mapped_column(Text)

    # 主持人 + 评估
    facilitator_requirements: Mapped[str | None] = mapped_column(Text)
    evaluation_method: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)

    # 评估关联
    recruitment_assessments: Mapped[list[Any] | None] = mapped_column(
        JSONB, server_default=text("'[]'::jsonb")
    )
    overall_assessments: Mapped[list[Any] | None] = mapped_column(
        JSONB, server_default=text("'[]'::jsonb")
    )
    screening_notes: Mapped[str | None] = mapped_column(Text)

    # 知识库可见性
    visibility: Mapped[str] = mapped_column(Text, server_default=text("'personal'"))
    allowed_org_ids: Mapped[list[Any] | None] = mapped_column(
        JSONB, server_default=text("'[]'::jsonb")
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
