"""
``ai_credentials`` — Phase 2 决策 2026-05-04 新表 (BYOK org-level AI 凭据)。

不在 Drizzle schema.ts 里 — Phase 2 通过 Alembic 0001 migration 新建。

业务背景 (见 plan BYOK 章节):
  - 每个机构 (org) 可配置自己的 AI API key, 不做 user-level
  - Fallback chain: org 凭据 → platform 默认 → ConfigurationError
  - PHI 出境合规: data_residency='cn' / 'global', 与 organizations.consents_to_phi_export
    配合, 防止 PHI 误传给境外 provider

加密设计:
  - 算法: AES-256-GCM (cryptography 库)
  - 主密钥: env ``KEY_ENCRYPTION_KEY`` (32 bytes base64), 与 JWT_SECRET 同等级管理
  - AAD: ``f"{scope}:{scope_id}".encode()`` 防密文跨 scope 移植
  - 字段: ``encrypted_key`` + ``encryption_iv`` (12B) + ``encryption_tag`` (16B)

权限矩阵 (Phase 3 Tier 4 实装):
  - system_admin: 平台凭据 R/W + 任意 org 凭据 R/W
  - org_admin: 自己 org 凭据 R/W (但写入不能读现有明文, 只能"覆盖"或"轮换")
  - counselor: 只看 "已配置/未配置" 状态, 不看明文
  - client: 完全不可见

唯一约束设计:
  - ``(scope, scope_id, provider)`` 在 ``is_default = true`` 范围内唯一
    保证每个 (provider, scope_id) 至多一个 default key
  - 允许同 org 配多 provider 备用 (e.g. 主 OpenAI + 备 Anthropic)

软删除: ``is_disabled = true`` 即下架, 走业务 filter (不直接 DELETE)。
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, LargeBinary, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class AICredential(Base, CreatedAtOnlyMixin):
    __tablename__ = "ai_credentials"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    # CHECK ('platform' | 'org') — DDL constraint 在 __table_args__
    scope: Mapped[str] = mapped_column(Text)
    # platform 时 NULL, org 时 = org.id (无 FK 因 platform 行 scope_id IS NULL,
    # 不能强约束到 organizations 表; 业务侧保证 org scope 行 scope_id valid)
    scope_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    # 'openai-compatible' | 'anthropic' | 'gemini' (业务约定)
    provider: Mapped[str] = mapped_column(Text)
    base_url: Mapped[str] = mapped_column(Text)
    model: Mapped[str] = mapped_column(Text)
    # AES-256-GCM 加密后的 key (二进制)
    encrypted_key: Mapped[bytes] = mapped_column(LargeBinary)
    encryption_iv: Mapped[bytes] = mapped_column(LargeBinary)  # 12 字节
    encryption_tag: Mapped[bytes] = mapped_column(LargeBinary)  # 16 字节
    # 'cn' | 'global' — PHI 出境合规字段
    data_residency: Mapped[str] = mapped_column(Text, server_default=text("'cn'"))
    is_default: Mapped[bool] = mapped_column(server_default=text("false"))
    is_disabled: Mapped[bool] = mapped_column(server_default=text("false"))
    label: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        # name 不写 ck_ 前缀, 让 Base.metadata.naming_convention 自动加 → ck_ai_credentials_<name>
        CheckConstraint("scope IN ('platform', 'org')", name="scope"),
        CheckConstraint("data_residency IN ('cn', 'global')", name="data_residency"),
        # 同 (scope, scope_id, provider) 在 is_default=true 范围内唯一
        Index(
            "uq_ai_credentials_default",
            "scope",
            "scope_id",
            "provider",
            unique=True,
            postgresql_where=text("is_default = true"),
        ),
        # 高频查询: 列出某 scope 下所有 active 凭据
        Index(
            "ix_ai_credentials_scope_active",
            "scope",
            "scope_id",
            postgresql_where=text("NOT is_disabled"),
        ),
    )
