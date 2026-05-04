"""
Tests for app/middleware/org_context.py — `resolve_org_context` + `get_org_context` Dependency。

镜像 server/src/middleware/org-context.ts 的核心分支:

  1. sysadm + 无 org_id            → None (无 org 上下文, 全局视图)
  2. sysadm + org_id, org row 缺失 → 404
  3. sysadm + org_id, org 存在     → 合成 OrgContext (role=org_admin, tier 从 plan)
  4. 非-sysadm + 无 org_id         → None
  5. 非-sysadm + 不合法 UUID       → 404
  6. 非-sysadm + 不是成员           → 403
  7. 非-sysadm + member 过期        → 403
  8. 非-sysadm + member 正常        → OrgContext 完整组装
  9. counselor + supervisees       → supervisee_user_ids 填好
 10. role_v2 显式 vs legacy fallback (legacyRoleToV2)
 11. fullPracticeAccess 默认值 (org_admin → True)
 12. access_profile.dataClasses 与 ROLE_DATA_CLASS_POLICY[role_v2] 合并

Phase 1.6 实装注:
  3 个 DB helper (_load_org_row / _load_member_row / _load_supervisee_user_ids)
  在 Phase 1.6 阶段返回 None/() 占位 (Phase 2 ORM 后填实)。tests 用
  monkeypatch.setattr 把 helper mock 成具体行, 验证 resolve_org_context 的
  组装逻辑。
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

# ─── Test helpers ─────────────────────────────────────────────────


def _user(is_sysadm: bool = False) -> Any:
    from app.middleware.auth import AuthUser

    return AuthUser(id="user-1", email="u@x.com", is_system_admin=is_sysadm)


VALID_ORG_ID = "01234567-89ab-cdef-0123-456789abcdef"  # UUID v? format


def _org_row(
    *,
    plan: str = "free",
    license_key: str | None = None,
    settings: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Mock return value of _load_org_row."""
    return {
        "id": VALID_ORG_ID,
        "plan": plan,
        "license_key": license_key,
        "settings": settings or {"orgType": "counseling"},
    }


def _member_row(
    *,
    role: str = "counselor",
    role_v2: str | None = None,
    full_practice_access: bool | None = None,  # None = DB NULL, fallback 走 role 默认
    access_profile: dict[str, Any] | None = None,
    supervisor_id: str | None = None,
    valid_until: datetime | None = None,
    principal_class: str | None = None,
) -> dict[str, Any]:
    """Mock return value of _load_member_row.

    full_practice_access=None 模拟 DB NULL — Node `member.fullPracticeAccess ??
    (member.role === 'org_admin')` 在 NULL 时降到 role-based 默认 (org_admin → True)。
    显式 True/False 时用显式值不降级。
    """
    return {
        "id": "member-1",
        "user_id": "user-1",
        "org_id": VALID_ORG_ID,
        "role": role,
        "role_v2": role_v2,
        "full_practice_access": full_practice_access,
        "access_profile": access_profile,
        "supervisor_id": supervisor_id,
        "valid_until": valid_until,
        "principal_class": principal_class,
        "status": "active",
    }


def _patch_loaders(
    monkeypatch: pytest.MonkeyPatch,
    *,
    org_row: dict[str, Any] | None = None,
    member_row: dict[str, Any] | None = None,
    supervisees: tuple[str, ...] = (),
) -> None:
    """统一 mock 3 个 DB loader (Phase 2 ORM 接入前的占位)。"""
    from app.middleware import org_context as oc

    async def mock_load_org(_db: Any, _org_id: str) -> Any:
        return org_row

    async def mock_load_member(_db: Any, _org_id: str, _user_id: str) -> Any:
        return member_row

    async def mock_load_supervisees(_db: Any, _member_id: str, _org_id: str) -> tuple[str, ...]:
        return supervisees

    monkeypatch.setattr(oc, "_load_org_row", mock_load_org)
    monkeypatch.setattr(oc, "_load_member_row", mock_load_member)
    monkeypatch.setattr(oc, "_load_supervisee_user_ids", mock_load_supervisees)


