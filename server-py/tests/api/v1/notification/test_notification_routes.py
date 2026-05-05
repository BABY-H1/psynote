"""
Notification routes — 镜像 ``server/src/modules/notification/notification.routes.ts``。

Node 端没 .test.ts 文件, Python 端首次 smoke tests, 覆盖:
  - GET /                          — list, 50 条/页, isRead 过滤
  - GET /unread-count              — 返 {count}
  - PATCH /{notification_id}/read  — 标记已读, 返更新后行
  - rejectClient: client role 调任何一个都 403
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi.testclient import TestClient

    from tests.api.v1.notification.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"
_NOTIFICATION_ID = "40000000-0000-0000-0000-000000000001"
_USER_ID = "00000000-0000-0000-0000-000000000001"


def _make_notification(*, is_read: bool = False) -> object:
    """构造 Notification ORM 实例 (不持久化)。"""
    from app.db.models.notifications import Notification

    n = Notification()
    n.id = uuid.UUID(_NOTIFICATION_ID)
    n.org_id = uuid.UUID(_ORG_ID)
    n.user_id = uuid.UUID(_USER_ID)
    n.type = "appointment_reminder"
    n.title = "提醒: 明天 10:00 预约"
    n.body = "请提前到达"
    n.ref_type = "appointment"
    n.ref_id = uuid.UUID("50000000-0000-0000-0000-000000000001")
    n.is_read = is_read
    n.created_at = datetime.now(UTC)
    return n


# ─── GET / 列表 ────────────────────────────────────────────────


def test_list_notifications_returns_rows(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """列出当前 user/org 的通知, camelCase wire。"""
    n = _make_notification()
    setup_db_results([[n]])

    response = admin_client.get(f"/api/orgs/{_ORG_ID}/notifications/")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == _NOTIFICATION_ID
    # camelCase wire
    assert body[0]["isRead"] is False
    assert body[0]["refType"] == "appointment"
    assert body[0]["userId"] == _USER_ID
    assert body[0]["orgId"] == _ORG_ID


def test_list_notifications_rejects_client_role(client_role_client: TestClient) -> None:
    """client role 被 rejectClient 中间件拦, 403 + 中文 message。"""
    response = client_role_client.get(f"/api/orgs/{_ORG_ID}/notifications/")
    assert response.status_code == 403
    assert "门户" in response.json()["message"]


# ─── GET /unread-count ─────────────────────────────────────────


def test_unread_count_returns_count(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """返 {count: int}, 来自 SQL COUNT(*)。"""
    setup_db_results([7])  # mock scalar_one() → 7
    response = admin_client.get(f"/api/orgs/{_ORG_ID}/notifications/unread-count")
    assert response.status_code == 200
    assert response.json() == {"count": 7}


def test_unread_count_rejects_client_role(client_role_client: TestClient) -> None:
    response = client_role_client.get(f"/api/orgs/{_ORG_ID}/notifications/unread-count")
    assert response.status_code == 403


# ─── PATCH /{notification_id}/read ─────────────────────────────


def test_mark_as_read_updates_row(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """合法 id → 200 + isRead True."""
    n = _make_notification(is_read=False)
    setup_db_results([n])

    response = admin_client.patch(f"/api/orgs/{_ORG_ID}/notifications/{_NOTIFICATION_ID}/read")
    assert response.status_code == 200
    body = response.json()
    # router 改了 ORM 实例的 is_read = True
    assert body["isRead"] is True


def test_mark_as_read_not_found(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """不存在 → 404。"""
    setup_db_results([None])
    response = admin_client.patch(f"/api/orgs/{_ORG_ID}/notifications/{_NOTIFICATION_ID}/read")
    assert response.status_code == 404


def test_mark_as_read_invalid_uuid(admin_client: TestClient) -> None:
    """非 UUID 形态 → 404 (path 参数解析失败 → router 抛 NotFoundError)。"""
    response = admin_client.patch(f"/api/orgs/{_ORG_ID}/notifications/not-a-uuid/read")
    assert response.status_code == 404
