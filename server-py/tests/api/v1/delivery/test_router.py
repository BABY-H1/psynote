"""
Delivery 路由测试 — 镜像 ``server/src/modules/delivery/delivery.routes.ts`` 端点。

Endpoints:
  GET    /api/orgs/{org_id}/services           — 跨模块聚合
  POST   /api/orgs/{org_id}/services/launch    — 统一 launch verb (6 actionType)

每端点 ≥2 case (happy + RBAC / sad)。
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.delivery.conftest import SetupDbResults

_ORG_ID = "00000000-0000-0000-0000-000000000099"
_USER_ID = "00000000-0000-0000-0000-000000000001"
_CLIENT_ID = "00000000-0000-0000-0000-000000000010"


# ─── GET /services 列表 ──────────────────────────────────────────


def test_list_services_happy_returns_aggregated_rows(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """4 分支 UNION 出 1 行 + total = 1。"""
    now = datetime(2026, 5, 1, tzinfo=UTC)
    row = {
        "id": "11111111-1111-1111-1111-111111111111",
        "kind": "counseling",
        "org_id": _ORG_ID,
        "title": "Alice",
        "status": "ongoing",
        "owner_id": _USER_ID,
        "participant_count": 1,
        "next_session_at": None,
        "last_activity_at": now,
        "created_at": now,
        "updated_at": now,
        "client_id": _CLIENT_ID,
        "client_name": "Alice",
        "current_risk": "level_1",
        "scheme_id": None,
        "capacity": None,
        "course_id": None,
        "course_type": None,
        "assessment_type": None,
    }
    # service.execute calls (FIFO): 1) main rows query, 2) count query
    setup_db_results([[row], 1])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/services/")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    assert body["items"][0]["kind"] == "counseling"
    assert body["items"][0]["clientName"] == "Alice"


def test_list_services_with_kind_and_status_filter(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """``?kind=counseling,group&status=ongoing`` 走 csv 解析 + 状态过滤分支。"""
    setup_db_results([[], 0])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/services/?kind=counseling,group&status=ongoing")
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0


def test_list_services_rejects_client_role(
    client_role_org_client: TestClient,
) -> None:
    """role='client' 不允许访问 (rejectClient)。"""
    r = client_role_org_client.get(f"/api/orgs/{_ORG_ID}/services/")
    assert r.status_code == 403


# ─── POST /services/launch ──────────────────────────────────────


def test_launch_validates_action_type(
    admin_org_client: TestClient,
) -> None:
    """缺 actionType → 400 (服务器统一 error_handler 把 422 重映射为 VALIDATION_ERROR 400)。"""
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/services/launch",
        json={"payload": {}},
    )
    assert r.status_code == 400
    assert r.json()["error"] == "VALIDATION_ERROR"


def test_launch_create_episode_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """create_episode 路径: launch_service flush 后返 episode.id."""
    # _create_episode 内只有 db.add + flush, 不 execute
    setup_db_results([])
    payload = {
        "actionType": "create_episode",
        "payload": {
            "clientId": _CLIENT_ID,
            "chiefComplaint": "焦虑",
        },
    }
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/services/launch", json=payload)
    assert r.status_code == 201
    body = r.json()
    assert body["kind"] == "counseling"
    assert body["summary"] == "个案已开启"
    mock_db.commit.assert_awaited()


def test_launch_create_episode_missing_client_id(
    admin_org_client: TestClient,
) -> None:
    """create_episode 缺 clientId → 400 ValidationError."""
    setup_payload = {
        "actionType": "create_episode",
        "payload": {"chiefComplaint": "焦虑"},
    }
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/services/launch", json=setup_payload)
    assert r.status_code == 400


def test_launch_send_consent_template_not_found(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """send_consent 模板不存在 → 404 NotFoundError."""
    setup_db_results([None])  # template lookup → None
    payload = {
        "actionType": "send_consent",
        "payload": {
            "templateId": "00000000-0000-0000-0000-000000000aaa",
            "clientUserId": _CLIENT_ID,
        },
    }
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/services/launch", json=payload)
    assert r.status_code == 404


def test_launch_rejects_client_role(
    client_role_org_client: TestClient,
) -> None:
    """role='client' → 403 (rejectClient)."""
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG_ID}/services/launch",
        json={"actionType": "create_episode", "payload": {"clientId": _CLIENT_ID}},
    )
    assert r.status_code == 403


def test_launch_course_unknown_course_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])  # courses 查不到
    payload = {
        "actionType": "launch_course",
        "payload": {"courseId": "00000000-0000-0000-0000-000000000bbb"},
    }
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/services/launch", json=payload)
    assert r.status_code == 404


def test_launch_group_requires_title(
    admin_org_client: TestClient,
) -> None:
    payload = {"actionType": "launch_group", "payload": {}}
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/services/launch", json=payload)
    assert r.status_code == 400


# 防 ruff 提示 uuid 未使用
_ = uuid
