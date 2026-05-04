"""
Tests for app/middleware/audit.py — record_audit (generic audit utility).

镜像 server/src/middleware/audit.ts logAudit。

与 ``record_phi_access`` 同样模式: DB write helper 是 no-op 占位 (Phase 2 ORM
后真插), tests 用 monkeypatch.setattr 捕获 helper 被调用时的 log entry。
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest


def _patch_write(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    from app.middleware import audit as au

    captured: list[dict[str, Any]] = []

    async def mock_write(_db: Any, log_entry: dict[str, Any]) -> None:
        captured.append(log_entry)

    monkeypatch.setattr(au, "_write_audit_log", mock_write)
    return captured


# ─── 字段组装 ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_record_audit_minimal(
    base_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured = _patch_write(monkeypatch)
    from app.middleware.audit import record_audit

    await record_audit(
        db=AsyncMock(),
        org_id="org-1",
        user_id="user-1",
        action="course.create",
        resource="course",
    )

    assert len(captured) == 1
    entry = captured[0]
    assert entry["org_id"] == "org-1"
    assert entry["user_id"] == "user-1"
    assert entry["action"] == "course.create"
    assert entry["resource"] == "course"
    assert entry["resource_id"] is None
    assert entry["changes"] is None
    assert entry["ip_address"] is None


@pytest.mark.asyncio
async def test_record_audit_with_changes_diff(
    base_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    """update 动作的 before/after diff 透传"""
    captured = _patch_write(monkeypatch)
    from app.middleware.audit import record_audit

    diff = {"name": {"old": "Old Name", "new": "New Name"}}
    await record_audit(
        db=AsyncMock(),
        org_id="org-1",
        user_id="user-1",
        action="course.update",
        resource="course",
        resource_id="course-42",
        changes=diff,
        ip_address="10.0.0.1",
    )

    assert captured[0]["changes"] == diff
    assert captured[0]["resource_id"] == "course-42"
    assert captured[0]["ip_address"] == "10.0.0.1"


@pytest.mark.asyncio
async def test_record_audit_allows_no_org(
    base_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    """sysadm 跨 org / 系统内部任务 可以 org_id=None"""
    captured = _patch_write(monkeypatch)
    from app.middleware.audit import record_audit

    await record_audit(
        db=AsyncMock(),
        org_id=None,
        user_id="sysadm-1",
        action="org.suspend",
        resource="organization",
        resource_id="org-2",
    )

    assert captured[0]["org_id"] is None
    assert captured[0]["user_id"] == "sysadm-1"


@pytest.mark.asyncio
async def test_record_audit_allows_no_user(
    base_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    """系统定时任务 / cron 可 user_id=None"""
    captured = _patch_write(monkeypatch)
    from app.middleware.audit import record_audit

    await record_audit(
        db=AsyncMock(),
        org_id="org-1",
        user_id=None,
        action="reminder.dispatch",
        resource="reminder_job",
    )

    assert captured[0]["user_id"] is None


# ─── DB 错误吞掉 (audit 不能阻塞主流程) ───────────────────────


@pytest.mark.asyncio
async def test_db_error_does_not_propagate(
    base_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.middleware import audit as au
    from app.middleware.audit import record_audit

    async def boom(_db: Any, _entry: dict[str, Any]) -> None:
        raise RuntimeError("DB unreachable")

    monkeypatch.setattr(au, "_write_audit_log", boom)

    # 不应抛异常
    await record_audit(
        db=AsyncMock(),
        org_id="o",
        user_id="u",
        action="x.y",
        resource="r",
    )


# ─── _write_audit_log 占位 ───────────────────────────────────


@pytest.mark.asyncio
async def test_write_audit_log_stub_is_noop_phase_1_7(
    base_env: pytest.MonkeyPatch,
) -> None:
    """Phase 1.7 阶段 _write_audit_log 是 no-op (Phase 2 ORM 后真插)"""
    from app.middleware.audit import _write_audit_log

    result = await _write_audit_log(AsyncMock(), {"any": "dict"})
    assert result is None
