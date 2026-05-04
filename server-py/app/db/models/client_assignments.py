"""
``client_assignments`` — 来访者 ↔ 咨询师分配关系 (DataScope 'assigned' 范围核心)。

Drizzle 源: ``server/src/db/schema.ts:1099-1110``

设计要点:
  - 决定咨询师能看哪些客户 (``data_scope.py`` ``allowed_client_ids`` 来源之一)。
  - ``isPrimary``: 一个客户可能有多咨询师 (主咨询师 + 实习生 + 督导), 标记主负责人。
  - ``client_id`` / ``counselor_id`` 故意不加 ``ondelete=CASCADE`` (Drizzle 一致):
    用户删除被 DB 拒绝 (NO ACTION), 防误删。要清掉应先解除分配。
  - 三个索引: 唯一 (防重复分配) + 双向反查 (按咨询师 / 按客户 各一条)。

无 ``updated_at``: assignment 只有"建立 vs 解除", 不会就地修改 → CreatedAtOnlyMixin。
"""

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Index, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class ClientAssignment(Base, CreatedAtOnlyMixin):
    __tablename__ = "client_assignments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )
    # 故意不加 ondelete (NO ACTION) — 防止误删用户; 解除分配走业务删此行
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    counselor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    is_primary: Mapped[bool] = mapped_column(server_default=text("true"))

    __table_args__ = (
        Index(
            "uq_client_assignments_org_client_counselor",
            "org_id",
            "client_id",
            "counselor_id",
            unique=True,
        ),
        Index("idx_client_assignments_counselor", "org_id", "counselor_id"),
        Index("idx_client_assignments_client", "org_id", "client_id"),
    )
