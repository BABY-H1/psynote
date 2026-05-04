"""
Phase 2.2 — Batch 1 模型 smoke test (organizations / users / password_reset_tokens)。

不连接真实 DB, 只验证模型形态:
  - __tablename__ 与 Drizzle 一致
  - 关键字段 nullable / unique / FK / server_default 正确
  - Phase 2 新增字段 (organizations.parent_org_id / org_level) 正确

真正的"模型 ↔ DB 一致性"反射对比测试在 Phase 2.8 (用真 dev DB)。
"""

from __future__ import annotations

# ─── __tablename__ 对照 Drizzle ──────────────────────────────────


def test_organization_tablename() -> None:
    from app.db.models.organizations import Organization

    assert Organization.__tablename__ == "organizations"


def test_user_tablename() -> None:
    from app.db.models.users import User

    assert User.__tablename__ == "users"


def test_password_reset_token_tablename() -> None:
    from app.db.models.password_reset_tokens import PasswordResetToken

    assert PasswordResetToken.__tablename__ == "password_reset_tokens"


# ─── organizations 字段 ─────────────────────────────────────────


def test_organization_columns_match_drizzle_plus_phase2_additions() -> None:
    """所有 Drizzle 字段 + Phase 2 决策 2026-05-04 新增的 parent_org_id / org_level"""
    from app.db.models.organizations import Organization

    cols = {c.name for c in Organization.__table__.columns}
    expected = {
        # Drizzle:
        "id",
        "name",
        "slug",
        "plan",
        "license_key",
        "settings",
        "triage_config",
        "data_retention_policy",
        "created_at",
        "updated_at",
        # Phase 2 新增 (机构层级预留):
        "parent_org_id",
        "org_level",
    }
    assert expected <= cols, f"缺字段: {expected - cols}"


def test_organization_slug_unique() -> None:
    from app.db.models.organizations import Organization

    assert Organization.__table__.c.slug.unique is True


def test_organization_plan_default_free() -> None:
    from app.db.models.organizations import Organization

    plan = Organization.__table__.c.plan
    assert plan.nullable is False
    # server_default.arg 是 TextClause, 需 str() 取
    assert "'free'" in str(plan.server_default.arg)


def test_organization_settings_default_empty_jsonb() -> None:
    from app.db.models.organizations import Organization

    settings = Organization.__table__.c.settings
    assert settings.nullable is False
    assert "'{}'::jsonb" in str(settings.server_default.arg)


def test_organization_data_retention_policy_nullable() -> None:
    """Drizzle: data_retention_policy 没 .notNull() → nullable=True"""
    from app.db.models.organizations import Organization

    assert Organization.__table__.c.data_retention_policy.nullable is True


def test_organization_parent_org_id_self_fk_set_null() -> None:
    """Phase 2 决策 2026-05-04: 机构层级预留, 父删置 NULL (子机构独立运营)"""
    from app.db.models.organizations import Organization

    parent_col = Organization.__table__.c.parent_org_id
    assert parent_col.nullable is True
    fks = list(parent_col.foreign_keys)
    assert len(fks) == 1, "parent_org_id 应有 1 个 FK"
    assert fks[0].column.table.name == "organizations"
    assert fks[0].ondelete == "SET NULL"


def test_organization_org_level_default_leaf() -> None:
    """Phase 2 决策: 默认 org_level='leaf' (即"叶子机构, 不是上级"), 父子关系业务在 Phase 7+"""
    from app.db.models.organizations import Organization

    org_level = Organization.__table__.c.org_level
    assert org_level.nullable is False
    assert "'leaf'" in str(org_level.server_default.arg)


# ─── users 字段 ────────────────────────────────────────────────


def test_user_columns_match_drizzle() -> None:
    from app.db.models.users import User

    cols = {c.name for c in User.__table__.columns}
    expected = {
        "id",
        "email",
        "name",
        "password_hash",
        "avatar_url",
        "is_system_admin",
        "is_guardian_account",
        "last_login_at",
        "created_at",
    }
    assert expected <= cols


def test_user_no_updated_at() -> None:
    """users 表故意不设 updated_at (Drizzle 一致): 改名/改邮箱不算 user 实体变更"""
    from app.db.models.users import User

    assert "updated_at" not in {c.name for c in User.__table__.columns}


