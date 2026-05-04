"""
``client_access_grants`` — 一次性临时访问授权 (覆盖 ``client_assignments`` 默认范围)。

Drizzle 源: ``server/src/db/schema.ts:1112-1124``

业务场景:
  - A 咨询师休假, B 咨询师临时接 case → grant 一条 (granted_to=B, expires=休假结束)
  - 案例转介前的"知情阅读"授权 → granted_to=接收方, reason=转介准备
  - 督导审计需要查特定咨询记录 → 临时 grant + revoked_at 用毕回收

字段:
  - ``granted_to_counselor_id``: 被授权的咨询师 (可能不在 ``client_assignments`` 里)
  - ``granted_by``: 操作人 (org_admin / 主咨询师, 走 audit 关联)
  - ``reason``: 必填, 后续合规审计能查"为什么发的授权"
  - ``expires_at``: 软过期, 业务读取时必须过滤 ``NOW() < expires_at OR expires_at IS NULL``
  - ``revoked_at``: 提前撤销, 同上过滤

权限解析: 见 ``app.middleware.data_scope.resolve_data_scope`` 的"assigned" 分支
扩展点 (Phase 3+ 接通)。

无 ``updated_at``: grant 只有"发出/撤销/过期", 不就地改字段 → CreatedAtOnlyMixin。
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class ClientAccessGrant(Base, CreatedAtOnlyMixin):
    __tablename__ = "client_access_grants"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    granted_to_counselor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    granted_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    reason: Mapped[str] = mapped_column(Text)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index(
            "uq_client_access_grants_org_client_counselor",
            "org_id",
            "client_id",
            "granted_to_counselor_id",
            unique=True,
        ),
    )
