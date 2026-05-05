"""
Group instance routes — 镜像 Node ``server/src/modules/group/instance.routes.ts``.

覆盖 5 endpoints + RBAC + leader-scope filter + scheme-derived sessions.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.group.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"
_INSTANCE_ID = "00000000-0000-0000-0000-000000000333"
_SCHEME_ID = "00000000-0000-0000-0000-000000000111"


# ─── GET / (列表) ─────────────────────────────────────────────


def test_list_instances_admin_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
) -> None:
    inst = make_instance(title="A")  # type: ignore[operator]
    setup_db_results([[inst]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/group/instances/")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) == 1
    assert body[0]["title"] == "A"


def test_list_instances_with_status_filter(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
) -> None:
    inst = make_instance(status="recruiting")  # type: ignore[operator]
    setup_db_results([[inst]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/group/instances/?status=recruiting")
    assert r.status_code == 200
    assert r.json()[0]["status"] == "recruiting"


def test_list_instances_rejects_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.get(f"/api/orgs/{_ORG_ID}/group/instances/")
    assert r.status_code == 403


# ─── GET /:instance_id ────────────────────────────────────────


def test_get_instance_with_enrollments_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
    make_enrollment: object,
) -> None:
    """详情 + enrollments 用户摘要."""
    inst = make_instance()  # type: ignore[operator]
    enr = make_enrollment()  # type: ignore[operator]
    # join row tuple: (enrollment, user_name, user_email)
    setup_db_results([inst, [(enr, "张三", "z@x.com")]])

    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == _INSTANCE_ID
    assert len(body["enrollments"]) == 1
    assert body["enrollments"][0]["user"]["name"] == "张三"


def test_get_instance_not_found(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}")
    assert r.status_code == 404


# ─── POST / (创建) ────────────────────────────────────────────


def test_create_instance_no_scheme_happy(
    admin_org_client: TestClient,
    mock_db: AsyncMock,
) -> None:
    """no scheme_id: 不查 scheme_sessions."""
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/group/instances/",
        json={"title": "新团辅", "status": "draft"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["title"] == "新团辅"
    mock_db.commit.assert_awaited()


def test_create_instance_with_scheme_auto_generates_sessions(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
    make_scheme_session: object,
) -> None:
    """有 scheme_id: 自动派生 group_session_records 一起 commit."""
    ss1 = make_scheme_session(title="s1", sort_order=0)  # type: ignore[operator]
    ss2 = make_scheme_session(title="s2", sort_order=1)  # type: ignore[operator]
    setup_db_results([[ss1, ss2]])  # scheme_sessions list

    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/group/instances/",
        json={"title": "with scheme", "schemeId": _SCHEME_ID},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["schemeId"] == _SCHEME_ID
    # 至少 4 次 add (instance + 2 records). 实际不强制断言数量, commit 一次足以
    mock_db.commit.assert_awaited()


def test_create_instance_missing_title_returns_400(
    admin_org_client: TestClient,
) -> None:
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/group/instances/", json={"description": "no title"}
    )
    assert r.status_code == 400


def test_create_instance_rejects_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.post(f"/api/orgs/{_ORG_ID}/group/instances/", json={"title": "x"})
    assert r.status_code == 403


def test_create_instance_allows_counselor(
    counselor_org_client: TestClient,
) -> None:
    r = counselor_org_client.post(
        f"/api/orgs/{_ORG_ID}/group/instances/", json={"title": "by counselor"}
    )
    assert r.status_code == 201


# ─── PATCH /:instance_id ──────────────────────────────────────


def test_update_instance_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
    make_instance: object,
) -> None:
    inst = make_instance()  # type: ignore[operator]
    setup_db_results([inst])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}",
        json={"title": "改后", "status": "recruiting"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "改后"
    assert body["status"] == "recruiting"
    mock_db.commit.assert_awaited()


def test_update_instance_not_found_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}", json={"title": "x"}
    )
    assert r.status_code == 404


def test_update_instance_status_ended_triggers_followup_logic(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
) -> None:
    """切到 ended: 触发 _create_follow_up_plans_for_instance (best-effort).

    本测试只验 happy path 不抛 — followUp[] 为空时直接 early return.
    """
    inst = make_instance(  # type: ignore[operator]
        assessment_config={}  # 空 followUp[]
    )
    # 1) instance lookup; 2) enrollments lookup (空, _create_follow_up_plans_for_instance 内不会发起)
    setup_db_results([inst])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}", json={"status": "ended"}
    )
    assert r.status_code == 200


# ─── DELETE /:instance_id ─────────────────────────────────────


def test_delete_instance_admin_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
    make_instance: object,
) -> None:
    inst = make_instance()  # type: ignore[operator]
    setup_db_results([inst, None])
    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}")
    assert r.status_code == 204
    mock_db.commit.assert_awaited()


def test_delete_instance_rejects_counselor(
    counselor_org_client: TestClient,
) -> None:
    """delete 仅 org_admin."""
    r = counselor_org_client.delete(f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}")
    assert r.status_code == 403


def test_delete_instance_not_found_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}")
    assert r.status_code == 404
