"""
Reminder settings routes — 镜像
``server/src/modules/notification/reminder-settings.routes.ts``
``reminderSettingsRoutes`` (1-42 行)。

覆盖:
  - GET /  无配置 → 默认 ``{enabled, channels=['email'], remind_before=[1440,60]}``
  - GET /  有配置 → 该行 shape
  - PUT /  org_admin: insert / update + audit
  - PUT /  counselor: 403 (requireRole('org_admin'))
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi.testclient import TestClient

    from tests.api.v1.notification.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"
_REMINDER_ID = "60000000-0000-0000-0000-000000000001"


def _make_reminder_settings() -> object:
    from app.db.models.reminder_settings import ReminderSettings

    rs = ReminderSettings()
    rs.id = uuid.UUID(_REMINDER_ID)
    rs.org_id = uuid.UUID(_ORG_ID)
    rs.enabled = True
    rs.channels = ["email", "sms"]
    rs.remind_before = [1440, 60]
    rs.email_config = {"smtp_host": "mail.x.com"}
    rs.sms_config = {}
    rs.message_template = {"subject": "提醒"}
    rs.created_at = datetime.now(UTC)
    rs.updated_at = datetime.now(UTC)
    return rs


# ─── GET / ─────────────────────────────────────────────────────


def test_get_reminder_settings_default_when_no_row(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """无配置行 → 返默认 shape (与 Node ``settings || { ... }`` 一致)。"""
    setup_db_results([None])
    response = admin_client.get(f"/api/orgs/{_ORG_ID}/reminder-settings/")
    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is True
    assert body["channels"] == ["email"]
    assert body["remindBefore"] == [1440, 60]


def test_get_reminder_settings_returns_row(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """有配置行 → 返该行 (camelCase wire)。"""
    rs = _make_reminder_settings()
    setup_db_results([rs])

    response = admin_client.get(f"/api/orgs/{_ORG_ID}/reminder-settings/")
    assert response.status_code == 200
    body = response.json()
    assert body["channels"] == ["email", "sms"]
    assert body["remindBefore"] == [1440, 60]
    assert body["emailConfig"] == {"smtp_host": "mail.x.com"}


# ─── PUT / upsert ──────────────────────────────────────────────


def test_put_reminder_settings_rejects_counselor(counselor_client: TestClient) -> None:
    """counselor 被 requireRole('org_admin') 拦截 → 403。"""
    response = counselor_client.put(
        f"/api/orgs/{_ORG_ID}/reminder-settings/",
        json={"enabled": False},
    )
    assert response.status_code == 403


def test_put_reminder_settings_creates_when_missing(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: object,
) -> None:
    """无 row → insert 路径 + audit。"""
    from unittest.mock import AsyncMock

    setup_db_results([None])  # existing query → None

    async def fake_refresh(obj: object) -> None:
        obj.id = uuid.UUID(_REMINDER_ID)  # type: ignore[attr-defined]
        obj.created_at = datetime.now(UTC)  # type: ignore[attr-defined]
        obj.updated_at = datetime.now(UTC)  # type: ignore[attr-defined]

    mock_db.refresh = AsyncMock(side_effect=fake_refresh)  # type: ignore[attr-defined]

    response = admin_client.put(
        f"/api/orgs/{_ORG_ID}/reminder-settings/",
        json={"enabled": True, "channels": ["email", "sms"]},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["channels"] == ["email", "sms"]
    assert body["remindBefore"] == [1440, 60]  # 默认填充
    mock_db.commit.assert_awaited()  # type: ignore[attr-defined]


def test_put_reminder_settings_updates_existing(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: object,
) -> None:
    """有 row → update 路径 + audit, 仅打到提供的字段。"""
    from unittest.mock import AsyncMock

    rs = _make_reminder_settings()
    setup_db_results([rs])

    async def fake_refresh(obj: object) -> None:
        # 不改, 只让调用通过
        pass

    mock_db.refresh = AsyncMock(side_effect=fake_refresh)  # type: ignore[attr-defined]

    response = admin_client.put(
        f"/api/orgs/{_ORG_ID}/reminder-settings/",
        json={"enabled": False},
    )
    assert response.status_code == 200
    # ORM 上 enabled 已被 router 改为 False
    assert rs.enabled is False  # type: ignore[attr-defined]
    mock_db.commit.assert_awaited()  # type: ignore[attr-defined]
