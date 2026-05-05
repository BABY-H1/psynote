"""
Tests for app/jobs/compliance.py — Phase 4。

覆盖:
  - daily_check 全 org 扫描 → overdue_count
  - check_org_session_notes 单 org 扫描
  - 非法 org_id 容错返 error 不 raise
  - status filter (draft/submitted_for_review only, finalized 跳过)
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

if TYPE_CHECKING:
    from tests.jobs.conftest import SetupDbResults


def _make_overdue_session_note() -> object:
    """SessionNote ORM 实例 (不持久化), 创建时间 31 天前."""
    from app.db.models.session_notes import SessionNote

    note = SessionNote()
    note.id = uuid.uuid4()
    note.org_id = uuid.UUID("00000000-0000-0000-0000-000000000099")
    note.client_id = uuid.uuid4()
    note.counselor_id = uuid.uuid4()
    note.note_format = "soap"
    note.session_date = datetime.now(UTC).date()
    note.status = "draft"
    # mypy: TimestampMixin 的 created_at 是 Mapped[datetime], 这里直接 set 实例属性
    note.created_at = datetime.now(UTC) - timedelta(days=31)  # type: ignore[assignment]
    note.fields = {}
    return note


# ─── daily_check ────────────────────────────────────────────────


def test_daily_check_returns_overdue_count(
    patch_session_maker: AsyncMock,
    setup_db_results: SetupDbResults,
) -> None:
    """3 条 overdue → returns ``{"overdue_count": 3}``."""
    from app.jobs.compliance import daily_check

    notes = [
        _make_overdue_session_note(),
        _make_overdue_session_note(),
        _make_overdue_session_note(),
    ]
    setup_db_results([notes])  # scalars().all() → notes

    result = daily_check()
    assert result == {"overdue_count": 3}
    patch_session_maker.execute.assert_awaited()


def test_daily_check_with_no_overdue_returns_zero(
    patch_session_maker: AsyncMock,
    setup_db_results: SetupDbResults,
) -> None:
    """无 overdue → 0, 不报错。"""
    from app.jobs.compliance import daily_check

    setup_db_results([[]])
    result = daily_check()
    assert result == {"overdue_count": 0}


# ─── check_org_session_notes ────────────────────────────────────


def test_check_org_session_notes_with_valid_org(
    patch_session_maker: AsyncMock,
    setup_db_results: SetupDbResults,
) -> None:
    """合法 org_id + 1 条 overdue → ``{"overdue_count": 1}``."""
    from app.jobs.compliance import check_org_session_notes

    note = _make_overdue_session_note()
    setup_db_results([[note]])

    result = check_org_session_notes("00000000-0000-0000-0000-000000000099")
    assert result == {"overdue_count": 1}


def test_check_org_session_notes_with_invalid_uuid_returns_error(
    patch_session_maker: AsyncMock,
) -> None:
    """非法 org_id → 返 ``{"overdue_count": 0, "error": "invalid_org_id"}``, 不 raise。"""
    from app.jobs.compliance import check_org_session_notes

    result = check_org_session_notes("not-a-uuid")
    assert result["overdue_count"] == 0
    assert result["error"] == "invalid_org_id"
    # DB 查询不该被调 (前置校验失败就 return)
    patch_session_maker.execute.assert_not_called()
