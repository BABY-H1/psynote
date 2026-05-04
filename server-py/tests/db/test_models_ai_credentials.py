"""
Phase 2.6 — ai_credentials (BYOK 新表) smoke test。

不在 Drizzle schema, Phase 2 通过 Alembic 0001 migration 新建。
"""

from __future__ import annotations


def test_ai_credential_tablename() -> None:
    from app.db.models.ai_credentials import AICredential

    assert AICredential.__tablename__ == "ai_credentials"


def test_ai_credential_columns_complete() -> None:
    from app.db.models.ai_credentials import AICredential

    cols = {c.name for c in AICredential.__table__.columns}
    expected = {
        "id",
        "scope",
        "scope_id",
        "provider",
        "base_url",
        "model",
        "encrypted_key",
        "encryption_iv",
        "encryption_tag",
        "data_residency",
        "is_default",
        "is_disabled",
        "label",
        "created_by",
        "created_at",
        "rotated_at",
        "last_used_at",
        "last_error_at",
    }
    assert expected <= cols


def test_ai_credential_scope_check_constraint() -> None:
    """scope 必须是 'platform' 或 'org'"""
    from sqlalchemy import CheckConstraint

    from app.db.models.ai_credentials import AICredential

    checks = [c for c in AICredential.__table__.constraints if isinstance(c, CheckConstraint)]
    names = {c.name for c in checks}
    assert "ck_ai_credentials_scope" in names


def test_ai_credential_data_residency_check_constraint() -> None:
    """data_residency 必须是 'cn' 或 'global' (PHI 出境合规)"""
    from sqlalchemy import CheckConstraint

    from app.db.models.ai_credentials import AICredential

    checks = [c for c in AICredential.__table__.constraints if isinstance(c, CheckConstraint)]
    names = {c.name for c in checks}
    assert "ck_ai_credentials_data_residency" in names


def test_ai_credential_default_data_residency_cn() -> None:
    """默认 data_residency='cn' — 国内, 防止 PHI 误传境外"""
    from app.db.models.ai_credentials import AICredential

    dr = AICredential.__table__.c.data_residency
    assert dr.nullable is False
    assert "cn" in str(dr.server_default.arg)


def test_ai_credential_encrypted_fields_binary() -> None:
    """加密字段是 LargeBinary (bytea), 不是 Text"""
    from sqlalchemy import LargeBinary

    from app.db.models.ai_credentials import AICredential

    cols = AICredential.__table__.c
    for name in ("encrypted_key", "encryption_iv", "encryption_tag"):
        assert isinstance(cols[name].type, LargeBinary), f"{name} 应是 LargeBinary"
        assert cols[name].nullable is False, f"{name} 必填"


def test_ai_credential_partial_unique_index_on_default() -> None:
    """同 (scope, scope_id, provider) 在 is_default=true 范围内唯一"""
    from app.db.models.ai_credentials import AICredential

    indexes = {idx.name: idx for idx in AICredential.__table__.indexes}
    uq = indexes["uq_ai_credentials_default"]
    assert uq.unique is True
    assert [c.name for c in uq.columns] == ["scope", "scope_id", "provider"]


def test_ai_credential_scope_id_no_fk() -> None:
    """scope_id 不加 FK (因 platform 行 scope_id IS NULL, 业务侧保证 org scope 行 valid)"""
    from app.db.models.ai_credentials import AICredential

    fks = list(AICredential.__table__.c.scope_id.foreign_keys)
    assert len(fks) == 0


def test_ai_credential_created_by_required() -> None:
    """created_by 必填 + FK 到 users (审计追溯发凭据的人)"""
    from app.db.models.ai_credentials import AICredential

    cb = AICredential.__table__.c.created_by
    assert cb.nullable is False
    fks = list(cb.foreign_keys)
    assert len(fks) == 1
    assert fks[0].column.table.name == "users"


def test_ai_credential_re_exported() -> None:
    from app.db.models import AICredential

    assert AICredential is not None
    assert AICredential.__tablename__ == "ai_credentials"
