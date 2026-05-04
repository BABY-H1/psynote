"""
Phase 2.3 — Batch 2 模型 smoke test。

覆盖 4 张表:
  - org_members         (RBAC 决策核心, Phase 1 review checkpoint 之一)
  - client_profiles     (来访者人口学 + 主诉, PHI_FULL)
  - client_assignments  (DataScope 'assigned' 来源)
  - client_access_grants (临时跨范围授权)
"""

from __future__ import annotations

# ─── __tablename__ ─────────────────────────────────────────────


def test_org_member_tablename() -> None:
    from app.db.models.org_members import OrgMember

    assert OrgMember.__tablename__ == "org_members"


def test_client_profile_tablename() -> None:
    from app.db.models.client_profiles import ClientProfile

    assert ClientProfile.__tablename__ == "client_profiles"


def test_client_assignment_tablename() -> None:
    from app.db.models.client_assignments import ClientAssignment

    assert ClientAssignment.__tablename__ == "client_assignments"


def test_client_access_grant_tablename() -> None:
    from app.db.models.client_access_grants import ClientAccessGrant

    assert ClientAccessGrant.__tablename__ == "client_access_grants"


# ─── org_members 字段 + 关键设计 ──────────────────────────────


def test_org_member_has_role_v2_and_principal_class_nullable() -> None:
    """role_v2 / principal_class 都是 Phase 1.3 加的, backfill 前 nullable"""
    from app.db.models.org_members import OrgMember

    cols = OrgMember.__table__.c
    assert cols.role_v2.nullable is True
    assert cols.principal_class.nullable is True


def test_org_member_legacy_role_not_null() -> None:
    """legacy role 字段保持 NOT NULL (org_admin/counselor/client 三档)"""
    from app.db.models.org_members import OrgMember

    assert OrgMember.__table__.c.role.nullable is False


def test_org_member_supervisor_id_no_fk() -> None:
    """Drizzle 故意没给 supervisor_id 加 FK (软关联, 跨 org / 离任悬空)"""
    from app.db.models.org_members import OrgMember

    assert len(list(OrgMember.__table__.c.supervisor_id.foreign_keys)) == 0


def test_org_member_org_user_unique_index() -> None:
    """同 org 内同 user 只能有一条 member 行"""
    from app.db.models.org_members import OrgMember

    indexes = {idx.name: idx for idx in OrgMember.__table__.indexes}
    uq = indexes["uq_org_members_org_user"]
    assert uq.unique is True
    assert [c.name for c in uq.columns] == ["org_id", "user_id"]


def test_org_member_full_practice_access_default_false() -> None:
    """FPA = 派生 supervisor 的关键开关, 默认 false"""
    from app.db.models.org_members import OrgMember

    fpa = OrgMember.__table__.c.full_practice_access
    assert fpa.nullable is False
    assert "false" in str(fpa.server_default.arg).lower()


def test_org_member_specialties_text_array() -> None:
    """specialties 是 PG text[] 数组类型 (不是 JSONB)"""
    from sqlalchemy.dialects.postgresql import ARRAY

    from app.db.models.org_members import OrgMember

    specialties = OrgMember.__table__.c.specialties
    assert isinstance(specialties.type, ARRAY)


def test_org_member_org_id_cascade_delete() -> None:
    """org 删 → 所有 member 行跟着删 (cascade)"""
    from app.db.models.org_members import OrgMember

    org_fk = next(iter(OrgMember.__table__.c.org_id.foreign_keys))
    assert org_fk.ondelete == "CASCADE"


# ─── client_profiles ──────────────────────────────────────────


def test_client_profile_org_user_unique_index() -> None:
    from app.db.models.client_profiles import ClientProfile

    indexes = {idx.name: idx for idx in ClientProfile.__table__.indexes}
    uq = indexes["uq_client_profile_org_user"]
    assert uq.unique is True


def test_client_profile_date_of_birth_is_date_type() -> None:
    """date_of_birth 用 PG DATE (不带时区), 跟 timestamp 区分"""
    from sqlalchemy import Date

    from app.db.models.client_profiles import ClientProfile

    assert isinstance(ClientProfile.__table__.c.date_of_birth.type, Date)


def test_client_profile_phi_fields_nullable() -> None:
    """医疗史 / 主诉 / 家庭背景都允许空 (用户填多少看多少)"""
    from app.db.models.client_profiles import ClientProfile

    cols = ClientProfile.__table__.c
    assert cols.medical_history.nullable is True
    assert cols.family_background.nullable is True
    assert cols.presenting_issues.nullable is True


# ─── client_assignments ───────────────────────────────────────


def test_client_assignment_no_cascade_on_user_fks() -> None:
    """client_id / counselor_id 不带 ondelete → 防误删用户"""
    from app.db.models.client_assignments import ClientAssignment

    cols = ClientAssignment.__table__.c
    client_fk = next(iter(cols.client_id.foreign_keys))
    counselor_fk = next(iter(cols.counselor_id.foreign_keys))
    assert client_fk.ondelete is None
    assert counselor_fk.ondelete is None


def test_client_assignment_is_primary_default_true() -> None:
    """单咨询师场景默认是主负责人"""
    from app.db.models.client_assignments import ClientAssignment

    is_primary = ClientAssignment.__table__.c.is_primary
    assert is_primary.nullable is False
    assert "true" in str(is_primary.server_default.arg).lower()


def test_client_assignment_three_indexes() -> None:
    """1 unique + 2 反查索引 (counselor / client)"""
    from app.db.models.client_assignments import ClientAssignment

    names = {idx.name for idx in ClientAssignment.__table__.indexes}
    assert names >= {
        "uq_client_assignments_org_client_counselor",
        "idx_client_assignments_counselor",
        "idx_client_assignments_client",
    }


# ─── client_access_grants ─────────────────────────────────────


def test_client_access_grant_reason_required() -> None:
    """reason 必填 — 合规审计要追溯「为什么发的授权」"""
    from app.db.models.client_access_grants import ClientAccessGrant

    assert ClientAccessGrant.__table__.c.reason.nullable is False


def test_client_access_grant_expires_and_revoked_nullable() -> None:
    """长期授权可不设 expires_at; 未撤销的 revoked_at 为 NULL"""
    from app.db.models.client_access_grants import ClientAccessGrant

    cols = ClientAccessGrant.__table__.c
    assert cols.expires_at.nullable is True
    assert cols.revoked_at.nullable is True


def test_client_access_grant_three_user_fks() -> None:
    """client_id / granted_to_counselor_id / granted_by 都指 users"""
    from app.db.models.client_access_grants import ClientAccessGrant

    cols = ClientAccessGrant.__table__.c
    for col_name in ("client_id", "granted_to_counselor_id", "granted_by"):
        fks = list(cols[col_name].foreign_keys)
        assert len(fks) == 1
        assert fks[0].column.table.name == "users"


# ─── re-export ────────────────────────────────────────────────


def test_batch2_models_re_exported() -> None:
    from app.db.models import (
        ClientAccessGrant,
        ClientAssignment,
        ClientProfile,
        OrgMember,
    )

    assert ClientAccessGrant is not None
    assert ClientAssignment is not None
    assert ClientProfile is not None
    assert OrgMember is not None
