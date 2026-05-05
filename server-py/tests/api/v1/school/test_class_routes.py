"""
School class routes tests — 镜像 ``school-class.routes.ts`` 4 endpoints.

覆盖:
  - GET / (list happy + grouped + non-school 403)
  - POST / (create happy + counselor 403 + non-school 403)
  - PATCH /:id (update happy + not found)
  - DELETE /:id (happy + not found)
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.school.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"
_CLASS_ID = "00000000-0000-0000-0000-000000000111"


# ─── GET / ──────────────────────────────────────────────────────


def test_list_classes_grouped_by_grade(
    admin_school_client: TestClient,
    setup_db_results: SetupDbResults,
    make_class: object,
) -> None:
    """list 含 grouped by grade dict."""
    c1 = make_class(grade="高一", class_name="1 班")  # type: ignore[operator]
    c2 = make_class(grade="高一", class_name="2 班")  # type: ignore[operator]
    c3 = make_class(grade="高二", class_name="1 班")  # type: ignore[operator]
    setup_db_results(
        [
            [(c1, "张老师"), (c2, "李老师"), (c3, "王老师")],
        ]
    )
    r = admin_school_client.get(f"/api/orgs/{_ORG_ID}/school/classes/")
    assert r.status_code == 200
    body = r.json()
    assert len(body["classes"]) == 3
    assert "高一" in body["grouped"]
    assert "高二" in body["grouped"]
    assert len(body["grouped"]["高一"]) == 2
    assert body["classes"][0]["teacherName"] == "张老师"


def test_list_classes_non_school_org_403(
    non_school_admin_client: TestClient,
) -> None:
    """非 school org → 403."""
    r = non_school_admin_client.get(f"/api/orgs/{_ORG_ID}/school/classes/")
    assert r.status_code == 403


# ─── POST / ─────────────────────────────────────────────────────


def test_create_class_happy(
    admin_school_client: TestClient,
    mock_db: AsyncMock,
) -> None:
    """org_admin 在 school org 下 → 201."""
    r = admin_school_client.post(
        f"/api/orgs/{_ORG_ID}/school/classes/",
        json={"grade": "高一", "className": "新班"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["class"]["grade"] == "高一"
    assert body["class"]["className"] == "新班"
    mock_db.commit.assert_awaited()


def test_create_class_counselor_role_403(
    counselor_school_client: TestClient,
) -> None:
    """non-admin → 403."""
    r = counselor_school_client.post(
        f"/api/orgs/{_ORG_ID}/school/classes/",
        json={"grade": "高一", "className": "新班"},
    )
    assert r.status_code == 403


def test_create_class_empty_name_400(
    admin_school_client: TestClient,
) -> None:
    """grade 或 className 空 → 400 (pydantic min_length)."""
    r = admin_school_client.post(
        f"/api/orgs/{_ORG_ID}/school/classes/",
        json={"grade": "", "className": "x"},
    )
    assert r.status_code == 400


# ─── PATCH /:id ─────────────────────────────────────────────────


def test_update_class_happy(
    admin_school_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
    make_class: object,
) -> None:
    c = make_class()  # type: ignore[operator]
    setup_db_results([c])
    r = admin_school_client.patch(
        f"/api/orgs/{_ORG_ID}/school/classes/{_CLASS_ID}",
        json={"className": "高一 1 班 (更新)"},
    )
    assert r.status_code == 200
    assert r.json()["class"]["className"] == "高一 1 班 (更新)"
    mock_db.commit.assert_awaited()


def test_update_class_not_found(
    admin_school_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_school_client.patch(
        f"/api/orgs/{_ORG_ID}/school/classes/{_CLASS_ID}",
        json={"className": "x"},
    )
    assert r.status_code == 404


# ─── DELETE /:id ────────────────────────────────────────────────


def test_delete_class_happy(
    admin_school_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
    make_class: object,
) -> None:
    c = make_class()  # type: ignore[operator]
    setup_db_results([c, None])  # lookup + DELETE execute
    r = admin_school_client.delete(f"/api/orgs/{_ORG_ID}/school/classes/{_CLASS_ID}")
    assert r.status_code == 204
    mock_db.commit.assert_awaited()


def test_delete_class_not_found(
    admin_school_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_school_client.delete(f"/api/orgs/{_ORG_ID}/school/classes/{_CLASS_ID}")
    assert r.status_code == 404


def test_delete_class_counselor_role_403(
    counselor_school_client: TestClient,
) -> None:
    r = counselor_school_client.delete(f"/api/orgs/{_ORG_ID}/school/classes/{_CLASS_ID}")
    assert r.status_code == 403
