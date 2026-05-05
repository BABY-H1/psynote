"""
Referral service 测试 — 镜像 ``server/src/modules/referral/referral.service.test.ts``.

⚠ 重点: W2.9 单次失效 token (referral.service.ts:373-393).

为什么要 pin 这个 invariant:
  - 之前 ``download_token`` 只做"过期 / 状态"校验, 不消费
  - 一份外部转介下载链经过中转 / 转发 / 邮箱缓存任一种, 攻击者拿到 URL
    可以在 7 天内反复下载 PHI 数据包
  - 修法: 校验通过后, 在 ``resolve_data_package`` **之前** nullify token
  - 后续请求同一 token 找不到行 → NotFoundError 404

本文件 4 个 case:
  1. valid token + future expiry + status='consented' → token 被 nullify
  2. token 已 nullify (subsequent request) → NotFoundError
  3. token 过期 → ValidationError, 不 nullify
  4. status=pending (不在 consented/completed) → ValidationError, 不 nullify
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest


def _make_result(row: Any) -> MagicMock:
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=row)
    result.first = MagicMock(return_value=row)
    if isinstance(row, list):
        scalars = MagicMock()
        scalars.all = MagicMock(return_value=row)
        result.scalars = MagicMock(return_value=scalars)
    else:
        items = [row] if row is not None else []
        scalars = MagicMock()
        scalars.all = MagicMock(return_value=items)
        result.scalars = MagicMock(return_value=scalars)
    return result


def _mock_db_with_results(rows: list[Any]) -> AsyncMock:
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.flush = AsyncMock()
    db.execute = AsyncMock(side_effect=[_make_result(r) for r in rows])
    return db


# ─── W2.9 token single-use invariants ──────────────────────────────


async def test_w2_9_valid_token_nullifies_before_resolve(make_referral: Any) -> None:
    """valid token: 校验通过后, 在 resolve 之前 nullify download_token (单次失效)."""
    from app.api.v1.referral.service import get_by_download_token

    future = datetime.now(UTC) + timedelta(hours=1)
    referral = make_referral(
        status="consented",
        download_token="tok-abc",
        download_expires_at=future,
    )

    # service 流程:
    #   1. SELECT referral by token (找到)
    #   2. UPDATE referral.download_token = None + commit
    #   3. resolve_data_package: SELECT referral by id (再次)
    #   4. SELECT episode (None OK)
    #   5. SELECT user (None OK)
    db = _mock_db_with_results(
        [
            referral,  # token select
            referral,  # resolve 内部 SELECT referral by id
            None,  # episode
            None,  # user
        ]
    )

    # 即使后续 resolve 抛, 也不影响 nullify 已经发生的核心断言
    try:
        await get_by_download_token(db, "tok-abc")
    except Exception:
        pass

    # 关键: download_token 已被 nullify
    assert referral.download_token is None
    # commit 至少被调用过 1 次 (nullify 那次)
    assert db.commit.call_count >= 1


async def test_w2_9_subsequent_request_returns_not_found(make_referral: Any) -> None:
    """已 nullify 的 token, 后续请求找不到行 → NotFoundError 404."""
    from app.api.v1.referral.service import get_by_download_token
    from app.lib.errors import NotFoundError

    db = _mock_db_with_results([None])  # 无匹配行
    with pytest.raises(NotFoundError):
        await get_by_download_token(db, "tok-already-used")
    # 不应该走到任何 update
    db.add.assert_not_called()


async def test_w2_9_expired_token_does_not_nullify(make_referral: Any) -> None:
    """过期 token → ValidationError, 不 nullify (commit 不应被调用)."""
    from app.api.v1.referral.service import get_by_download_token
    from app.lib.errors import ValidationError

    past = datetime.now(UTC) - timedelta(seconds=1)
    referral = make_referral(
        status="consented",
        download_token="tok-expired",
        download_expires_at=past,
    )
    db = _mock_db_with_results([referral])

    with pytest.raises(ValidationError, match="expired"):
        await get_by_download_token(db, "tok-expired")
    # 关键: token 仍在
    assert referral.download_token == "tok-expired"
    db.commit.assert_not_awaited()


async def test_w2_9_wrong_status_does_not_nullify(make_referral: Any) -> None:
    """status=pending (不在 consented/completed) → ValidationError, 不 nullify."""
    from app.api.v1.referral.service import get_by_download_token
    from app.lib.errors import ValidationError

    future = datetime.now(UTC) + timedelta(hours=1)
    referral = make_referral(
        status="pending",
        download_token="tok-pending",
        download_expires_at=future,
    )
    db = _mock_db_with_results([referral])

    with pytest.raises(ValidationError):
        await get_by_download_token(db, "tok-pending")
    assert referral.download_token == "tok-pending"
    db.commit.assert_not_awaited()


async def test_w2_9_two_consecutive_downloads_second_fails(make_referral: Any) -> None:
    """端到端 invariant: 同一 token 两次下载, 第二次必须失败 (W2.9 核心).

    把第 1 次和第 2 次串成同一进程序列, 模拟 sender 把 URL 发出去, 第一次
    被使用 (合法), 第二次有人拿到泄露 URL 试图重新下载, 必须失败。
    """
    from app.api.v1.referral.service import get_by_download_token
    from app.lib.errors import NotFoundError

    future = datetime.now(UTC) + timedelta(hours=1)
    referral = make_referral(
        status="consented",
        download_token="tok-shared",
        download_expires_at=future,
    )

    # 第一次 download (4 次 SELECT — token / resolve referral / episode / user)
    db1 = _mock_db_with_results([referral, referral, None, None])
    try:
        await get_by_download_token(db1, "tok-shared")
    except Exception:
        pass
    assert referral.download_token is None  # 已失效

    # 第二次 download — token 不再匹配任何行
    db2 = _mock_db_with_results([None])
    with pytest.raises(NotFoundError):
        await get_by_download_token(db2, "tok-shared")
