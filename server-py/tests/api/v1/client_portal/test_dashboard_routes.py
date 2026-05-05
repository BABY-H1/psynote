"""Dashboard + timeline 路由测试.

镜像 client-dashboard.routes.ts: viewing-as 时 recentResults 强制空; timeline
guardian-blocked.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.client_portal.conftest import SetupDbResults

_ORG = "00000000-0000-0000-0000-000000000099"


def test_dashboard_returns_episode_results_appts_and_unread_count(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_episode: object,
    make_result: object,
    make_appointment: object,
) -> None:
    ep = make_episode()  # type: ignore[operator]
    rr = [make_result(client_visible=True)]  # type: ignore[operator]
    appts = [make_appointment(status_="confirmed")]  # type: ignore[operator]
    notifs: list[object] = []  # 未读 0
    setup_db_results([ep, rr, appts, notifs])
    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/dashboard")
    assert r.status_code == 200
    body = r.json()
    assert body["episode"] is not None
    assert len(body["recentResults"]) == 1
    assert len(body["upcomingAppointments"]) == 1
    assert body["unreadNotificationCount"] == 0


def test_dashboard_viewing_as_blanks_recent_results(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_relationship: object,
    make_episode: object,
    make_appointment: object,
    child_user_id: str,
) -> None:
    """监护人代查 (?as=child): recentResults 必须为空, 即便 DB 有数据."""
    rel = make_relationship()  # type: ignore[operator]
    ep = make_episode()  # type: ignore[operator]
    appts = [make_appointment(status_="confirmed")]  # type: ignore[operator]
    notifs: list[object] = []
    # query 顺序: relationship 校验 → episode → (跳过 results) → appts → notifs
    setup_db_results([rel, ep, appts, notifs])
    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/dashboard?as={child_user_id}")
    assert r.status_code == 200
    body = r.json()
    # Phase 14 invariant: 监护人不能看孩子的测评结果
    assert body["recentResults"] == []


def test_timeline_rejects_as_param(
    client_role_org_client: TestClient,
    child_user_id: str,
) -> None:
    """timeline guardian-blocked: ?as= 不同步即 403."""
    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/timeline?as={child_user_id}")
    assert r.status_code == 403


def test_timeline_returns_empty_when_no_episodes(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([[]])  # episodes 空
    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/timeline")
    assert r.status_code == 200
    assert r.json() == []
