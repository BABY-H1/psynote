"""
Group scheme routes — 镜像 Node ``server/src/modules/group/scheme.routes.ts`` 的端点测试.

覆盖 5 endpoints + RBAC + visibility + ownership.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.group.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"
_OTHER_ORG_ID = "00000000-0000-0000-0000-000000000088"
_SCHEME_ID = "00000000-0000-0000-0000-000000000111"


# ─── GET / (列表) ─────────────────────────────────────────────


def test_list_schemes_happy_returns_with_sessions(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_scheme: object,
    make_scheme_session: object,
) -> None:
    """正常列表: schemes 行 + 子 sessions 一起回."""
    scheme = make_scheme(title="A")  # type: ignore[operator]
    scheme_session = make_scheme_session(scheme_id=scheme.id, title="S1", sort_order=0)  # type: ignore[operator]
    setup_db_results([[scheme], [scheme_session]])

    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/group/schemes/")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) == 1
    assert body[0]["title"] == "A"
    assert body[0]["visibility"] == "personal"
    assert len(body[0]["sessions"]) == 1
    assert body[0]["sessions"][0]["title"] == "S1"


def test_list_schemes_empty_returns_empty_list(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """无 scheme → 直接返 [], 不查 sessions (优化)."""
    setup_db_results([[]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/group/schemes/")
    assert r.status_code == 200
    assert r.json() == []


def test_list_schemes_rejects_client_role(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.get(f"/api/orgs/{_ORG_ID}/group/schemes/")
    assert r.status_code == 403


# ─── GET /:scheme_id ──────────────────────────────────────────


def test_get_scheme_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_scheme: object,
    make_scheme_session: object,
) -> None:
    scheme = make_scheme()  # type: ignore[operator]
    sess = make_scheme_session(scheme_id=scheme.id)  # type: ignore[operator]
    setup_db_results([scheme, [sess]])

    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/group/schemes/{_SCHEME_ID}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == _SCHEME_ID
    assert len(body["sessions"]) == 1


def test_get_scheme_not_found_returns_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/group/schemes/{_SCHEME_ID}")
    assert r.status_code == 404


# ─── POST / (创建) ────────────────────────────────────────────


def test_create_scheme_happy_with_sessions(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """创建 + 含 sessions: scheme 一次插入 + sessions 一次插入 + 重读 sessions."""
    # POST /: post-flush re-load sessions + flush 后 ORM 实例已含 id
    setup_db_results([[]])  # sessions reload after create

    payload = {
        "title": "新方案",
        "visibility": "organization",
        "sessions": [
            {"title": "第一次", "sortOrder": 0},
            {"title": "第二次", "sortOrder": 1},
        ],
    }
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/group/schemes/", json=payload)
    assert r.status_code == 201
    body = r.json()
    assert body["title"] == "新方案"
    assert body["visibility"] == "organization"
    mock_db.commit.assert_awaited()


def test_create_scheme_missing_title_returns_400(
    admin_org_client: TestClient,
) -> None:
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/group/schemes/", json={"description": "no title"}
    )
    assert r.status_code == 400


def test_create_scheme_rejects_client_role(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.post(f"/api/orgs/{_ORG_ID}/group/schemes/", json={"title": "x"})
    assert r.status_code == 403


def test_create_scheme_allows_counselor(
    counselor_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """counselor 也能创建方案 (与 Node ``requireRole('org_admin', 'counselor')`` 一致)."""
    setup_db_results([[]])  # post-create sessions reload
    r = counselor_org_client.post(
        f"/api/orgs/{_ORG_ID}/group/schemes/", json={"title": "counselor scheme"}
    )
    assert r.status_code == 201


# ─── PATCH /:scheme_id ────────────────────────────────────────


def test_update_scheme_replaces_sessions_when_provided(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
    make_scheme: object,
) -> None:
    """传 sessions: 删旧 + 插新, 不传: 保留."""
    scheme = make_scheme()  # type: ignore[operator]
    setup_db_results([scheme, [], []])  # _assert_owned + delete sessions返回 + reload

    payload = {
        "title": "改后",
        "sessions": [{"title": "新 1"}],
    }
    r = admin_org_client.patch(f"/api/orgs/{_ORG_ID}/group/schemes/{_SCHEME_ID}", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "改后"
    mock_db.commit.assert_awaited()


def test_update_scheme_cross_org_returns_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_scheme: object,
) -> None:
    """跨 org 改方案 → 404 (ownership 防 enumeration)."""
    import uuid as uuid_module

    other = make_scheme(  # type: ignore[operator]
        org_id=uuid_module.UUID(_OTHER_ORG_ID)
    )
    setup_db_results([other])

    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/group/schemes/{_SCHEME_ID}", json={"title": "x"}
    )
    assert r.status_code == 404


def test_update_scheme_rejects_client_role(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.patch(
        f"/api/orgs/{_ORG_ID}/group/schemes/{_SCHEME_ID}", json={"title": "x"}
    )
    assert r.status_code == 403


# ─── DELETE /:scheme_id ───────────────────────────────────────


def test_delete_scheme_admin_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
    make_scheme: object,
) -> None:
    scheme = make_scheme()  # type: ignore[operator]
    setup_db_results([scheme, None])  # ownership check + delete

    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/group/schemes/{_SCHEME_ID}")
    assert r.status_code == 204
    mock_db.commit.assert_awaited()


def test_delete_scheme_rejects_counselor(
    counselor_org_client: TestClient,
) -> None:
    """delete 仅 org_admin (Node: requireRole('org_admin'))."""
    r = counselor_org_client.delete(f"/api/orgs/{_ORG_ID}/group/schemes/{_SCHEME_ID}")
    assert r.status_code == 403


def test_delete_scheme_not_found_returns_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])  # ownership check 找不到
    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/group/schemes/{_SCHEME_ID}")
    assert r.status_code == 404
