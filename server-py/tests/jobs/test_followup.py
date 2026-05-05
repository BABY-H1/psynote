"""
Tests for app/jobs/followup.py — Phase 4。

覆盖:
  - dispatch_due_followups 扫 active 且 next_due <= now 的 plans, 计数
  - notify_followup 单 plan: paused/completed → skip
  - 非法 UUID → skip 不 raise
  - missing plan → not_found
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

if TYPE_CHECKING:
    from tests.jobs.conftest import SetupDbResults


def _make_followup_plan(
    *,
    status: str = "active",
    next_due_offset_days: int | None = -1,  # -1 = 1 天前 (已到期)
) -> object:
    from app.db.models.follow_up_plans import FollowUpPlan

    plan = FollowUpPlan()
    plan.id = uuid.uuid4()
    plan.org_id = uuid.uuid4()
    plan.care_episode_id = uuid.uuid4()
    plan.counselor_id = uuid.uuid4()
    plan.plan_type = "periodic_assessment"
    plan.status = status
    if next_due_offset_days is not None:
        plan.next_due = datetime.now(UTC) + timedelta(days=next_due_offset_days)
    else:
        plan.next_due = None  # type: ignore[assignment]
    return plan


# ─── dispatch_due_followups ─────────────────────────────────────


def test_dispatch_due_followups_returns_counts(
    patch_session_maker: AsyncMock,
    setup_db_results: SetupDbResults,
) -> None:
    """3 个到期 plan → due=3, 全 stub 通知 (Phase 4 stub: counselor + client 都 +1)."""
    from app.jobs.followup import dispatch_due_followups

    plans = [
        _make_followup_plan(),
        _make_followup_plan(),
        _make_followup_plan(),
    ]
    setup_db_results([plans])

    result = dispatch_due_followups()
    assert result["due_count"] == 3
    assert result["notified_counselors"] == 3
    assert result["notified_clients"] == 3


def test_dispatch_due_followups_with_no_due(
    patch_session_maker: AsyncMock,
    setup_db_results: SetupDbResults,
) -> None:
    from app.jobs.followup import dispatch_due_followups

    setup_db_results([[]])
    result = dispatch_due_followups()
    assert result == {"due_count": 0, "notified_counselors": 0, "notified_clients": 0}


# ─── notify_followup (单 plan) ──────────────────────────────────


def test_notify_followup_with_active_plan(
    patch_session_maker: AsyncMock,
    setup_db_results: SetupDbResults,
) -> None:
    from app.jobs.followup import notify_followup

    plan = _make_followup_plan()
    setup_db_results([plan])

    result = notify_followup(str(plan.id))
    assert result["notified"] is True
    assert result["plan_id"] == str(plan.id)


def test_notify_followup_skips_paused_plan(
    patch_session_maker: AsyncMock,
    setup_db_results: SetupDbResults,
) -> None:
    from app.jobs.followup import notify_followup

    plan = _make_followup_plan(status="paused")
    setup_db_results([plan])

    result = notify_followup(str(plan.id))
    assert result["notified"] is False
    assert result["reason"] == "plan_status_paused"


def test_notify_followup_with_invalid_uuid_returns_error(
    patch_session_maker: AsyncMock,
) -> None:
    from app.jobs.followup import notify_followup

    result = notify_followup("not-a-uuid")
    assert result == {"notified": False, "reason": "invalid_plan_id"}
    patch_session_maker.execute.assert_not_called()


def test_notify_followup_with_missing_plan_returns_not_found(
    patch_session_maker: AsyncMock,
    setup_db_results: SetupDbResults,
) -> None:
    from app.jobs.followup import notify_followup

    setup_db_results([None])
    result = notify_followup(str(uuid.uuid4()))
    assert result == {"notified": False, "reason": "not_found"}
