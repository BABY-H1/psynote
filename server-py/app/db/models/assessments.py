"""
``assessments`` — 测评活动 (1 个 assessment = N 个 scale 的组合 + 业务规则)。

Drizzle 源: ``server/src/db/schema.ts:162-181``

业务语义:
  - assessment 是"测评活动"的容器, 真正题目在 ``scales`` (走 ``assessment_scales`` 关联)
  - 一个 assessment 可以有多个 scale (e.g. "新生入学测评" = SCL-90 + 焦虑自评 + 抑郁自评)
  - 业务流: 客户做完 → 生成 ``assessment_results`` 一行 → 自动应用 ``screening_rules`` 派生
    建议 / 危机告警

字段:
  - ``assessment_type``: screening / monitoring / discharge / etc
  - ``demographics`` JSONB: 测评前需填的人口学题 (姓名 / 年龄 / 班级 等)
  - ``blocks`` JSONB: 题型块组合 (scale 块 + 自定义文字 + 视频 等), 顺序排列
  - ``screening_rules`` JSONB: 自动判定规则 ``{conditions, actions}``, AI 推荐转介 / 危机
  - ``collect_mode``: anonymous / named / linked_to_user
  - ``result_display`` JSONB: 客户端结果页展示模式 (custom / standard) + 显示项配置
  - ``share_token``: 分享链接专用 token (公开测评)
  - ``deleted_at``: 软删除 (与 Drizzle 一致, 业务读取需过滤)
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import TimestampMixin

# Drizzle 端 result_display 默认 JSON 比较复杂 — 与 Drizzle 默认值字符串完全一致
_DEFAULT_RESULT_DISPLAY = (
    '\'{"mode": "custom", '
    '"show": ["totalScore", "riskLevel", "dimensionScores", '
    '"interpretation", "advice"]}\'::jsonb'
)


class Assessment(Base, TimestampMixin):
    __tablename__ = "assessments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
    )
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    assessment_type: Mapped[str] = mapped_column(Text, server_default=text("'screening'"))
    demographics: Mapped[list[Any]] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    blocks: Mapped[list[Any]] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    screening_rules: Mapped[dict[str, Any]] = mapped_column(
        JSONB, server_default=text("'{}'::jsonb")
    )
    collect_mode: Mapped[str] = mapped_column(Text, server_default=text("'anonymous'"))
    result_display: Mapped[dict[str, Any]] = mapped_column(
        JSONB, server_default=text(_DEFAULT_RESULT_DISPLAY)
    )
    share_token: Mapped[str | None] = mapped_column(Text)
    allow_client_report: Mapped[bool] = mapped_column(server_default=text("false"))
    status: Mapped[str] = mapped_column(Text, server_default=text("'draft'"))
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
