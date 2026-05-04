"""
Tests for app/middleware/phi_access.py — record_phi_access PHI 审计 utility。

镜像 server/src/middleware/audit.ts 的 logPhiAccess。

Phase 1.7 阶段: ``_write_phi_log`` 是 no-op 占位 (Phase 2 ORM 后替换为 INSERT
``phi_access_logs`` 表)。tests 用 monkeypatch.setattr 捕获 helper 被调用时的
log entry, 验证字段组装正确 + 错误吞掉。
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest

# ─── helper: capture _write_phi_log 调用 ────────────────────────


def _patch_write(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """替换 _write_phi_log, 把每次调用的 log_entry 收集进 list 返还给测试。"""
    from app.middleware import phi_access as pa

    captured: list[dict[str, Any]] = []

    async def mock_write(_db: Any, log_entry: dict[str, Any]) -> None:
        captured.append(log_entry)

    monkeypatch.setattr(pa, "_write_phi_log", mock_write)
    return captured


# ─── 基本字段组装 ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_record_phi_access_minimal_fields(
    base_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    """只传必填项, 可选字段全 None"""
    captured = _patch_write(monkeypatch)
    from app.middleware.phi_access import record_phi_access

    await record_phi_access(
        db=AsyncMock(),
        org_id="org-1",
        user_id="user-1",
        client_id="client-1",
        resource="case_note",
        action="view",
    )

    assert len(captured) == 1
    entry = captured[0]
    assert entry["org_id"] == "org-1"
    assert entry["user_id"] == "user-1"
    assert entry["client_id"] == "client-1"
    assert entry["resource"] == "case_note"
    assert entry["action"] == "view"
    # 可选字段全 None
    assert entry["resource_id"] is None
    assert entry["reason"] is None
    assert entry["data_class"] is None
    assert entry["actor_role_snapshot"] is None
    assert entry["ip_address"] is None
    assert entry["user_agent"] is None


@pytest.mark.asyncio
async def test_record_phi_access_full_fields(
    base_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured = _patch_write(monkeypatch)
    from app.middleware.phi_access import record_phi_access

    await record_phi_access(
        db=AsyncMock(),
        org_id="org-1",
        user_id="user-1",
        client_id="client-1",
        resource="case_note",
        action="export",
        resource_id="note-42",
        reason="downloaded for referral",
        data_class="phi_full",
        actor_role_snapshot="counselor",
        ip_address="10.0.0.1",
        user_agent="Mozilla/5.0",
    )

    assert len(captured) == 1
    entry = captured[0]
    assert entry["resource_id"] == "note-42"
    assert entry["reason"] == "downloaded for referral"
    assert entry["data_class"] == "phi_full"
    assert entry["actor_role_snapshot"] == "counselor"
    assert entry["ip_address"] == "10.0.0.1"
    assert entry["user_agent"] == "Mozilla/5.0"


# ─── action enum ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_record_phi_access_all_action_types(
    base_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    """4 种 action: view / export / print / share (与 Node 一致)"""
    captured = _patch_write(monkeypatch)
    from app.middleware.phi_access import record_phi_access

    for action in ("view", "export", "print", "share"):
        await record_phi_access(
            db=AsyncMock(),
            org_id="o",
            user_id="u",
            client_id="c",
            resource="r",
            action=action,  # type: ignore[arg-type]
        )

    assert len(captured) == 4
    assert [c["action"] for c in captured] == ["view", "export", "print", "share"]


# ─── DB 错误必须 swallow (audit 不能阻塞主流程) ─────────────────


@pytest.mark.asyncio
async def test_db_error_does_not_propagate(
    base_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    """与 Node audit.ts 一致: PHI log 写失败不破主请求, 只 log err"""
    from app.middleware import phi_access as pa
    from app.middleware.phi_access import record_phi_access

    async def boom(_db: Any, _entry: dict[str, Any]) -> None:
        raise RuntimeError("DB connection lost")

    monkeypatch.setattr(pa, "_write_phi_log", boom)

    # 不应抛异常
    await record_phi_access(
        db=AsyncMock(),
        org_id="o",
        user_id="u",
        client_id="c",
        resource="r",
        action="view",
    )


# ─── _write_phi_log 占位 (Phase 2 ORM 后填实) ───────────────────


@pytest.mark.asyncio
async def test_write_phi_log_stub_is_noop_phase_1_7(
    base_env: pytest.MonkeyPatch,
) -> None:
    """Phase 1.7 阶段 _write_phi_log 是 no-op (Phase 2 ORM 后真插)"""
    from app.middleware.phi_access import _write_phi_log

    # 应静默返回 None, 不抛异常
    result = await _write_phi_log(AsyncMock(), {"any": "dict"})
    assert result is None


# ─── log entry 是否被传给 helper (而不是位置参) ────────────────


@pytest.mark.asyncio
async def test_record_phi_access_passes_dict_to_helper(
    base_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    """确认 record_phi_access 把组装好的 log dict 传给 _write_phi_log (而非分散参数)"""
    from app.middleware import phi_access as pa
    from app.middleware.phi_access import record_phi_access

    seen: list[Any] = []

    async def capture(db: Any, entry: Any) -> None:
        seen.append((db, entry))

    monkeypatch.setattr(pa, "_write_phi_log", capture)

    db_mock = AsyncMock()
    await record_phi_access(
        db=db_mock,
        org_id="o",
        user_id="u",
        client_id="c",
        resource="r",
        action="view",
    )

    assert len(seen) == 1
    db_arg, entry_arg = seen[0]
    assert db_arg is db_mock
    assert isinstance(entry_arg, dict)
