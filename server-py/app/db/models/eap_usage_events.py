"""
``eap_usage_events`` — EAP 服务使用事件流 (按部门 / 按服务类型统计)。

Drizzle 源: ``server/src/db/schema.ts:1177-1191``

业务语义:
  - 一行 = 一次 EAP 服务使用 (员工做了测评 / 报了课 / 完成咨询 等)
  - ``event_type``: assessment_completed / course_enrolled / group_enrolled /
    group_participated / session_booked / session_completed / crisis_flagged
  - ``risk_level``: level_1...level_4 (危机告警事件用)
  - ``provider_org_id``: 提供服务的机构 (NULL = 自主完成的事件如自评)
  - ``metadata`` JSONB: 事件附加数据
  - ``event_date``: 事件业务日期 (date 类型, 与 created_at 区分 — 后者是写入时间)

cascade:
  - enterprise_org 删除 → 事件随删
  - user / provider_org 删除 → 字段置 NULL (事件保留, 用于历史统计)

索引: 双向各一 (按 type+date / 按 dept+date) 方便管理后台仪表盘。
"""

from __future__ import annotations

import uuid
from datetime import date as date_type
from typing import Any

from sqlalchemy import Date, ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class EAPUsageEvent(Base, CreatedAtOnlyMixin):
    __tablename__ = "eap_usage_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    enterprise_org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )
    event_type: Mapped[str] = mapped_column(Text)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    department: Mapped[str | None] = mapped_column(Text)
    risk_level: Mapped[str | None] = mapped_column(Text)
    provider_org_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="SET NULL"),
    )
    metadata_: Mapped[dict[str, Any] | None] = mapped_column(
        "metadata", JSONB, server_default=text("'{}'::jsonb")
    )
    event_date: Mapped[date_type] = mapped_column(
        Date,
        server_default=func.now(),
    )

    __table_args__ = (
        Index(
            "idx_eap_events_org_type_date",
            "enterprise_org_id",
            "event_type",
            "event_date",
        ),
        Index(
            "idx_eap_events_org_dept_date",
            "enterprise_org_id",
            "department",
            "event_date",
        ),
    )
