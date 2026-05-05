"""
Result router tests — 镜像 ``server/src/modules/assessment/result.routes.ts`` (PHI 核心).

7 endpoint:
  GET    /api/orgs/{org_id}/assessment-results/                       — 列表 + filter
  GET    /api/orgs/{org_id}/assessment-results/trajectory             — Phase 9β 纵向
  GET    /api/orgs/{org_id}/assessment-results/{result_id}            — 单条 (PHI log)
  POST   /api/orgs/{org_id}/assessment-results/                       — 提交 + 计分
  DELETE /api/orgs/{org_id}/assessment-results/{result_id}            — 软删除 (admin)
  PATCH  /api/orgs/{org_id}/assessment-results/{result_id}/client-visible
  PATCH  /api/orgs/{org_id}/assessment-results/{result_id}/recommendations

PUBLIC (no auth):
  POST /api/public/assessments/{aid}/submit                           — 匿名提交

关键 PHI 守门测试:
  - test_get_result_writes_phi_log_for_other_user — 看别人 → 写 phi_access
  - test_get_result_self_skips_phi_log            — 看自己 → 不写
  - test_get_result_anonymous_skips_phi_log       — user_id IS NULL → 不写
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.assessment.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"
_USER_ID = "00000000-0000-0000-0000-000000000001"  # caller (= staff/admin)
_OTHER_USER_ID = "00000000-0000-0000-0000-000000000010"  # 来访者
_RES_ID = "00000000-0000-0000-0000-000000000555"
_AID = "00000000-0000-0000-0000-000000000111"
_SID = "00000000-0000-0000-0000-000000000222"


# ─── GET / list ─────────────────────────────────────────────────


def test_list_results_happy(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
    make_result: object,
) -> None:
    res = make_result(user_id=uuid.UUID(_OTHER_USER_ID))  # type: ignore[operator]
    # FIFO: 1) main rows, 2) assessment titles, 3) scale titles join, (skip dims; dim_uuids empty since dim_scores={})
    setup_db_results([[res], [], []])
    r = staff_client.get(f"/api/orgs/{_ORG_ID}/assessment-results/")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) == 1


def test_list_results_with_filter(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
    make_result: object,
) -> None:
    """带 query filter (assessmentId), 仍走同一查询."""
    res = make_result(user_id=uuid.UUID(_OTHER_USER_ID), risk_level="level_2")  # type: ignore[operator]
    setup_db_results([[res], [], []])
    r = staff_client.get(
        f"/api/orgs/{_ORG_ID}/assessment-results/?assessmentId={_AID}&riskLevel=level_2"
    )
    assert r.status_code == 200
    assert r.json()[0]["riskLevel"] == "level_2"


def test_list_results_empty(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([[]])
    r = staff_client.get(f"/api/orgs/{_ORG_ID}/assessment-results/")
    assert r.status_code == 200
    assert r.json() == []


# ─── GET /trajectory ────────────────────────────────────────────


def test_trajectory_happy(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
    make_result: object,
) -> None:
    """trajectory: 找 link 行 + 取所有结果."""
    res = make_result(user_id=uuid.UUID(_OTHER_USER_ID), risk_level="level_2")  # type: ignore[operator]
    aid = uuid.UUID(_AID)
    # FIFO: 1) link rows, 2) results
    setup_db_results([[(aid,)], [res]])
    r = staff_client.get(
        f"/api/orgs/{_ORG_ID}/assessment-results/trajectory?userId={_OTHER_USER_ID}&scaleId={_SID}"
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1


def test_trajectory_missing_userid(staff_client: TestClient) -> None:
    r = staff_client.get(f"/api/orgs/{_ORG_ID}/assessment-results/trajectory?scaleId={_SID}")
    assert r.status_code == 400


def test_trajectory_no_link(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """scale 不连任何 assessment → []."""
    setup_db_results([[]])
    r = staff_client.get(
        f"/api/orgs/{_ORG_ID}/assessment-results/trajectory?userId={_OTHER_USER_ID}&scaleId={_SID}"
    )
    assert r.status_code == 200
    assert r.json() == []


# ─── GET /{result_id} (PHI log) ──────────────────────────────────


def test_get_result_writes_phi_log_for_other_user(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
    make_result: object,
    phi_access_calls: list[dict[str, Any]],
) -> None:
    """看别的来访者结果 → 写 phi_access_logs."""
    res = make_result(user_id=uuid.UUID(_OTHER_USER_ID))  # type: ignore[operator]
    setup_db_results([res])
    r = staff_client.get(f"/api/orgs/{_ORG_ID}/assessment-results/{_RES_ID}")
    assert r.status_code == 200, r.text
    assert len(phi_access_calls) == 1
    call = phi_access_calls[0]
    assert call["action"] == "view"
    assert call["resource"] == "assessment_results"
    assert call["client_id"] == _OTHER_USER_ID
    assert call["data_class"] == "phi_full"


def test_get_result_self_skips_phi_log(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
    make_result: object,
    phi_access_calls: list[dict[str, Any]],
) -> None:
    """自己看自己的结果 → 不写 phi log (user.id == result.user_id)."""
    res = make_result(user_id=uuid.UUID(_USER_ID))  # type: ignore[operator]  # 同 caller
    setup_db_results([res])
    r = staff_client.get(f"/api/orgs/{_ORG_ID}/assessment-results/{_RES_ID}")
    assert r.status_code == 200
    assert phi_access_calls == []


def test_get_result_anonymous_skips_phi_log(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
    make_result: object,
    phi_access_calls: list[dict[str, Any]],
) -> None:
    """匿名结果 (user_id IS NULL) → 不写 phi log."""
    res = make_result(user_id=None)  # type: ignore[operator]
    setup_db_results([res])
    r = staff_client.get(f"/api/orgs/{_ORG_ID}/assessment-results/{_RES_ID}")
    assert r.status_code == 200
    assert phi_access_calls == []


def test_get_result_404(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = staff_client.get(f"/api/orgs/{_ORG_ID}/assessment-results/{_RES_ID}")
    assert r.status_code == 404


# ─── POST / (submit + 计分) ──────────────────────────────────────


def test_submit_result_happy_anonymous_no_scale(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
    make_assessment: object,
    disable_triage: None,  # 跳过 triage 副作用
) -> None:
    """提交结果, assessment 无关联 scale → 计分跳, total=0."""
    a = make_assessment()  # type: ignore[operator]
    # FIFO: 1) load assessment, 2) linked scale ids = []
    setup_db_results([a, []])
    r = staff_client.post(
        f"/api/orgs/{_ORG_ID}/assessment-results/",
        json={
            "assessmentId": _AID,
            "answers": {"item-1": 1.0, "item-2": 2.0},
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["riskLevel"] is None
    assert float(body["totalScore"]) == 0.0


def test_submit_result_invalid_assessment(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
    disable_triage: None,
) -> None:
    setup_db_results([None])
    r = staff_client.post(
        f"/api/orgs/{_ORG_ID}/assessment-results/",
        json={
            "assessmentId": _AID,
            "answers": {"item-1": 1.0},
        },
    )
    assert r.status_code == 404


# ─── DELETE /{result_id} ─────────────────────────────────────────


def test_delete_result_admin_happy(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
    make_result: object,
) -> None:
    res = make_result(user_id=uuid.UUID(_OTHER_USER_ID))  # type: ignore[operator]
    setup_db_results([res])
    r = admin_client.delete(f"/api/orgs/{_ORG_ID}/assessment-results/{_RES_ID}")
    assert r.status_code == 204
    assert res.deleted_at is not None


def test_delete_result_rejects_counselor(
    staff_client: TestClient,  # counselor 非 org_admin
) -> None:
    r = staff_client.delete(f"/api/orgs/{_ORG_ID}/assessment-results/{_RES_ID}")
    assert r.status_code == 403


def test_delete_result_404(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_client.delete(f"/api/orgs/{_ORG_ID}/assessment-results/{_RES_ID}")
    assert r.status_code == 404


# ─── PATCH /{result_id}/client-visible (Phase 9β) ────────────────


def test_set_client_visible_happy(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
    make_result: object,
) -> None:
    res = make_result(user_id=uuid.UUID(_OTHER_USER_ID))  # type: ignore[operator]
    res.client_visible = False
    setup_db_results([res])
    r = staff_client.patch(
        f"/api/orgs/{_ORG_ID}/assessment-results/{_RES_ID}/client-visible",
        json={"visible": True},
    )
    assert r.status_code == 200
    assert res.client_visible is True


def test_set_client_visible_rejects_client_role(
    client_role_client: TestClient,
) -> None:
    r = client_role_client.patch(
        f"/api/orgs/{_ORG_ID}/assessment-results/{_RES_ID}/client-visible",
        json={"visible": True},
    )
    assert r.status_code == 403


# ─── PATCH /{result_id}/recommendations (Phase 9β) ──────────────


def test_set_recommendations_happy(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
    make_result: object,
) -> None:
    res = make_result(user_id=uuid.UUID(_OTHER_USER_ID))  # type: ignore[operator]
    setup_db_results([res])
    r = staff_client.patch(
        f"/api/orgs/{_ORG_ID}/assessment-results/{_RES_ID}/recommendations",
        json={"recommendations": [{"action": "course", "rationale": "..."}]},
    )
    assert r.status_code == 200
    assert len(res.recommendations) == 1


def test_set_recommendations_rejects_client_role(
    client_role_client: TestClient,
) -> None:
    r = client_role_client.patch(
        f"/api/orgs/{_ORG_ID}/assessment-results/{_RES_ID}/recommendations",
        json={"recommendations": []},
    )
    assert r.status_code == 403


# ─── PUBLIC submit (no auth) ─────────────────────────────────────


def test_public_submit_happy(
    client: TestClient,
    setup_db_results: SetupDbResults,
    make_assessment: object,
) -> None:
    """匿名公开提交 — 不需要认证, 不写 phi log."""
    a = make_assessment()  # type: ignore[operator]
    # FIFO: 1) public_submit_result loads assessment, 2) _score_and_save loads it again,
    # 3) linked scale ids = []
    setup_db_results([a, a, []])
    r = client.post(
        f"/api/public/assessments/{_AID}/submit",
        json={
            "answers": {"item-1": 1.0},
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["userId"] is None  # 匿名


def test_public_submit_404_assessment_not_found(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = client.post(
        f"/api/public/assessments/{_AID}/submit",
        json={"answers": {"item-1": 1.0}},
    )
    assert r.status_code == 404
