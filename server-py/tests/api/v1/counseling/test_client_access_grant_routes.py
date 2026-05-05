"""
Client access grant router tests — 镜像
``server/src/modules/counseling/client-access-grant.routes.ts``。

Endpoints (3):
  GET    /                — list active (revoked_at IS NULL; counselor 看自己)
  POST   /                — create (onConflictDoNothing)
  DELETE /{grant_id}      — revoke (软删 set revoked_at)

详细 cases (本 router 是临时跨 RBAC 授权机制, 风险面大)。
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.counseling.conftest import SetupDbResults

_ORG_ID = "00000000-0000-0000-0000-000000000099"
_GRANT_ID = "00000000-0000-0000-0000-000000000999"
_OTHER_COUNSELOR = "00000000-0000-0000-0000-000000000050"


# ─── GET / 列表 ──────────────────────────────────────────────────


def test_list_active_grants_admin(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_grant: object,
) -> None:
    g = make_grant()  # type: ignore[operator]
    setup_db_results([[g]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/client-access-grants/")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_list_active_grants_counselor_sees_own(
    counselor_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_grant: object,
) -> None:
    g = make_grant()  # type: ignore[operator]
    setup_db_results([[g]])
    r = counselor_org_client.get(f"/api/orgs/{_ORG_ID}/client-access-grants/")
    assert r.status_code == 200


def test_list_active_grants_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.get(f"/api/orgs/{_ORG_ID}/client-access-grants/")
    assert r.status_code == 403


# ─── POST / 创建 ────────────────────────────────────────────────


def test_create_grant_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """新 grant: dup check → None, 然后 insert."""
    setup_db_results([None])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/client-access-grants/",
        json={
            "clientId": "00000000-0000-0000-0000-000000000010",
            "grantedToCounselorId": _OTHER_COUNSELOR,
            "reason": "代班 7 天",
        },
    )
    assert r.status_code == 201
    mock_db.commit.assert_awaited()


def test_create_grant_returns_existing_when_duplicate(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_grant: object,
    mock_db: AsyncMock,
) -> None:
    """同 (org+client+counselor) 已有 grant → 返已存在那条 (onConflictDoNothing 等价)."""
    existing = make_grant()  # type: ignore[operator]
    setup_db_results([existing])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/client-access-grants/",
        json={
            "clientId": "00000000-0000-0000-0000-000000000010",
            "grantedToCounselorId": str(existing.granted_to_counselor_id),
            "reason": "重复请求",
        },
    )
    assert r.status_code == 201
    mock_db.add.assert_not_called()


def test_create_grant_missing_reason_400(admin_org_client: TestClient) -> None:
    """reason 必填 — 缺 → 400."""
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/client-access-grants/",
        json={
            "clientId": "00000000-0000-0000-0000-000000000010",
            "grantedToCounselorId": _OTHER_COUNSELOR,
        },
    )
    assert r.status_code == 400


def test_create_grant_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG_ID}/client-access-grants/",
        json={
            "clientId": "00000000-0000-0000-0000-000000000010",
            "grantedToCounselorId": _OTHER_COUNSELOR,
            "reason": "x",
        },
    )
    assert r.status_code == 403


# ─── DELETE /{grant_id} 撤销 ──────────────────────────────────


def test_revoke_grant_happy_sets_revoked_at(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_grant: object,
    mock_db: AsyncMock,
) -> None:
    """成功 revoke 应设 revoked_at (软删)."""
    g = make_grant(revoked_at=None)  # type: ignore[operator]
    assert g.revoked_at is None
    setup_db_results([g])
    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/client-access-grants/{_GRANT_ID}")
    assert r.status_code == 200
    assert g.revoked_at is not None  # 已设 timestamp
    mock_db.commit.assert_awaited()


def test_revoke_grant_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/client-access-grants/{_GRANT_ID}")
    assert r.status_code == 404


def test_revoke_grant_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.delete(f"/api/orgs/{_ORG_ID}/client-access-grants/{_GRANT_ID}")
    assert r.status_code == 403
