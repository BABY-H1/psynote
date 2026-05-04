"""
``users`` — 用户主表 (跨 OrgType + Principal 的人员单一身份)。

Drizzle 源: ``server/src/db/schema.ts:21-36``
被 27+ 张表 FK 引用 (org_members / client_profiles / care_episodes / ...)。

设计要点:
  - **email nullable**: 邀请未注册 / 匿名 portal 账号允许无邮箱; 但若有必须 unique。
  - **password_hash nullable**: OAuth / 邀请未设密码的账号 allow NULL; 登录时
    路由层校验 (见 ``app.core.security.verify_password`` Phase 1.1)。
  - **故意没有 updated_at**: 与 Drizzle 一致 — 改名/改 avatar 不算 user 实体变更,
    profile 类信息有 ``client_profiles`` / ``school_student_profiles`` 等专表。
  - **is_guardian_account**: 家长账号标记 (Phase 14, 见 Drizzle 注释), 影响
    UI 排序 (避免家长账号混入来访者列表) + 派生 RoleV2 (``legacy_role_to_v2``)。
  - **is_system_admin**: 平台超管, RBAC 中走 bypass (见 ``app/middleware/authorize.py``)。
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class User(Base, CreatedAtOnlyMixin):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    email: Mapped[str | None] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    password_hash: Mapped[str | None] = mapped_column(Text)
    avatar_url: Mapped[str | None] = mapped_column(Text)
    is_system_admin: Mapped[bool] = mapped_column(server_default=text("false"))
    is_guardian_account: Mapped[bool] = mapped_column(server_default=text("false"))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
