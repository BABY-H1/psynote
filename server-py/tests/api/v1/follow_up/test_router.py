"""
Follow-up 路由测试 — 镜像 ``server/src/modules/follow-up/follow-up.routes.ts``。

Endpoints (5):
  GET    /plans              — 列表
  POST   /plans              — 创建 plan + timeline event
  PATCH  /plans/{plan_id}    — 更新
  GET    /reviews            — 列表 (强制 careEpisodeId)
  POST   /reviews            — 复合事务: review + 风险变更 + close episode
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.follow_up.conftest import SetupDbResults

_ORG_ID = "00000000-0000-0000-0000-000000000099"
_EPISODE_ID = "00000000-0000-0000-0000-000000000111"
_PLAN_ID = "00000000-0000-0000-0000-000000000aaa"


# ─── GET /plans ─────────────────────────────────────────────────


def test_list_plans_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_plan: Any,
) -> None:
    p = make_plan()
    setup_db_results([[p]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/follow-up/plans")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) == 1
    assert body[0]["id"] == _PLAN_ID
    assert body[0]["status"] == "active"


def test_list_plans_with_episode_filter(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([[]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/follow-up/plans?careEpisodeId={_EPISODE_ID}")
    assert r.status_code == 200
    assert r.json() == []


# ─── POST /plans ────────────────────────────────────────────────


def test_create_plan_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """create_follow_up_plan: db.add(plan) + flush + db.add(timeline) + flush。
    没 execute 调用, mock 不需 setup。"""
    setup_db_results([])
    payload = {
        "careEpisodeId": _EPISODE_ID,
        "planType": "复评",
        "frequency": "每月",
    }
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/follow-up/plans", json=payload)
    assert r.status_code == 201
    mock_db.commit.assert_awaited()


def test_create_plan_missing_episode_id_400(
    admin_org_client: TestClient,
) -> None:
    """careEpisodeId 必填 (Pydantic 校验拦在 router 前)."""
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/follow-up/plans", json={})
    assert r.status_code == 400


def test_create_plan_403_when_client_role(
    client_role_org_client: TestClient,
) -> None:
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG_ID}/follow-up/plans",
        json={"careEpisodeId": _EPISODE_ID},
    )
    assert r.status_code == 403


# ─── PATCH /plans/{plan_id} ─────────────────────────────────────


def test_update_plan_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_plan: Any,
) -> None:
    p = make_plan()
    setup_db_results([p])  # SELECT FollowUpPlan WHERE id
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/follow-up/plans/{_PLAN_ID}",
        json={"frequency": "每两周", "status": "paused"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["frequency"] == "每两周"
    assert body["status"] == "paused"


def test_update_plan_not_found_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/follow-up/plans/{_PLAN_ID}",
        json={"status": "completed"},
    )
    assert r.status_code == 404


# ─── GET /reviews ───────────────────────────────────────────────


def test_list_reviews_requires_episode_id(
    admin_org_client: TestClient,
) -> None:
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/follow-up/reviews")
    assert r.status_code == 400
    assert "careEpisodeId" in r.json()["message"]


def test_list_reviews_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_review: Any,
) -> None:
    rv = make_review()
    setup_db_results([[rv]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/follow-up/reviews?careEpisodeId={_EPISODE_ID}")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["decision"] == "continue"


# ─── POST /reviews (复合事务) ───────────────────────────────────


def test_create_review_continue_decision(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """decision='continue', risk 不变 → 仅写 review + 1 个 timeline event。

    flush 顺序: 1) add review, flush 2) add review_event 3) flush — 不查 episode。
    """
    setup_db_results([])
    payload = {
        "planId": _PLAN_ID,
        "careEpisodeId": _EPISODE_ID,
        "riskBefore": "level_1",
        "riskAfter": "level_1",
        "decision": "continue",
    }
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/follow-up/reviews", json=payload)
    assert r.status_code == 201
    mock_db.commit.assert_awaited()


def test_create_review_with_risk_change_updates_episode(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_episode: Any,
) -> None:
    """risk_after != risk_before 时, 服务侧再 SELECT 一次 episode 更新 current_risk."""
    e = make_episode(current_risk="level_1")
    # SELECT episode 走 1 次 execute
    setup_db_results([e])
    payload = {
        "planId": _PLAN_ID,
        "careEpisodeId": _EPISODE_ID,
        "riskBefore": "level_1",
        "riskAfter": "level_3",
        "decision": "escalate",
    }
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/follow-up/reviews", json=payload)
    assert r.status_code == 201
    body = r.json()
    assert body["riskAfter"] == "level_3"
    assert body["decision"] == "escalate"
    # episode 应被改成 level_3
    assert e.current_risk == "level_3"


def test_create_review_close_decision_closes_episode(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_episode: Any,
) -> None:
    """decision='close' + 风险不变 → 路径只查 1 次 episode (close 那次)."""
    e = make_episode(status="active")
    # 仅 close 分支的 SELECT
    setup_db_results([e])
    payload = {
        "planId": _PLAN_ID,
        "careEpisodeId": _EPISODE_ID,
        "decision": "close",
    }
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/follow-up/reviews", json=payload)
    assert r.status_code == 201
    assert e.status == "closed"
    assert e.closed_at is not None


def test_create_review_403_when_client(
    client_role_org_client: TestClient,
) -> None:
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG_ID}/follow-up/reviews",
        json={"planId": _PLAN_ID, "careEpisodeId": _EPISODE_ID},
    )
    assert r.status_code == 403
