"""Phase 2 additions — ai_credentials + organizations.parent_org_id + role_v2 NOT NULL。

Revision ID: 0001_phase2_additions
Revises: 0000_baseline
Create Date: 2026-05-04

变更内容 (Phase 2 决策 2026-05-04):
  1. **新表 ai_credentials** (BYOK org-level AI 凭据)
     - AES-256-GCM 加密字段 + 部分唯一索引 (is_default=true 范围内唯一)
     - data_residency 字段 ('cn' | 'global') 用于 PHI 出境合规
  2. **organizations 加 parent_org_id + org_level** (机构层级预留)
     - 业务逻辑 Phase 7+ 启动 (区教委 → 学校 / 咨询连锁总部 → 分店)
     - parent_org_id 自引用 ondelete=SET NULL (父机构注销时子机构独立运营)
  3. **org_members.role_v2 backfill + NOT NULL**
     - 启动期没对外用户, 强制升级所有老用户从 legacy role 到 RoleV2 字典
     - 翻译规则按 (orgType, legacy_role) 走 legacy_role_to_v2 等价 SQL CASE

部署:
  - 跑过 ``alembic stamp 0000_baseline`` 后, ``alembic upgrade head``
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID  # noqa: F401 — kept for autogenerate compat

# revision identifiers, used by Alembic.
revision: str = "0001_phase2_additions"
down_revision: str | None = "0000_baseline"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ─── 1. 新表 ai_credentials ────────────────────────────────────
    op.create_table(
        "ai_credentials",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("scope", sa.Text(), nullable=False),
        sa.Column("scope_id", UUID(as_uuid=True), nullable=True),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("base_url", sa.Text(), nullable=False),
        sa.Column("model", sa.Text(), nullable=False),
        sa.Column("encrypted_key", sa.LargeBinary(), nullable=False),
        sa.Column("encryption_iv", sa.LargeBinary(), nullable=False),
        sa.Column("encryption_tag", sa.LargeBinary(), nullable=False),
        sa.Column(
            "data_residency",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'cn'"),
        ),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_disabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("label", sa.Text(), nullable=True),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", name="fk_ai_credentials_created_by_users"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("rotated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("scope IN ('platform', 'org')", name="ck_ai_credentials_scope"),
        sa.CheckConstraint(
            "data_residency IN ('cn', 'global')",
            name="ck_ai_credentials_data_residency",
        ),
    )
    # Partial unique: 同 (scope, scope_id, provider) 在 is_default=true 范围内唯一
    op.create_index(
        "uq_ai_credentials_default",
        "ai_credentials",
        ["scope", "scope_id", "provider"],
        unique=True,
        postgresql_where=sa.text("is_default = true"),
    )
    # Partial index: 高频查询 active 凭据 (排除 disabled)
    op.create_index(
        "ix_ai_credentials_scope_active",
        "ai_credentials",
        ["scope", "scope_id"],
        postgresql_where=sa.text("NOT is_disabled"),
    )

    # ─── 2. organizations 加 parent_org_id + org_level ───────────
    op.add_column(
        "organizations",
        sa.Column(
            "parent_org_id",
            UUID(as_uuid=True),
            sa.ForeignKey(
                "organizations.id",
                name="fk_organizations_parent_org_id_organizations",
                ondelete="SET NULL",
            ),
            nullable=True,
        ),
    )
    op.add_column(
        "organizations",
        sa.Column(
            "org_level",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'leaf'"),
        ),
    )

    # ─── 3. org_members.role_v2 backfill + NOT NULL ──────────────
    # Phase 2 决策 2026-05-04: 启动期没对外用户, 强制升级所有老角色到 RoleV2 字典
    # SQL 等价于 packages/shared/src/auth/roles.ts ``legacy_role_to_v2``
    op.execute(
        """
        UPDATE org_members SET role_v2 = sub.new_role
        FROM (
            SELECT
                m.id AS member_id,
                CASE
                    -- 学校 (school): counselor → psychologist, client+guardian → parent / 否则 student
                    WHEN o.settings->>'orgType' = 'school' THEN
                        CASE m.role
                            WHEN 'org_admin' THEN 'school_admin'
                            WHEN 'counselor' THEN 'psychologist'
                            WHEN 'client' THEN
                                CASE WHEN u.is_guardian_account THEN 'parent' ELSE 'student' END
                            ELSE m.role
                        END
                    -- 咨询机构 (counseling): 三角色保持
                    WHEN o.settings->>'orgType' = 'counseling' THEN
                        CASE m.role
                            WHEN 'org_admin' THEN 'clinic_admin'
                            ELSE m.role
                        END
                    -- 企业 (enterprise): 合规硬隔离 — HR 不能直读 PHI
                    WHEN o.settings->>'orgType' = 'enterprise' THEN
                        CASE m.role
                            WHEN 'org_admin' THEN 'hr_admin'
                            WHEN 'counselor' THEN 'eap_consultant'
                            WHEN 'client' THEN 'employee'
                            ELSE m.role
                        END
                    -- 个体 (solo): 单人兼任管理 + 执业, 全归 owner
                    WHEN o.settings->>'orgType' = 'solo' THEN
                        CASE
                            WHEN m.role IN ('org_admin', 'counselor') THEN 'owner'
                            ELSE m.role
                        END
                    -- 医院 (hospital):
                    WHEN o.settings->>'orgType' = 'hospital' THEN
                        CASE m.role
                            WHEN 'org_admin' THEN 'clinic_admin'
                            WHEN 'counselor' THEN 'attending'
                            WHEN 'client' THEN 'patient'
                            ELSE m.role
                        END
                    ELSE m.role
                END AS new_role
            FROM org_members m
            JOIN organizations o ON m.org_id = o.id
            LEFT JOIN users u ON m.user_id = u.id
            WHERE m.role_v2 IS NULL
        ) sub
        WHERE org_members.id = sub.member_id;
        """
    )

    # 改 NOT NULL
    op.alter_column("org_members", "role_v2", nullable=False)


def downgrade() -> None:
    # 反向: role_v2 改回 nullable; 删 organizations 加的字段; 删 ai_credentials 表
    op.alter_column("org_members", "role_v2", nullable=True)

    op.drop_column("organizations", "org_level")
    op.drop_constraint(
        "fk_organizations_parent_org_id_organizations", "organizations", type_="foreignkey"
    )
    op.drop_column("organizations", "parent_org_id")

    op.drop_index("ix_ai_credentials_scope_active", table_name="ai_credentials")
    op.drop_index("uq_ai_credentials_default", table_name="ai_credentials")
    op.drop_table("ai_credentials")