# ─── 1. sysadm + 无 org_id → None ─────────────────────────────


@pytest.mark.asyncio
async def test_sysadm_no_org_id_returns_none(base_env: pytest.MonkeyPatch) -> None:
    from app.middleware.org_context import resolve_org_context

    result = await resolve_org_context(user=_user(is_sysadm=True), org_id=None, db=AsyncMock())
    assert result is None


# ─── 2. sysadm + org_id 但 org 缺失 → 404 ─────────────────────


@pytest.mark.asyncio
async def test_sysadm_org_not_found_raises_404(
    base_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.middleware.org_context import resolve_org_context

    _patch_loaders(monkeypatch, org_row=None)

    with pytest.raises(HTTPException) as exc:
        await resolve_org_context(
            user=_user(is_sysadm=True),
            org_id=VALID_ORG_ID,
            db=AsyncMock(),
        )
    assert exc.value.status_code == 404


# ─── 3. sysadm + org_id 存在 → 合成 OrgContext ─────────────────


@pytest.mark.asyncio
async def test_sysadm_with_org_builds_synthetic_context(
    base_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    """sysadm 合成 org_admin 身份 + 当前 org 的 tier / orgType"""
    from app.middleware.org_context import resolve_org_context

    _patch_loaders(
        monkeypatch,
        org_row=_org_row(plan="pro", settings={"orgType": "counseling"}),
    )

    result = await resolve_org_context(
        user=_user(is_sysadm=True),
        org_id=VALID_ORG_ID,
        db=AsyncMock(),
    )
    assert result is not None
    assert result.org_id == VALID_ORG_ID
    assert result.role == "org_admin"
    assert result.member_id == "system-admin"
    assert result.full_practice_access is True
    assert result.is_supervisor is True
    assert result.org_type == "counseling"
    assert result.tier == "growth"  # plan='pro' → growth
    # role_v2: org_admin + counseling → clinic_admin
    assert result.role_v2 == "clinic_admin"
    assert result.principal_class == "staff"


@pytest.mark.asyncio
async def test_sysadm_org_type_from_settings(
    base_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.middleware.org_context import resolve_org_context

    _patch_loaders(monkeypatch, org_row=_org_row(settings={"orgType": "enterprise"}))

    result = await resolve_org_context(
        user=_user(is_sysadm=True),
        org_id=VALID_ORG_ID,
        db=AsyncMock(),
    )
    assert result is not None
    assert result.org_type == "enterprise"
    # sysadm 在 enterprise 下 → role_v2 = hr_admin (合规硬隔离, 与 Node 一致)
    assert result.role_v2 == "hr_admin"


# ─── 4. 非-sysadm + 无 org_id → None ─────────────────────────


@pytest.mark.asyncio
async def test_non_sysadm_no_org_id_returns_none(
    base_env: pytest.MonkeyPatch,
) -> None:
    """非 sysadm 路由没 org_id 路径参 (e.g. /me 类) → None, 下游 (require_action) 决定如何处理"""
    from app.middleware.org_context import resolve_org_context

    result = await resolve_org_context(user=_user(), org_id=None, db=AsyncMock())
    assert result is None


# ─── 5. 非合法 UUID → 404 ──────────────────────────────────────


@pytest.mark.asyncio
async def test_invalid_uuid_format_raises_404(
    base_env: pytest.MonkeyPatch,
) -> None:
    """与 Node org-context.ts:120 一致: 非 UUID 形态的 org_id 在查 DB 前 404"""
    from app.middleware.org_context import resolve_org_context

    with pytest.raises(HTTPException) as exc:
        await resolve_org_context(
            user=_user(),
            org_id="not-a-uuid",
            db=AsyncMock(),
        )
    assert exc.value.status_code == 404


# ─── 6. 非-sysadm + 不是成员 → 403 ────────────────────────────


@pytest.mark.asyncio
async def test_non_member_raises_403(
    base_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.middleware.org_context import resolve_org_context

    _patch_loaders(monkeypatch, org_row=_org_row(), member_row=None)

    with pytest.raises(HTTPException) as exc:
        await resolve_org_context(
            user=_user(),
            org_id=VALID_ORG_ID,
            db=AsyncMock(),
        )
    assert exc.value.status_code == 403


# ─── 7. member 过期 → 403 ────────────────────────────────────


@pytest.mark.asyncio
async def test_expired_membership_raises_403(
    base_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.middleware.org_context import resolve_org_context

    yesterday = datetime.now(tz=UTC) - timedelta(days=1)
    _patch_loaders(
        monkeypatch,
        org_row=_org_row(),
        member_row=_member_row(valid_until=yesterday),
    )

    with pytest.raises(HTTPException) as exc:
        await resolve_org_context(
            user=_user(),
            org_id=VALID_ORG_ID,
            db=AsyncMock(),
        )
    assert exc.value.status_code == 403
    assert "expired" in str(exc.value.detail).lower()


# ─── 8. counselor 正常 → OrgContext 完整组装 ────────────────────


@pytest.mark.asyncio
async def test_counselor_member_builds_org_context(
    base_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.middleware.org_context import resolve_org_context

    _patch_loaders(
        monkeypatch,
        org_row=_org_row(plan="pro", settings={"orgType": "counseling"}),
        member_row=_member_row(role="counselor"),
    )

    result = await resolve_org_context(
        user=_user(),
        org_id=VALID_ORG_ID,
        db=AsyncMock(),
    )
    assert result is not None
    assert result.org_id == VALID_ORG_ID
    assert result.member_id == "member-1"
    assert result.role == "counselor"
    assert result.role_v2 == "counselor"  # legacy_role_to_v2('counseling','counselor')
    assert result.org_type == "counseling"
    assert result.tier == "growth"
    assert result.full_practice_access is False
    assert result.is_supervisor is False
    assert result.supervisee_user_ids == ()


# ─── 9. counselor + supervisees → 链填好 ──────────────────────


@pytest.mark.asyncio
async def test_counselor_with_supervisees(
    base_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.middleware.org_context import resolve_org_context

    _patch_loaders(
        monkeypatch,
        org_row=_org_row(),
        member_row=_member_row(role="counselor"),
        supervisees=("supervisee-1", "supervisee-2"),
    )

    result = await resolve_org_context(
        user=_user(),
        org_id=VALID_ORG_ID,
        db=AsyncMock(),
    )
    assert result is not None
    assert result.supervisee_user_ids == ("supervisee-1", "supervisee-2")


# ─── 10. role_v2 显式 vs legacy fallback ────────────────────────


@pytest.mark.asyncio
async def test_explicit_role_v2_overrides_legacy(
    base_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    """member.role_v2 非空时优先, 不再走 legacy_role_to_v2"""
    from app.middleware.org_context import resolve_org_context

    _patch_loaders(
        monkeypatch,
        org_row=_org_row(settings={"orgType": "counseling"}),
        # legacy role 'counselor', 但 role_v2 已显式标 supervisor
        member_row=_member_row(role="counselor", role_v2="supervisor"),
    )

    result = await resolve_org_context(
        user=_user(),
        org_id=VALID_ORG_ID,
        db=AsyncMock(),
    )
    assert result is not None
    assert result.role_v2 == "supervisor"
    assert result.is_supervisor is True


@pytest.mark.asyncio
async def test_legacy_role_falls_back_via_legacy_role_to_v2(
    base_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    """role_v2=null 时, 走 legacy_role_to_v2(orgType, legacy_role)"""
    from app.middleware.org_context import resolve_org_context

    _patch_loaders(
        monkeypatch,
        # enterprise + 'org_admin' → role_v2 推成 hr_admin (合规硬隔离)
        org_row=_org_row(settings={"orgType": "enterprise"}),
        member_row=_member_row(role="org_admin", role_v2=None),
    )

    result = await resolve_org_context(
        user=_user(),
        org_id=VALID_ORG_ID,
        db=AsyncMock(),
    )
    assert result is not None
    assert result.role_v2 == "hr_admin"


# ─── 11. fullPracticeAccess 默认值 ───────────────────────────────


@pytest.mark.asyncio
async def test_org_admin_default_full_practice_access(
    base_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    """org_admin 默认 fullPracticeAccess=True (Node org-context.ts:208)"""
    from app.middleware.org_context import resolve_org_context

    _patch_loaders(
        monkeypatch,
        org_row=_org_row(),
        # 不传 full_practice_access (默认 None, 模拟 DB NULL), role=org_admin → 应推成 True
        member_row=_member_row(role="org_admin"),
    )

    result = await resolve_org_context(
        user=_user(),
        org_id=VALID_ORG_ID,
        db=AsyncMock(),
    )
    assert result is not None
    assert result.full_practice_access is True


@pytest.mark.asyncio
async def test_counselor_full_practice_access_explicit(
    base_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    """counselor 默认 fullPracticeAccess=False, 显式 True 时透传"""
    from app.middleware.org_context import resolve_org_context

    _patch_loaders(
        monkeypatch,
        org_row=_org_row(),
        member_row=_member_row(role="counselor", full_practice_access=True),
    )

    result = await resolve_org_context(
        user=_user(),
        org_id=VALID_ORG_ID,
        db=AsyncMock(),
    )
    assert result is not None
    assert result.full_practice_access is True
    # supervisor 也派生 = True (counselor + fullPractice = clinic supervisor 模式)
    assert result.is_supervisor is True


# ─── 12. access_profile.dataClasses 合并 ────────────────────────


@pytest.mark.asyncio
async def test_access_profile_data_classes_merged(
    base_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    """
    member.access_profile.dataClasses 与 ROLE_DATA_CLASS_POLICY[role_v2] 取 union。
    场景: clinic_admin 默认无 phi_full, 但被 access_profile 单点开通后能读。
    """
    from app.middleware.org_context import resolve_org_context

    _patch_loaders(
        monkeypatch,
        org_row=_org_row(settings={"orgType": "counseling"}),
        member_row=_member_row(
            role="org_admin",  # → role_v2 = clinic_admin
            access_profile={"dataClasses": ["phi_full"]},
        ),
    )

    result = await resolve_org_context(
        user=_user(),
        org_id=VALID_ORG_ID,
        db=AsyncMock(),
    )
    assert result is not None
    assert result.role_v2 == "clinic_admin"
    # ROLE_DATA_CLASS_POLICY[clinic_admin] = (phi_summary, de_identified, aggregate)
    # ∪ access_profile = + phi_full
    assert result.allowed_data_classes is not None
    assert "phi_full" in result.allowed_data_classes
    assert "phi_summary" in result.allowed_data_classes
    assert "aggregate" in result.allowed_data_classes


@pytest.mark.asyncio
async def test_no_access_profile_uses_role_default(
    base_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    """access_profile=None → 走 ROLE_DATA_CLASS_POLICY[role_v2] 默认"""
    from app.middleware.org_context import resolve_org_context

    _patch_loaders(
        monkeypatch,
        org_row=_org_row(settings={"orgType": "counseling"}),
        member_row=_member_row(role="counselor", access_profile=None),
    )

    result = await resolve_org_context(
        user=_user(),
        org_id=VALID_ORG_ID,
        db=AsyncMock(),
    )
    assert result is not None
    # counselor 默认: phi_full / phi_summary / de_identified / aggregate
    assert result.allowed_data_classes is not None
    assert set(result.allowed_data_classes) == {
        "phi_full",
        "phi_summary",
        "de_identified",
        "aggregate",
    }


# ─── License (Phase 1.6 阶段全部 NO_LICENSE) ─────────────────


@pytest.mark.asyncio
async def test_license_defaults_to_none_status_phase_1_6(
    base_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    """
    Phase 1.6: lib/license/verify 还没 port (RSA JWT 解析另一坑), 所以暂时所有
    license 都按 'no license' 走, tier 由 plan 推。Phase X (TBD) 加 verifyLicense 后,
    这里测试要扩展为 license 有效 / 过期 / 无效 三种情形。
    """
    from app.middleware.org_context import resolve_org_context

    _patch_loaders(
        monkeypatch,
        org_row=_org_row(plan="premium", license_key="some-license-token"),
        member_row=_member_row(role="counselor"),
    )

    result = await resolve_org_context(
        user=_user(),
        org_id=VALID_ORG_ID,
        db=AsyncMock(),
    )
    assert result is not None
    assert result.license.status == "none"
    # 有 licenseKey 但没 verify, fallback 到 plan_to_tier(premium) = flagship
    assert result.tier == "flagship"


# ─── DB helper stubs (Phase 2 ORM 占位) ──────────────────────


@pytest.mark.asyncio
async def test_load_org_row_stub_returns_none_phase_1_6(
    base_env: pytest.MonkeyPatch,
) -> None:
    """Phase 1.6 占位: helper 默认返回 None, Phase 2 接 ORM 后填实。"""
    from app.middleware.org_context import _load_org_row

    result = await _load_org_row(AsyncMock(), VALID_ORG_ID)
    assert result is None


@pytest.mark.asyncio
async def test_load_member_row_stub_returns_none_phase_1_6(
    base_env: pytest.MonkeyPatch,
) -> None:
    from app.middleware.org_context import _load_member_row

    result = await _load_member_row(AsyncMock(), VALID_ORG_ID, "user-1")
    assert result is None


@pytest.mark.asyncio
async def test_load_supervisees_stub_returns_empty_phase_1_6(
    base_env: pytest.MonkeyPatch,
) -> None:
    from app.middleware.org_context import _load_supervisee_user_ids

    result = await _load_supervisee_user_ids(AsyncMock(), "member-1", VALID_ORG_ID)
    assert result == ()


# ─── get_data_scope dispatches via resolve (FastAPI Dependency) ───


@pytest.mark.asyncio
async def test_get_org_context_extracts_org_id_from_path(
    base_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    """
    get_org_context 是 FastAPI Dependency, 从 request.path_params['org_id'] 抽 org_id,
    再调 resolve_org_context.
    """
    from unittest.mock import MagicMock

    from app.middleware import org_context as oc

    captured: dict[str, Any] = {}
    sentinel = object()

    async def mock_resolve(user: Any, org_id: Any, db: Any) -> Any:
        captured["org_id"] = org_id
        return sentinel

    monkeypatch.setattr(oc, "resolve_org_context", mock_resolve)

    request = MagicMock()
    request.path_params = {"org_id": VALID_ORG_ID}

    result = await oc.get_org_context(
        user=_user(),
        request=request,
        db=AsyncMock(),
    )
    assert result is sentinel
    assert captured["org_id"] == VALID_ORG_ID


@pytest.mark.asyncio
async def test_get_org_context_no_path_param_returns_none(
    base_env: pytest.MonkeyPatch,
) -> None:
    """路由没 {org_id} path param → 直接返 None, 不进 resolve"""
    from unittest.mock import MagicMock

    from app.middleware.org_context import get_org_context

    request = MagicMock()
    request.path_params = {}  # 无 org_id

    result = await get_org_context(
        user=_user(),
        request=request,
        db=AsyncMock(),
    )
    assert result is None
