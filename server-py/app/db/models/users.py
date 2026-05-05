"""
``users`` — 用户主表 (跨 OrgType + Principal 的人员单一身份)。

Drizzle 源: ``server/src/db/schema.ts:21-36``
被 27+ 张表 FK 引用 (org_members / client_profiles / care_episodes / ...)。

设计要点:
  - **email nullable**: 邀请未注册 / 匿名 portal 账号允许无邮箱; 但若有必须 unique。
  - **phone nullable**: Phase 5 决策 2026-05-04 — 国内市场切手机号登录, 但保留邮箱
    向后兼容 (legacy / 通知用途)。phone 非 NULL 时 partial unique。短信验证 Phase 7+
    才加, 现在 phone_verified 默认 false。
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

from sqlalchemy import DateTime, Index, Text, func, text
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
    # Phase 5 (2026-05-04): 国内市场全切手机号. partial unique (phone IS NOT NULL),
    # 由 Index(...postgresql_where=...) 表达; SQLA Column.unique=True 是全局 unique,
    # 不能容许多行 NULL — 所以这里不在列上加 unique=True, 改用 __table_args__ 中的
    # partial unique index. Migration 0002 同步建索引。
    phone: Mapped[str | None] = mapped_column(Text)
    phone_verified: Mapped[bool] = mapped_column(server_default=text("false"))
    name: Mapped[str] = mapped_column(Text)
    password_hash: Mapped[str | None] = mapped_column(Text)
    avatar_url: Mapped[str | None] = mapped_column(Text)
    is_system_admin: Mapped[bool] = mapped_column(server_default=text("false"))
    is_guardian_account: Mapped[bool] = mapped_column(server_default=text("false"))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        # phone 非 NULL 时唯一 (postgres partial unique index)
        Index(
            "uq_users_phone",
            "phone",
            unique=True,
            postgresql_where=text("phone IS NOT NULL"),
        ),
    )
