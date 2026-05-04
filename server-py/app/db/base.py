"""
SQLAlchemy 2.0 共享 Mixin 与 declarative 风格规范。

所有 ORM 模型继承 ``Base`` (从 ``app.core.database`` 导入), 同时按需 mix in
``TimestampMixin`` 或 ``CreatedAtOnlyMixin`` 拿到 created_at/updated_at 列。

Drizzle → SQLAlchemy 类型映射对照 (常见情形):
  uuid('x').primaryKey().defaultRandom()    → ``Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())``
  text('x').notNull()                       → ``Mapped[str] = mapped_column(Text)``
  text('x')                                 → ``Mapped[str | None] = mapped_column(Text)``
  text('x').unique()                        → ``mapped_column(Text, unique=True)``
  text('x').notNull().default('foo')        → ``mapped_column(Text, server_default=text("'foo'"))``
  boolean('x').notNull().default(false)     → ``Mapped[bool] = mapped_column(server_default=text("false"))``
  timestamp('x', { withTimezone: true })    → ``mapped_column(DateTime(timezone=True))``
  timestamp(...).defaultNow()               → ``server_default=func.now()``
  jsonb('x').notNull().default({})          → ``Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))``
  references(() => users.id, { onDelete: 'cascade' }) → ``ForeignKey('users.id', ondelete='CASCADE')``

设计选择:
  - **不显式写 ``nullable=``**. ``Mapped[str]`` 自动 → nullable=False;
    ``Mapped[str | None]`` 自动 → nullable=True. SQLAlchemy 2.0 优先从类型注解推断,
    保持单一来源。
  - **server_default vs default**: 优先 ``server_default`` (DDL 级 DEFAULT 子句),
    跟 Drizzle ``.default()`` 行为一致。Python 端 ``default=`` 仅在"必须 Python 计算"
    场景用 (e.g. 复杂 dataclass 默认值)。
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import Mapped, mapped_column


class TimestampMixin:
    """``created_at`` + ``updated_at`` (绝大多数业务表用此)。

    updated_at 走 ``onupdate=func.now()`` — SQLAlchemy 在 UPDATE 语句里自动塞
    ``updated_at = NOW()``. 跟 Drizzle 端默认行为一致 (不依赖 DB trigger)。
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class CreatedAtOnlyMixin:
    """只有 ``created_at`` 没有 ``updated_at`` (audit / log / token 类表)。

    例: ``users`` (Drizzle 故意没 updated_at, 改名/改邮箱不算 user 实体变更),
        ``audit_logs`` (append-only),
        ``password_reset_tokens`` (一次性 token, 不会更新)。
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


__all__ = ["CreatedAtOnlyMixin", "TimestampMixin"]
