"""
EAP Assignment routes tests — 镜像 ``server/src/modules/eap/eap-assignment.routes.ts`` 3 endpoints.

覆盖:
  - GET / (list happy + 无 partnerships → []  + admin guard)
  - POST / (create happy + partnership not active + counselor not member + duplicate + transactional)
  - DELETE /:id (happy + not found)
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.eap.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"
_PARTNERSHIP_ID = "00000000-0000-0000-0000-0000000000aa"
_ASSIGNMENT_ID = "00000000-0000-0000-0000-0000000000cc"
_COUNSELOR_ID = "00000000-0000-0000-0000-000000000010"


# ─── GET / ──────────────────────────────────────────────────────


def test_list_assignments_no_partnerships_returns_empty(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """provider 没 partnerships → 空 list."""
    setup_db_results([[]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/eap/assignments/")
    assert r.status_code == 200
    assert r.json()["assignments"] == []


def test_list_assignments_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_partnership: object,
) -> None:
    """list 完整 row."""
    p = make_partnership()  # type: ignore[operator]
    # 1) partnership_ids; 2) assignments rows (tuple form)
    setup_db_results([[(p.id,)], []])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/eap/assignments/")
    assert r.status_code == 200
    assert r.json()["assignments"] == []


def test_list_assignments_counselor_role_403(
    counselor_org_client: TestClient,
) -> None:
    r = counselor_org_client.get(f"/api/orgs/{_ORG_ID}/eap/assignments/")
    assert r.status_code == 403


# ─── POST / ─────────────────────────────────────────────────────


def test_create_assignment_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
    make_partnership: object,
    make_org_member: object,
) -> None:
    """完整链 — 创建 assignment + enterprise org_member, transactional."""
    p = make_partnership()  # type: ignore[operator]
    cm = make_org_member(role="counselor", specialties=["焦虑"])  # type: ignore[operator]
    # 1) partnership active+provider; 2) counselor is member; 3) dup None; 4) existing enterprise member None
    setup_db_results([p, cm, None, None])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/eap/assignments/",
        json={"partnershipId": _PARTNERSHIP_ID, "counselorUserId": _COUNSELOR_ID},
    )
    assert r.status_code == 201
    mock_db.commit.assert_awaited()


def test_create_assignment_partnership_not_active_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """partnership 不存在 / 不 active / 本 org 不是 provider → 404."""
    setup_db_results([None])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/eap/assignments/",
        json={"partnershipId": _PARTNERSHIP_ID, "counselorUserId": _COUNSELOR_ID},
    )
    assert r.status_code == 404


def test_create_assignment_counselor_not_member_400(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_partnership: object,
) -> None:
    """counselor 不是本 org 的 active counselor → 400."""
    p = make_partnership()  # type: ignore[operator]
    setup_db_results([p, None])  # partnership 存在 + counselor 找不到
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/eap/assignments/",
        json={"partnershipId": _PARTNERSHIP_ID, "counselorUserId": _COUNSELOR_ID},
    )
    assert r.status_code == 400


def test_create_assignment_duplicate_400(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_partnership: object,
    make_org_member: object,
    make_assignment: object,
) -> None:
    """已派遣同 enterprise + counselor → 400."""
    p = make_partnership()  # type: ignore[operator]
    cm = make_org_member(role="counselor")  # type: ignore[operator]
    existing = make_assignment()  # type: ignore[operator]
    # partnership + counselor + dup hit
    setup_db_results([p, cm, existing])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/eap/assignments/",
        json={"partnershipId": _PARTNERSHIP_ID, "counselorUserId": _COUNSELOR_ID},
    )
    assert r.status_code == 400


# ─── DELETE /:id ────────────────────────────────────────────────


def test_delete_assignment_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
    make_assignment: object,
) -> None:
    """撤销 — mark removed + 删 enterprise org_member."""
    a = make_assignment()  # type: ignore[operator]
    # 1) assignment lookup; 2) DELETE org_member returns nothing
    setup_db_results([a, None])
    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/eap/assignments/{_ASSIGNMENT_ID}")
    assert r.status_code == 204
    mock_db.commit.assert_awaited()


def test_delete_assignment_not_found(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/eap/assignments/{_ASSIGNMENT_ID}")
    assert r.status_code == 404
