"""
Public appointment confirm/cancel — 镜像
``server/src/modules/notification/reminder-settings.routes.ts``
``publicAppointmentRoutes`` (44-90 行)。

无 auth — 邮件链接直接点开。返回 HTML, 不是 JSON。覆盖:
  - GET /confirm/{token}  token 找不到 → 404 HTML
  - GET /confirm/{token}  token 命中 → 200 + 标 client_confirmed_at
  - GET /cancel/{token}   token 命中 → 200 + status='cancelled'
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi.testclient import TestClient

    from tests.api.v1.notification.conftest import SetupDbResults


def _make_appointment(token: str = "test-token-123") -> object:
    from app.db.models.appointments import Appointment

    appt = Appointment()
    appt.id = uuid.UUID("70000000-0000-0000-0000-000000000001")
    appt.org_id = uuid.UUID("00000000-0000-0000-0000-000000000099")
    appt.client_id = uuid.UUID("80000000-0000-0000-0000-000000000001")
    appt.counselor_id = uuid.UUID("80000000-0000-0000-0000-000000000002")
    appt.start_time = datetime.now(UTC) + timedelta(days=1)
    appt.end_time = datetime.now(UTC) + timedelta(days=1, hours=1)
    appt.status = "pending"
    appt.confirm_token = token
    return appt


# ─── GET /confirm/{token} ──────────────────────────────────────


def test_confirm_with_unknown_token_returns_404_html(
    public_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """未知 token → 404 HTML。"""
    setup_db_results([None])
    response = public_client.get("/api/public/appointments/confirm/no-such-token")
    assert response.status_code == 404
    assert "text/html" in response.headers["content-type"]
    assert "无效" in response.text


def test_confirm_with_valid_token_returns_success_html(
    public_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """合法 token → 200 + 中文 success HTML + appt.client_confirmed_at 已设。"""
    appt = _make_appointment()
    setup_db_results([appt])

    response = public_client.get("/api/public/appointments/confirm/test-token-123")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "预约已确认" in response.text
    # ORM side effect: client_confirmed_at 已被 router 写入
    assert appt.client_confirmed_at is not None  # type: ignore[attr-defined]


# ─── GET /cancel/{token} ───────────────────────────────────────


def test_cancel_with_unknown_token_returns_404_html(
    public_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    response = public_client.get("/api/public/appointments/cancel/no-such-token")
    assert response.status_code == 404
    assert "text/html" in response.headers["content-type"]


def test_cancel_with_valid_token_marks_cancelled(
    public_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """合法 token → 200 + status='cancelled'。"""
    appt = _make_appointment()
    setup_db_results([appt])

    response = public_client.get("/api/public/appointments/cancel/test-token-123")
    assert response.status_code == 200
    assert "预约已取消" in response.text
    assert appt.status == "cancelled"  # type: ignore[attr-defined]
