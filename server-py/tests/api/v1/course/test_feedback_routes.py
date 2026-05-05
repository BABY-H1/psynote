"""
Course feedback router — 镜像 Node ``feedback.routes.ts`` + ``feedback.service.ts``.

涵盖 endpoint:
  - GET    /{instance_id}/feedback-forms                                — 列表
  - POST   /{instance_id}/feedback-forms                                — 新建表单
  - PATCH  /{instance_id}/feedback-forms/{form_id}                      — 更新
  - DELETE /{instance_id}/feedback-forms/{form_id}                      — 删除
  - GET    /{instance_id}/feedback-forms/{form_id}/responses            — 响应列表
  - POST   /{instance_id}/feedback/{form_id}/submit                     — 学员提交 (upsert)
  - GET    /{instance_id}/feedback-stats                                — 各 form 响应数
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.course.conftest import SetupDbResults

_ORG_ID = "00000000-0000-0000-0000-000000000099"
_INSTANCE_ID = "00000000-0000-0000-0000-000000000555"
_FORM_ID = "00000000-0000-0000-0000-000000000777"


# ─── Forms CRUD ───────────────────────────────────────────────


def test_list_forms_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_feedback_form: object,
) -> None:
    f = make_feedback_form(title="结课总评")  # type: ignore[operator]
    setup_db_results([[f]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/feedback-forms")
    assert r.status_code == 200
    assert r.json()[0]["title"] == "结课总评"


def test_list_forms_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.get(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/feedback-forms"
    )
    assert r.status_code == 403


def test_create_form_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    setup_db_results([])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/feedback-forms",
        json={
            "title": "本周反馈",
            "questions": [{"q": "你的感受?"}],
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["title"] == "本周反馈"
    mock_db.commit.assert_awaited()


def test_create_form_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/feedback-forms",
        json={"questions": []},
    )
    assert r.status_code == 403


def test_update_form_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_feedback_form: object,
) -> None:
    f = make_feedback_form()  # type: ignore[operator]
    setup_db_results([f])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/feedback-forms/{_FORM_ID}",
        json={"title": "新标题", "isActive": False},
    )
    assert r.status_code == 200
    assert f.title == "新标题"
    assert f.is_active is False


def test_update_form_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/feedback-forms/{_FORM_ID}",
        json={"title": "x"},
    )
    assert r.status_code == 404


def test_delete_form_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_feedback_form: object,
) -> None:
    f = make_feedback_form()  # type: ignore[operator]
    setup_db_results([f])
    r = admin_org_client.delete(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/feedback-forms/{_FORM_ID}"
    )
    assert r.status_code == 204


# ─── Responses ────────────────────────────────────────────────


def test_list_responses_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_feedback_response: object,
) -> None:
    rsp = make_feedback_response(answers=[1, 2, 3])  # type: ignore[operator]
    setup_db_results([[(rsp, "学员A", "a@x.com")]])
    r = admin_org_client.get(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/feedback-forms/{_FORM_ID}/responses"
    )
    assert r.status_code == 200
    body = r.json()
    assert body[0]["userName"] == "学员A"
    assert body[0]["answers"] == [1, 2, 3]


def test_submit_response_happy_new(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_enrollment: object,
    mock_db: AsyncMock,
) -> None:
    """无现有响应 → 新建."""
    e = make_enrollment()  # type: ignore[operator]
    # enrollment 查到; existing 响应查无
    setup_db_results([e, None])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/feedback/{_FORM_ID}/submit",
        json={"answers": [{"a": 5}]},
    )
    assert r.status_code == 201
    mock_db.commit.assert_awaited()


def test_submit_response_403_when_not_enrolled(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """没 enrollment → 403."""
    setup_db_results([None])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/feedback/{_FORM_ID}/submit",
        json={"answers": []},
    )
    assert r.status_code == 403


def test_submit_response_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/feedback/{_FORM_ID}/submit",
        json={"answers": []},
    )
    assert r.status_code == 403


# ─── Stats ────────────────────────────────────────────────────


def test_feedback_stats_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """响应数聚合行 (form_id, form_title, count) 列表."""
    import uuid as _uuid

    fid = _uuid.UUID("00000000-0000-0000-0000-000000000777")
    setup_db_results([[(fid, "表单1", 12)]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/feedback-stats")
    assert r.status_code == 200
    body = r.json()
    assert body[0]["formTitle"] == "表单1"
    assert body[0]["responseCount"] == 12


def test_feedback_stats_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.get(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/feedback-stats"
    )
    assert r.status_code == 403
