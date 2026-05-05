"""
Tests for app/jobs/reminders.py — Phase 4。

覆盖:
  - dispatch_due_reminders 扫 24h + 1h 窗口, 返回计数
  - send_reminder 单预约: cancelled / completed / already_sent → skip
  - 非法 UUID / 非法 kind → skip 不 raise
  - 标记 reminder_sent_24h / reminder_sent_1h + commit
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

if TYPE_CHECKING:
    from tests.jobs.conftest import SetupDbResults


def _make_appointment(
    *,
    start_offset_minutes: int = 60,
    status: str = "confirmed",
    reminder_sent_24h: bool = False,
    reminder_sent_1h: bool = False,
) -> object:
    """Appointment ORM 实例 — start_time = now + start_offset_minutes."""
    from app.db.models.appointments import Appointment

    appt = Appointment()
    appt.id = uuid.uuid4()
    appt.org_id = uuid.uuid4()
    appt.client_id = uuid.uuid4()
    appt.counselor_id = uuid.uuid4()
    appt.start_time = datetime.now(UTC) + timedelta(minutes=start_offset_minutes)
    appt.end_time = appt.start_time + timedelta(minutes=50)
    appt.status = status
    appt.reminder_sent_24h = reminder_sent_24h
    appt.reminder_sent_1h = reminder_sent_1h
    return appt


# ─── dispatch_due_reminders ─────────────────────────────────────


def test_dispatch_due_reminders_returns_counts(
    patch_session_maker: AsyncMock,
    setup_db_results: SetupDbResults,
) -> None:
    """两轮查询: 24h 窗 + 1h 窗, 各返若干预约 → 计数对。"""
    from app.jobs.reminders import dispatch_due_reminders

    a24 = _make_appointment(start_offset_minutes=24 * 60)
    a1 = _make_appointment(start_offset_minutes=60)
    # FIFO: 第 1 次 execute → 24h 窗 (返 [a24]), 第 2 次 → 1h 窗 (返 [a1])
    setup_db_results([[a24], [a1]])

    result = dispatch_due_reminders()
    assert result == {"sent_24h": 1, "sent_1h": 1}


def test_dispatch_due_reminders_with_no_appointments(
    patch_session_maker: AsyncMock,
    setup_db_results: SetupDbResults,
) -> None:
    from app.jobs.reminders import dispatch_due_reminders

    setup_db_results([[], []])
    result = dispatch_due_reminders()
    assert result == {"sent_24h": 0, "sent_1h": 0}


# ─── send_reminder (单预约) ─────────────────────────────────────


def test_send_reminder_marks_sent_24h(
    patch_session_maker: AsyncMock,
    setup_db_results: SetupDbResults,
) -> None:
    """合法 24h 提醒 → reminder_sent_24h=True + commit + 返 sent=True。"""
    from app.jobs.reminders import send_reminder

    appt = _make_appointment(start_offset_minutes=24 * 60)
    setup_db_results([appt])

    result = send_reminder(str(appt.id), "24h")
    assert result == {"sent": True, "kind": "24h"}
    assert appt.reminder_sent_24h is True  # type: ignore[attr-defined]
    patch_session_maker.commit.assert_awaited()


def test_send_reminder_marks_sent_1h(
    patch_session_maker: AsyncMock,
    setup_db_results: SetupDbResults,
) -> None:
    from app.jobs.reminders import send_reminder

    appt = _make_appointment(start_offset_minutes=60)
    setup_db_results([appt])

    result = send_reminder(str(appt.id), "1h")
    assert result == {"sent": True, "kind": "1h"}
    assert appt.reminder_sent_1h is True  # type: ignore[attr-defined]


def test_send_reminder_skips_cancelled(
    patch_session_maker: AsyncMock,
    setup_db_results: SetupDbResults,
) -> None:
    """cancelled appointment → 不发, reason='appointment_status_cancelled'."""
    from app.jobs.reminders import send_reminder

    appt = _make_appointment(status="cancelled")
    setup_db_results([appt])

    result = send_reminder(str(appt.id), "24h")
    assert result["sent"] is False
    assert result["reason"] == "appointment_status_cancelled"


def test_send_reminder_skips_already_sent(
    patch_session_maker: AsyncMock,
    setup_db_results: SetupDbResults,
) -> None:
    """reminder_sent_24h 已 True → 跳过 (防重复)。"""
    from app.jobs.reminders import send_reminder

    appt = _make_appointment(reminder_sent_24h=True)
    setup_db_results([appt])

    result = send_reminder(str(appt.id), "24h")
    assert result["sent"] is False
    assert result["reason"] == "already_sent"


def test_send_reminder_with_invalid_uuid_returns_error(
    patch_session_maker: AsyncMock,
) -> None:
    from app.jobs.reminders import send_reminder

    result = send_reminder("not-a-uuid", "24h")
    assert result == {"sent": False, "reason": "invalid_appointment_id"}
    patch_session_maker.execute.assert_not_called()


def test_send_reminder_with_invalid_kind_returns_error(
    patch_session_maker: AsyncMock,
) -> None:
    """kind 不是 '24h'/'1h' → invalid_kind, 早返不查 DB。"""
    from app.jobs.reminders import send_reminder

    result = send_reminder(str(uuid.uuid4()), "invalid")
    assert result == {"sent": False, "reason": "invalid_kind"}
    patch_session_maker.execute.assert_not_called()


def test_send_reminder_with_missing_appointment_returns_not_found(
    patch_session_maker: AsyncMock,
    setup_db_results: SetupDbResults,
) -> None:
    from app.jobs.reminders import send_reminder

    setup_db_results([None])
    result = send_reminder(str(uuid.uuid4()), "24h")
    assert result == {"sent": False, "reason": "not_found"}
