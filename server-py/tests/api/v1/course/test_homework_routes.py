"""
Course homework router — 镜像 Node ``homework.routes.ts`` + ``homework.service.ts``.

涵盖 endpoint:
  - GET    /{instance_id}/homework-defs                                    — 列表
  - POST   /{instance_id}/homework-defs                                    — 新建
  - PATCH  /{instance_id}/homework-defs/{def_id}                           — 更新
  - DELETE /{instance_id}/homework-defs/{def_id}                           — 删除
  - GET    /{instance_id}/homework-defs/{def_id}/submissions               — 提交列表
  - POST   /{instance_id}/homework/{def_id}/submit                         — 学员提交 (upsert)
  - PATCH  /{instance_id}/homework/submissions/{sub_id}/review             — 老师批改
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.course.conftest import SetupDbResults

_ORG_ID = "00000000-0000-0000-0000-000000000099"
_INSTANCE_ID = "00000000-0000-0000-0000-000000000555"
_DEF_ID = "00000000-0000-0000-0000-000000000aaa"
_SUB_ID = "00000000-0000-0000-0000-000000000bbb"


# ─── Defs CRUD ───────────────────────────────────────────────


def test_list_defs_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_homework_def: object,
) -> None:
    d = make_homework_def(title="HW1", question_type="text")  # type: ignore[operator]
    setup_db_results([[d]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/homework-defs")
    assert r.status_code == 200
    body = r.json()
    assert body[0]["title"] == "HW1"
    assert body[0]["questionType"] == "text"


def test_list_defs_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.get(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/homework-defs"
    )
    assert r.status_code == 403


def test_create_def_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    setup_db_results([])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/homework-defs",
        json={
            "title": "新作业",
            "questionType": "single_choice",
            "options": ["A", "B"],
            "isRequired": True,
            "sortOrder": 0,
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["title"] == "新作业"
    assert body["options"] == ["A", "B"]


def test_create_def_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/homework-defs",
        json={"questionType": "text"},
    )
    assert r.status_code == 403


def test_update_def_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_homework_def: object,
) -> None:
    d = make_homework_def()  # type: ignore[operator]
    setup_db_results([d])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/homework-defs/{_DEF_ID}",
        json={"title": "新标题", "isRequired": False},
    )
    assert r.status_code == 200
    assert d.title == "新标题"
    assert d.is_required is False


def test_update_def_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/homework-defs/{_DEF_ID}",
        json={"title": "x"},
    )
    assert r.status_code == 404


def test_delete_def_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_homework_def: object,
) -> None:
    d = make_homework_def()  # type: ignore[operator]
    setup_db_results([d])
    r = admin_org_client.delete(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/homework-defs/{_DEF_ID}"
    )
    assert r.status_code == 204


def test_delete_def_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.delete(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/homework-defs/{_DEF_ID}"
    )
    assert r.status_code == 404


# ─── Submissions ────────────────────────────────────────────


def test_list_submissions_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_homework_submission: object,
) -> None:
    s = make_homework_submission()  # type: ignore[operator]
    setup_db_results([[(s, "学员A", "a@x.com")]])
    r = admin_org_client.get(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/homework-defs/{_DEF_ID}/submissions"
    )
    assert r.status_code == 200
    body = r.json()
    assert body[0]["userName"] == "学员A"


def test_submit_homework_new(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_enrollment: object,
    mock_db: AsyncMock,
) -> None:
    """无现有 submission → 新建."""
    e = make_enrollment()  # type: ignore[operator]
    setup_db_results([e, None])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/homework/{_DEF_ID}/submit",
        json={"content": "我的回答"},
    )
    assert r.status_code == 201
    mock_db.commit.assert_awaited()


def test_submit_homework_403_when_not_enrolled(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/homework/{_DEF_ID}/submit",
        json={"content": "x"},
    )
    assert r.status_code == 403


def test_submit_homework_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/homework/{_DEF_ID}/submit",
        json={"content": "x"},
    )
    assert r.status_code == 403


# ─── Review ─────────────────────────────────────────────────


def test_review_submission_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_homework_submission: object,
    mock_db: AsyncMock,
) -> None:
    s = make_homework_submission(status="submitted")  # type: ignore[operator]
    setup_db_results([s])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/homework/submissions/{_SUB_ID}/review",
        json={"reviewComment": "做得不错"},
    )
    assert r.status_code == 200
    assert s.status == "reviewed"
    assert s.review_comment == "做得不错"


def test_review_submission_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/homework/submissions/{_SUB_ID}/review",
        json={"reviewComment": "x"},
    )
    assert r.status_code == 404
