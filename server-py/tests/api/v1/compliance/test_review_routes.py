"""
Compliance review router tests — 镜像 ``server/src/modules/compliance/compliance-review.routes.ts``.

Endpoints (4):
  POST /review-note/{noteId}             note 合规度
  POST /review-golden-thread/{episodeId} 主诉→评估→计划一致性
  POST /review-quality/{noteId}          治疗质量
  GET  /reviews                          列表 + filters
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.compliance.conftest import SetupDbResults

_ORG_ID = "00000000-0000-0000-0000-000000000099"
_NOTE_ID = "00000000-0000-0000-0000-000000000e04"
_EPISODE_ID = "00000000-0000-0000-0000-000000000111"
_REVIEW_ID = "00000000-0000-0000-0000-000000000e03"


# ─── POST /review-note/{note_id} ────────────────────────────────


def test_review_note_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_session_note: object,
) -> None:
    note = make_session_note()  # type: ignore[operator]
    setup_db_results([note])
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/compliance/review-note/{_NOTE_ID}")
    assert r.status_code == 201
    body = r.json()
    assert body["reviewType"] == "note_compliance"


def test_review_note_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/compliance/review-note/{_NOTE_ID}")
    assert r.status_code == 404


def test_review_note_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.post(f"/api/orgs/{_ORG_ID}/compliance/review-note/{_NOTE_ID}")
    assert r.status_code == 403


# ─── POST /review-golden-thread/{episode_id} ────────────────────


def test_review_golden_thread_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_treatment_plan: object,
) -> None:
    plan = make_treatment_plan()  # type: ignore[operator]
    setup_db_results([plan])
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/compliance/review-golden-thread/{_EPISODE_ID}")
    assert r.status_code == 201
    body = r.json()
    assert body["reviewType"] == "golden_thread"


def test_review_golden_thread_no_active_plan_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/compliance/review-golden-thread/{_EPISODE_ID}")
    assert r.status_code == 404


# ─── POST /review-quality/{note_id} ─────────────────────────────


def test_review_quality_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_session_note: object,
) -> None:
    note = make_session_note()  # type: ignore[operator]
    setup_db_results([note])
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/compliance/review-quality/{_NOTE_ID}")
    assert r.status_code == 201
    body = r.json()
    assert body["reviewType"] == "treatment_quality"


def test_review_quality_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/compliance/review-quality/{_NOTE_ID}")
    assert r.status_code == 404


# ─── GET /reviews ──────────────────────────────────────────────


def test_list_reviews_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_compliance_review: object,
) -> None:
    review = make_compliance_review()  # type: ignore[operator]
    setup_db_results([[review]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/compliance/reviews")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert body[0]["id"] == _REVIEW_ID


def test_list_reviews_with_filters(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([[]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/compliance/reviews?reviewType=note_compliance")
    assert r.status_code == 200
    assert r.json() == []


def test_list_reviews_no_org_403(authed_client: TestClient) -> None:
    r = authed_client.get(f"/api/orgs/{_ORG_ID}/compliance/reviews")
    assert r.status_code == 403
