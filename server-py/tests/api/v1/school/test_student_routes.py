"""
School student routes tests — 镜像 ``school-student.routes.ts`` 4 endpoints.

覆盖:
  - GET / (list happy + grade filter + search)
  - GET /stats (happy)
  - POST /import (happy + per-row error + max 500)
  - PATCH /:id (happy + counselor 也允许 + not found)
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.school.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"
_PROFILE_ID = "00000000-0000-0000-0000-000000000222"


# ─── GET / ──────────────────────────────────────────────────────


def test_list_students_happy(
    admin_school_client: TestClient,
    setup_db_results: SetupDbResults,
    make_student_profile: object,
) -> None:
    p = make_student_profile()  # type: ignore[operator]
    setup_db_results([[(p, "张三", "s001@student.internal")]])
    r = admin_school_client.get(f"/api/orgs/{_ORG_ID}/school/students/")
    assert r.status_code == 200
    body = r.json()
    assert len(body["students"]) == 1
    assert body["students"][0]["userName"] == "张三"


def test_list_students_grade_filter(
    admin_school_client: TestClient,
    setup_db_results: SetupDbResults,
    make_student_profile: object,
) -> None:
    """``?grade=高二`` 过滤掉 grade=高一 的."""
    p1 = make_student_profile(grade="高一")  # type: ignore[operator]
    p2 = make_student_profile(grade="高二")  # type: ignore[operator]
    setup_db_results([[(p1, "甲", None), (p2, "乙", None)]])
    r = admin_school_client.get(f"/api/orgs/{_ORG_ID}/school/students/?grade=高二")
    assert r.status_code == 200
    body = r.json()
    assert len(body["students"]) == 1
    assert body["students"][0]["grade"] == "高二"


def test_list_students_search(
    admin_school_client: TestClient,
    setup_db_results: SetupDbResults,
    make_student_profile: object,
) -> None:
    """``?search=zhang`` 按 user_name / student_id / parent_name 过滤 (case-insensitive)."""
    p1 = make_student_profile(student_id="S001")  # type: ignore[operator]
    p2 = make_student_profile(student_id="S002")  # type: ignore[operator]
    setup_db_results([[(p1, "Zhang", None), (p2, "Li", None)]])
    r = admin_school_client.get(f"/api/orgs/{_ORG_ID}/school/students/?search=zhang")
    assert r.status_code == 200
    assert len(r.json()["students"]) == 1


# ─── GET /stats ─────────────────────────────────────────────────


def test_stats_happy(
    admin_school_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """total + 按 grade 分组."""
    # 1) total count; 2) grade group rows
    setup_db_results(
        [
            50,
            [("高一", 20), ("高二", 18), (None, 12)],
        ]
    )
    r = admin_school_client.get(f"/api/orgs/{_ORG_ID}/school/students/stats")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 50
    grades = {g["name"]: g["count"] for g in body["grades"]}
    assert grades["高一"] == 20
    assert grades["未分配"] == 12  # NULL → '未分配' fallback


# ─── POST /import ───────────────────────────────────────────────


def test_import_students_creates_new(
    admin_school_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """新学生 → created."""
    # 单条 import 流程: 1) user lookup None; 2) member lookup None; 3) profile lookup None
    setup_db_results([None, None, None])
    r = admin_school_client.post(
        f"/api/orgs/{_ORG_ID}/school/students/import",
        json={
            "students": [
                {
                    "name": "新生",
                    "studentId": "S100",
                    "grade": "高一",
                    "className": "1 班",
                },
            ],
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["summary"]["created"] == 1
    assert body["summary"]["existing"] == 0
    assert body["summary"]["errors"] == 0
    mock_db.commit.assert_awaited()


def test_import_students_existing_profile_marked(
    admin_school_client: TestClient,
    setup_db_results: SetupDbResults,
    make_user_row: object,
    make_student_profile: object,
) -> None:
    """已有 profile → existing (不重建)."""
    u = make_user_row(email="S200@student.internal")  # type: ignore[operator]
    sp = make_student_profile()  # type: ignore[operator]
    # 1) user 已存在; 2) member 已存在; 3) profile 已存在
    setup_db_results([u, sp.id, sp.id])
    r = admin_school_client.post(
        f"/api/orgs/{_ORG_ID}/school/students/import",
        json={"students": [{"name": "已有", "studentId": "S200"}]},
    )
    assert r.status_code == 200
    assert r.json()["summary"]["existing"] == 1


def test_import_students_max_500(
    admin_school_client: TestClient,
) -> None:
    """超 500 → 400."""
    big = [{"name": f"S{i}", "studentId": f"S{i}"} for i in range(501)]
    r = admin_school_client.post(
        f"/api/orgs/{_ORG_ID}/school/students/import",
        json={"students": big},
    )
    assert r.status_code == 400


def test_import_students_empty_array_400(
    admin_school_client: TestClient,
) -> None:
    """空 array → 400 (pydantic min_length)."""
    r = admin_school_client.post(
        f"/api/orgs/{_ORG_ID}/school/students/import",
        json={"students": []},
    )
    assert r.status_code == 400


# ─── PATCH /:id ─────────────────────────────────────────────────


def test_update_student_happy(
    admin_school_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
    make_student_profile: object,
) -> None:
    p = make_student_profile()  # type: ignore[operator]
    setup_db_results([p])
    r = admin_school_client.patch(
        f"/api/orgs/{_ORG_ID}/school/students/{_PROFILE_ID}",
        json={"parentName": "李父", "parentPhone": "13800000000"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["student"]["parentName"] == "李父"
    mock_db.commit.assert_awaited()


def test_update_student_counselor_allowed(
    counselor_school_client: TestClient,
    setup_db_results: SetupDbResults,
    make_student_profile: object,
) -> None:
    """⭐ counselor 也允许 (与 Node ``requireRole('org_admin', 'counselor')`` 等价)."""
    p = make_student_profile()  # type: ignore[operator]
    setup_db_results([p])
    r = counselor_school_client.patch(
        f"/api/orgs/{_ORG_ID}/school/students/{_PROFILE_ID}",
        json={"parentPhone": "13900000000"},
    )
    assert r.status_code == 200


def test_update_student_not_found(
    admin_school_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_school_client.patch(
        f"/api/orgs/{_ORG_ID}/school/students/{_PROFILE_ID}",
        json={"grade": "x"},
    )
    assert r.status_code == 404
