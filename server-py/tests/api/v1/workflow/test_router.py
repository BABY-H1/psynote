"""
Workflow router tests — 镜像 ``server/src/modules/workflow/workflow.routes.ts``.

覆盖的 endpoint:
  GET    /rules                                  — 列表
  GET    /rules/{rule_id}                        — 详情
  POST   /rules                                  — 创建 (org_admin)
  PATCH  /rules/{rule_id}                        — 更新 (org_admin)
  DELETE /rules/{rule_id}                        — 删除 (org_admin)
  PUT    /rules/by-assessment/{assessment_id}    — 批量同步 (admin/counselor)
  GET    /rules/by-assessment/{assessment_id}    — 列表某 assessment 的所有规则
  GET    /executions                             — 执行日志
  GET    /candidates                             — 列表 candidate_pool
  POST   /candidates/{id}/accept                 — 接受 (含 crisis 路径 + episode 路径)
  POST   /candidates/{id}/dismiss                — 忽略
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.workflow.conftest import SetupDbResults

_ORG_ID = "00000000-0000-0000-0000-000000000099"
_USER_ID = "00000000-0000-0000-0000-000000000001"
_RULE_ID = "00000000-0000-0000-0000-000000000111"
_CAND_ID = "00000000-0000-0000-0000-000000000222"
_EXEC_ID = "00000000-0000-0000-0000-000000000333"
_AID = "00000000-0000-0000-0000-000000000444"


# ─── GET /rules ───────────────────────────────────────────


def test_list_rules_happy(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
    make_rule: object,
) -> None:
    rule = make_rule(name="L4 → crisis 通知")  # type: ignore[operator]
    setup_db_results([[rule]])

    r = admin_client.get(f"/api/orgs/{_ORG_ID}/workflow/rules")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) == 1
    assert body[0]["name"] == "L4 → crisis 通知"
    # camelCase wire 转换验证
    assert "isActive" in body[0]
    assert "triggerEvent" in body[0]


def test_list_rules_empty(admin_client: TestClient, setup_db_results: SetupDbResults) -> None:
    setup_db_results([[]])
    r = admin_client.get(f"/api/orgs/{_ORG_ID}/workflow/rules")
    assert r.status_code == 200
    assert r.json() == []


def test_get_rule_404(admin_client: TestClient, setup_db_results: SetupDbResults) -> None:
    setup_db_results([None])
    r = admin_client.get(f"/api/orgs/{_ORG_ID}/workflow/rules/{_RULE_ID}")
    assert r.status_code == 404


def test_get_rule_happy(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
    make_rule: object,
) -> None:
    rule = make_rule(rule_id=uuid.UUID(_RULE_ID))  # type: ignore[operator]
    setup_db_results([rule])
    r = admin_client.get(f"/api/orgs/{_ORG_ID}/workflow/rules/{_RULE_ID}")
    assert r.status_code == 200
    assert r.json()["id"] == _RULE_ID


# ─── POST /rules ──────────────────────────────────────────


def test_create_rule_happy(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """admin 创建规则; 返回 201 + camelCase wire."""
    setup_db_results([])
    body = {
        "name": "L4 危机告警",
        "triggerEvent": "assessment_result.created",
        "conditions": [{"field": "risk_level", "operator": "eq", "value": "level_4"}],
        "actions": [{"type": "create_crisis_candidate", "config": {}}],
        "priority": 10,
    }
    r = admin_client.post(f"/api/orgs/{_ORG_ID}/workflow/rules", json=body)
    assert r.status_code == 201
    out = r.json()
    assert out["name"] == "L4 危机告警"
    assert out["triggerEvent"] == "assessment_result.created"
    assert out["priority"] == 10


def test_create_rule_rejects_unknown_trigger(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """Phase 12 MVP: 仅支持 assessment_result.created."""
    setup_db_results([])
    body = {"name": "Bad", "triggerEvent": "session_started"}
    r = admin_client.post(f"/api/orgs/{_ORG_ID}/workflow/rules", json=body)
    # 422 (pydantic Literal) 或 400 (业务校验) — 都接受
    assert r.status_code in (400, 422)


def test_create_rule_rejects_counselor(
    counselor_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """org_admin only: counselor 拒."""
    setup_db_results([])
    body = {"name": "X", "triggerEvent": "assessment_result.created"}
    r = counselor_client.post(f"/api/orgs/{_ORG_ID}/workflow/rules", json=body)
    assert r.status_code == 403


# ─── PATCH /rules/{rule_id} ──────────────────────────────


def test_update_rule_happy(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
    make_rule: object,
) -> None:
    rule = make_rule(rule_id=uuid.UUID(_RULE_ID))  # type: ignore[operator]
    setup_db_results([rule])
    r = admin_client.patch(
        f"/api/orgs/{_ORG_ID}/workflow/rules/{_RULE_ID}",
        json={"isActive": False, "priority": 5},
    )
    assert r.status_code == 200
    assert r.json()["isActive"] is False
    assert r.json()["priority"] == 5


def test_update_rule_404(admin_client: TestClient, setup_db_results: SetupDbResults) -> None:
    setup_db_results([None])
    r = admin_client.patch(
        f"/api/orgs/{_ORG_ID}/workflow/rules/{_RULE_ID}", json={"isActive": False}
    )
    assert r.status_code == 404


# ─── DELETE /rules/{rule_id} ─────────────────────────────


def test_delete_rule_happy(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
    make_rule: object,
) -> None:
    rule = make_rule(rule_id=uuid.UUID(_RULE_ID))  # type: ignore[operator]
    # FIFO: 1) SELECT, 2) DELETE
    setup_db_results([rule, None])
    r = admin_client.delete(f"/api/orgs/{_ORG_ID}/workflow/rules/{_RULE_ID}")
    assert r.status_code == 200
    assert r.json()["ok"] is True


# ─── PUT /rules/by-assessment/{assessment_id} ────────────


def test_sync_rules_by_assessment_inserts_new(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """admin/counselor 批量同步: 先 DELETE 已有 wizard 规则, 再 INSERT."""
    setup_db_results([None])  # DELETE returns nothing; INSERT 用 add_all 不走 execute

    body = {
        "rules": [
            {
                "name": "L3 → 个案候选",
                "conditions": [{"field": "risk_level", "operator": "eq", "value": "level_3"}],
                "actions": [{"type": "create_episode_candidate"}],
            },
            {
                "name": "L4 → 危机候选",
                "conditions": [{"field": "risk_level", "operator": "eq", "value": "level_4"}],
                "actions": [{"type": "create_crisis_candidate"}],
            },
        ]
    }
    r = admin_client.put(f"/api/orgs/{_ORG_ID}/workflow/rules/by-assessment/{_AID}", json=body)
    assert r.status_code == 200
    assert r.json()["count"] == 2


def test_sync_rules_by_assessment_empty_list(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """Empty list → DELETE only, count=0."""
    setup_db_results([None])
    r = admin_client.put(
        f"/api/orgs/{_ORG_ID}/workflow/rules/by-assessment/{_AID}",
        json={"rules": []},
    )
    assert r.status_code == 200
    assert r.json()["count"] == 0


# ─── GET /rules/by-assessment/{assessment_id} ─────────────


def test_list_rules_by_assessment(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
    make_rule: object,
) -> None:
    rule = make_rule(scope_assessment_id=uuid.UUID(_AID))  # type: ignore[operator]
    setup_db_results([[rule]])
    r = admin_client.get(f"/api/orgs/{_ORG_ID}/workflow/rules/by-assessment/{_AID}")
    assert r.status_code == 200
    assert len(r.json()) == 1


# ─── GET /executions ─────────────────────────────────────


def test_list_executions_happy(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
    make_execution: object,
) -> None:
    e = make_execution()  # type: ignore[operator]
    setup_db_results([[e]])
    r = admin_client.get(f"/api/orgs/{_ORG_ID}/workflow/executions")
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["status"] == "success"


def test_list_executions_with_rule_filter(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
    make_execution: object,
) -> None:
    e = make_execution(rule_id=uuid.UUID(_RULE_ID))  # type: ignore[operator]
    setup_db_results([[e]])
    r = admin_client.get(f"/api/orgs/{_ORG_ID}/workflow/executions?ruleId={_RULE_ID}&limit=10")
    assert r.status_code == 200


# ─── GET /candidates ──────────────────────────────────────


def test_list_candidates_default_pending(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """Default: 仅 pending. JOIN users 拿 name/email."""
    # Tuple-like row return from JOIN query
    fake_now = None
    row = (
        uuid.UUID(_CAND_ID),  # id
        uuid.UUID(_ORG_ID),  # org_id
        uuid.UUID("00000000-0000-0000-0000-000000000010"),  # client_user_id
        "张三",  # User.name
        "zs@example.com",  # User.email
        "episode_candidate",  # kind
        "建议建个案",  # suggestion
        "L3 命中",  # reason
        "normal",  # priority
        None,  # source_rule_id
        None,  # source_result_id
        None,  # source_payload
        "pending",  # status
        None,  # assigned_to
        None,  # handled_by
        None,  # handled_at
        None,  # handled_note
        None,  # resolved_ref_type
        None,  # resolved_ref_id
        fake_now,  # created_at
    )
    setup_db_results([[row]])
    r = admin_client.get(f"/api/orgs/{_ORG_ID}/workflow/candidates")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["clientName"] == "张三"
    assert body[0]["clientEmail"] == "zs@example.com"
    assert body[0]["kind"] == "episode_candidate"


def test_list_candidates_with_status_filter(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([[]])
    r = admin_client.get(f"/api/orgs/{_ORG_ID}/workflow/candidates?status=accepted,dismissed")
    assert r.status_code == 200


# ─── POST /candidates/{id}/dismiss ─────────────────────────


def test_dismiss_candidate_happy(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
    make_candidate: object,
) -> None:
    c = make_candidate(cand_id=uuid.UUID(_CAND_ID))  # type: ignore[operator]
    setup_db_results([c])
    r = admin_client.post(
        f"/api/orgs/{_ORG_ID}/workflow/candidates/{_CAND_ID}/dismiss",
        json={"reason": "测试驳回"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "dismissed"


def test_dismiss_candidate_404(admin_client: TestClient, setup_db_results: SetupDbResults) -> None:
    setup_db_results([None])
    r = admin_client.post(f"/api/orgs/{_ORG_ID}/workflow/candidates/{_CAND_ID}/dismiss", json={})
    assert r.status_code == 404


# ─── POST /candidates/{id}/accept ─────────────────────────


def test_accept_candidate_default_path(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
    make_candidate: object,
) -> None:
    """default path (group/course): 仅翻 status."""
    c = make_candidate(cand_id=uuid.UUID(_CAND_ID), kind="group_candidate")  # type: ignore[operator]
    setup_db_results([c])
    r = admin_client.post(
        f"/api/orgs/{_ORG_ID}/workflow/candidates/{_CAND_ID}/accept",
        json={"resolvedRefType": "group_instance", "resolvedRefId": str(uuid.uuid4())},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "accepted"


def test_accept_candidate_already_handled(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
    make_candidate: object,
) -> None:
    c = make_candidate(cand_id=uuid.UUID(_CAND_ID), status="accepted")  # type: ignore[operator]
    setup_db_results([c])
    r = admin_client.post(f"/api/orgs/{_ORG_ID}/workflow/candidates/{_CAND_ID}/accept", json={})
    assert r.status_code == 400


def test_accept_crisis_candidate_creates_episode_and_case(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
    make_candidate: object,
) -> None:
    """crisis_candidate accept → 原子建 careEpisode + crisis_case → resolved_ref_type='crisis_case'."""
    c = make_candidate(cand_id=uuid.UUID(_CAND_ID), kind="crisis_candidate")  # type: ignore[operator]
    setup_db_results([c])
    r = admin_client.post(f"/api/orgs/{_ORG_ID}/workflow/candidates/{_CAND_ID}/accept", json={})
    assert r.status_code == 200
    body = r.json()
    assert body["resolvedRefType"] == "crisis_case"
    assert body.get("episodeId") is not None
    assert body.get("crisisCaseId") is not None


def test_accept_episode_candidate_creates_episode(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
    make_candidate: object,
) -> None:
    """episode_candidate + resolvedRefType='care_episode' → 原子建 episode."""
    c = make_candidate(cand_id=uuid.UUID(_CAND_ID), kind="episode_candidate")  # type: ignore[operator]
    setup_db_results([c])
    r = admin_client.post(
        f"/api/orgs/{_ORG_ID}/workflow/candidates/{_CAND_ID}/accept",
        json={"resolvedRefType": "care_episode"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["resolvedRefType"] == "care_episode"
    assert body.get("episodeId") is not None


# ─── 401 / 403 守门 ─────────────────────────────────────


def test_unauth_get_rules_401(client: TestClient) -> None:
    """无认证 → 401."""
    r = client.get(f"/api/orgs/{_ORG_ID}/workflow/rules")
    assert r.status_code == 401


def test_client_role_create_rule_forbidden(
    client_role_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([])
    r = client_role_client.post(
        f"/api/orgs/{_ORG_ID}/workflow/rules",
        json={"name": "X", "triggerEvent": "assessment_result.created"},
    )
    assert r.status_code == 403


# ─── invalid uuid ────────────────────────────────────────


def test_get_rule_invalid_uuid(admin_client: TestClient) -> None:
    r = admin_client.get(f"/api/orgs/{_ORG_ID}/workflow/rules/not-a-uuid")
    assert r.status_code == 400
