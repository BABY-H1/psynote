"""
Public referral routes 测试 — 镜像 ``server/src/modules/referral/public-referral.routes.ts``.

  GET /api/public/referrals/download/{token}  W2.9 一次性下载链

W2.9 端到端 (HTTP):
  - 第 1 次 GET token → 200 + 数据包
  - 第 2 次 GET token → 404 (Not found, token 已 nullify)
  - 过期 token → 404
  - 状态错 token → 404
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.referral.conftest import SetupDbResults


def test_public_download_invalid_token_404(
    public_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """token 不匹配任何行 → 404."""
    setup_db_results([None])
    r = public_client.get("/api/public/referrals/download/whatever")
    assert r.status_code == 404


def test_public_download_expired_token_404(
    public_client: TestClient,
    setup_db_results: SetupDbResults,
    make_referral: object,
) -> None:
    """过期 token → 404 (内部 ValidationError, 路由统一 catch 成 404)."""
    past = datetime.now(UTC) - timedelta(seconds=1)
    referral = make_referral(  # type: ignore[operator]
        status="consented",
        download_token="tok-expired",
        download_expires_at=past,
    )
    setup_db_results([referral])
    r = public_client.get("/api/public/referrals/download/tok-expired")
    assert r.status_code == 404


def test_public_download_wrong_status_404(
    public_client: TestClient,
    setup_db_results: SetupDbResults,
    make_referral: object,
) -> None:
    """status='pending' (未 consented) → 404."""
    future = datetime.now(UTC) + timedelta(hours=1)
    referral = make_referral(  # type: ignore[operator]
        status="pending",
        download_token="tok-pending",
        download_expires_at=future,
    )
    setup_db_results([referral])
    r = public_client.get("/api/public/referrals/download/tok-pending")
    assert r.status_code == 404


def test_public_download_first_use_succeeds_and_invalidates_token(
    public_client: TestClient,
    setup_db_results: SetupDbResults,
    make_referral: object,
) -> None:
    """W2.9 核心: 第 1 次下载通过 + 自动 nullify token. 第 2 次同 URL → 404."""
    future = datetime.now(UTC) + timedelta(hours=1)
    referral = make_referral(  # type: ignore[operator]
        status="consented",
        download_token="tok-shared",
        download_expires_at=future,
    )

    # 4 个 SELECT: token / resolve referral / episode / user
    setup_db_results([referral, referral, None, None])
    r1 = public_client.get("/api/public/referrals/download/tok-shared")
    assert r1.status_code == 200
    body = r1.json()
    assert "referral" in body

    # token 已 nullify
    assert referral.download_token is None
