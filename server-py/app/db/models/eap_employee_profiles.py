"""
``eap_employee_profiles`` — EAP 员工档案 (企业内 user 的扩展信息)。

Drizzle 源: ``server/src/db/schema.ts:1163-1175``

业务语义:
  - 一行 = 一个 user 在某企业 org 的员工身份信息
  - ``employee_id``: 员工号 (企业内唯一标识, 与 user.id 区分)
  - ``department``: 部门 (用于按部门统计 eap_usage_events)
  - ``entry_method``: qr_code / link / sso / hr_import (注册方式)
  - ``is_anonymous``: 匿名访问标志 (员工不愿暴露身份给企业 HR)

唯一约束: 同 (org, user) 不能重复 — 一个 user 在一个企业只 1 行档案。
索引:
  - 唯一: (org, user)
  - ``idx_eap_employees_org_dept``: 按部门统计用
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class EAPEmployeeProfile(Base):
    __tablename__ = "eap_employee_profiles"

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
    employee_id: Mapped[str | None] = mapped_column(Text)
    department: Mapped[str | None] = mapped_column(Text)
    entry_method: Mapped[str | None] = mapped_column(Text, server_default=text("'link'"))
    is_anonymous: Mapped[bool] = mapped_column(server_default=text("false"))
    registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    __table_args__ = (
        Index("uq_eap_employees_org_user", "org_id", "user_id", unique=True),
        Index("idx_eap_employees_org_dept", "org_id", "department"),
    )
