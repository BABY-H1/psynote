"""
Client assignment router tests — 镜像 ``server/src/modules/counseling/client-assignment.routes.ts``。

Endpoints (3):
  GET    /                      — list (counselor 看自己, admin 看全部)
  POST   /                      — create (admin/counselor; onConflictDoNothing)
  DELETE /{assignment_id}       — delete (admin only!)

⚠ RBAC 核心: client_assignments 决定咨询师能看到哪些客户。
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.counseling.conftest import SetupDbResults

_ORG_ID = "00000000-0000-0000-0000-000000000099"
_ASSIGNMENT_ID = "00000000-0000-0000-0000-000000000888"


# ─── GET / 列表 ──────────────────────────────────────────────────


def test_list_assignments_admin_sees_all(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_assignment: object,
) -> None:
    a = make_assignment()  # type: ignore[operator]
    setup_db_results([[a]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/client-assignments/")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_list_assignments_counselor_sees_own(
    counselor_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_assignment: object,
) -> None:
    """counselor 调用时 service 只返自己分到的."""
    a = make_assignment()  # type: ignore[operator]
    setup_db_results([[a]])
    r = counselor_org_client.get(f"/api/orgs/{_ORG_ID}/client-assignments/")
    assert r.status_code == 200


def test_list_assignments_no_org_403(authed_client: TestClient) -> None:
    r = authed_client.get(f"/api/orgs/{_ORG_ID}/client-assignments/")
    assert r.status_code == 403


# ─── POST / 创建 ────────────────────────────────────────────────


def test_create_assignment_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    setup_db_results([None])  # no dup
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/client-assignments/",
        json={
            "clientId": "00000000-0000-0000-0000-000000000010",
            "counselorId": "00000000-0000-0000-0000-000000000001",
        },
    )
    assert r.status_code == 201
    mock_db.commit.assert_awaited()


def test_create_assignment_returns_existing_when_duplicate(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_assignment: object,
    mock_db: AsyncMock,
) -> None:
    """重复 (org+client+counselor) → onConflictDoNothing 等价: 返已存在那条。"""
    existing = make_assignment()  # type: ignore[operator]
    setup_db_results([existing])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/client-assignments/",
        json={
            "clientId": "00000000-0000-0000-0000-000000000010",
        },
    )
    assert r.status_code == 201  # status code 仍是 201, 但返已存在
    # 不应再 add 新行
    mock_db.add.assert_not_called()


def test_create_assignment_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG_ID}/client-assignments/",
        json={"clientId": "00000000-0000-0000-0000-000000000010"},
    )
    assert r.status_code == 403


# ─── DELETE /{assignment_id} ──────────────────────────────────


def test_delete_assignment_admin_only_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_assignment: object,
    mock_db: AsyncMock,
) -> None:
    a = make_assignment()  # type: ignore[operator]
    setup_db_results([a, None])
    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/client-assignments/{_ASSIGNMENT_ID}")
    assert r.status_code == 200
    mock_db.commit.assert_awaited()


def test_delete_assignment_403_when_counselor(counselor_org_client: TestClient) -> None:
    """counselor 不能删 (admin only)."""
    r = counselor_org_client.delete(f"/api/orgs/{_ORG_ID}/client-assignments/{_ASSIGNMENT_ID}")
    assert r.status_code == 403


def test_delete_assignment_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/client-assignments/{_ASSIGNMENT_ID}")
    assert r.status_code == 404
