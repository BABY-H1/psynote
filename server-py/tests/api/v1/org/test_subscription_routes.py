"""
Subscription routes — 镜像 ``subscription.routes.ts``.

Phase 3 smoke tests:
  - GET /api/orgs/{id}/subscription  — tier + features + license + seatsUsed
  - GET /api/orgs/{id}/ai-usage      — 当月 token 用量
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.org.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"


def test_subscription_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """starter tier (默认 fixture) → 'starter' tier + 入门版 label + 7 个 features."""
    # 1) plan row, 2) seat count
    setup_db_results([("free",), 5])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/subscription")
    assert r.status_code == 200
    body = r.json()
    assert body["tier"] == "starter"
    assert body["plan"] == "free"
    assert body["label"] == "入门版"
    assert "core" in body["features"]
    assert body["license"]["status"] == "none"
    assert body["license"]["seatsUsed"] == 5


def test_subscription_rejects_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.get(f"/api/orgs/{_ORG_ID}/subscription")
    assert r.status_code == 403


def test_ai_usage_unlimited(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """monthlyTokenLimit=0 → unlimited=True, remaining=None."""
    # 1) settings row
    settings_row = ({"aiConfig": {}},)
    # 2) sum row — 模拟 SQL aggregation 单元 (用 namespace-style mock)
    aggr = MagicMock()
    aggr.tokens = 0
    aggr.calls = 0
    setup_db_results([settings_row, aggr])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/ai-usage")
    assert r.status_code == 200
    body = r.json()
    assert body["unlimited"] is True
    assert body["monthlyLimit"] == 0
    assert body["remaining"] is None
    assert body["percentUsed"] is None


def test_ai_usage_with_limit(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    settings_row = ({"aiConfig": {"monthlyTokenLimit": 1000}},)
    aggr = MagicMock()
    aggr.tokens = 250
    aggr.calls = 5
    setup_db_results([settings_row, aggr])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/ai-usage")
    assert r.status_code == 200
    body = r.json()
    assert body["unlimited"] is False
    assert body["monthlyLimit"] == 1000
    assert body["monthlyUsed"] == 250
    assert body["remaining"] == 750
    assert body["percentUsed"] == 25.0