def test_user_email_nullable_and_unique() -> None:
    """匿名 portal 账号允许 email 为空, 但若有必须唯一"""
    from app.db.models.users import User

    email = User.__table__.c.email
    assert email.nullable is True
    assert email.unique is True


def test_user_password_hash_nullable() -> None:
    """OAuth / 邀请未设密码的账号 password_hash 可为 NULL"""
    from app.db.models.users import User

    assert User.__table__.c.password_hash.nullable is True


def test_user_is_system_admin_default_false() -> None:
    from app.db.models.users import User

    is_sa = User.__table__.c.is_system_admin
    assert is_sa.nullable is False
    assert "false" in str(is_sa.server_default.arg).lower()


def test_user_is_guardian_account_default_false() -> None:
    from app.db.models.users import User

    is_ga = User.__table__.c.is_guardian_account
    assert is_ga.nullable is False
    assert "false" in str(is_ga.server_default.arg).lower()


# ─── password_reset_tokens 字段 + 索引 ─────────────────────────


def test_password_reset_token_columns_match_drizzle() -> None:
    from app.db.models.password_reset_tokens import PasswordResetToken

    cols = {c.name for c in PasswordResetToken.__table__.columns}
    expected = {
        "id",
        "user_id",
        "token_hash",
        "expires_at",
        "used_at",
        "created_at",
    }
    assert expected <= cols


def test_password_reset_token_user_id_fk_cascade() -> None:
    """user 删 → 所有未用的 reset token 跟着删 (cascade)"""
    from app.db.models.password_reset_tokens import PasswordResetToken

    user_id = PasswordResetToken.__table__.c.user_id
    fks = list(user_id.foreign_keys)
    assert len(fks) == 1
    assert fks[0].column.table.name == "users"
    assert fks[0].ondelete == "CASCADE"


def test_password_reset_token_unique_index_on_token_hash() -> None:
    """Drizzle: uniqueIndex('uq_password_reset_token_hash').on(t.tokenHash)"""
    from app.db.models.password_reset_tokens import PasswordResetToken

    indexes = {idx.name: idx for idx in PasswordResetToken.__table__.indexes}
    assert "uq_password_reset_token_hash" in indexes
    assert indexes["uq_password_reset_token_hash"].unique is True


def test_password_reset_token_lookup_index() -> None:
    """Drizzle: index('idx_password_reset_user_expires').on(t.userId, t.expiresAt)"""
    from app.db.models.password_reset_tokens import PasswordResetToken

    indexes = {idx.name: idx for idx in PasswordResetToken.__table__.indexes}
    assert "idx_password_reset_user_expires" in indexes
    cols = [c.name for c in indexes["idx_password_reset_user_expires"].columns]
    assert cols == ["user_id", "expires_at"]


def test_password_reset_token_expires_at_nullable_false() -> None:
    """token 必须有过期时间, 不能 NULL"""
    from app.db.models.password_reset_tokens import PasswordResetToken

    assert PasswordResetToken.__table__.c.expires_at.nullable is False


def test_password_reset_token_used_at_nullable() -> None:
    """未使用的 token used_at IS NULL, 用过后 set 时间; 不能 NOT NULL"""
    from app.db.models.password_reset_tokens import PasswordResetToken

    assert PasswordResetToken.__table__.c.used_at.nullable is True


# ─── 包根 re-export ────────────────────────────────────────────


def test_models_re_exported_from_package() -> None:
    """``from app.db.models import User`` 应直接可用 (短导入路径)"""
    from app.db.models import Organization, PasswordResetToken, User

    assert Organization is not None
    assert User is not None
    assert PasswordResetToken is not None


# ─── 命名约定 ─────────────────────────────────────────────────


def test_base_metadata_has_naming_convention() -> None:
    """Base.metadata 挂了 NAMING_CONVENTION, 让 alembic autogenerate 风格统一"""
    from app.core.database import Base

    nc = Base.metadata.naming_convention
    assert nc.get("ix") == "idx_%(column_0_label)s"
    assert nc.get("uq") == "uq_%(table_name)s_%(column_0_name)s"
    assert nc.get("fk") == "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"
