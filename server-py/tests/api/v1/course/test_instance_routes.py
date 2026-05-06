"""
Course instance router — 镜像 Node ``instance.routes.ts`` + ``instance.service.ts``.

涵盖 endpoint:
  - GET    /api/orgs/{org_id}/course-instances/                              — 列表
  - GET    /api/orgs/{org_id}/course-instances/{instance_id}                 — 详情
  - GET    .../candidates                                                    — workflow stub (空 list)
  - POST   /api/orgs/{org_id}/course-instances/                              — 创建
  - PATCH  /api/orgs/{org_id}/course-instances/{instance_id}                 — 更新
  - DELETE /api/orgs/{org_id}/course-instances/{instance_id}                 — 删除 (仅 draft)
  - POST   /{instance_id}/activate                                           — 激活
  - POST   /{instance_id}/close                                              — 关闭
  - POST   /{instance_id}/archive                                            — 归档

Template→Instance 派生检查 (instance.service.ts:108-130):
  - 源 course 不存在 → 404
  - 源 course.status != 'published' → 409
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.course.conftest import SetupDbResults

_ORG_ID = "00000000-0000-0000-0000-000000000099"
_COURSE_ID = "00000000-0000-0000-0000-000000000111"
_INSTANCE_ID = "00000000-0000-0000-0000-000000000555"


# ─── GET / 列表 ──────────────────────────────────────────────────


def test_list_instances_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
) -> None:
    inst = make_instance(title="春季班")  # type: ignore[operator]
    # query 返回 (instance, course_type, target_audience, category, count) 元组列表
    setup_db_results([[(inst, "micro_course", "high_school", "心理健康", 5)]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/course-instances/")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["title"] == "春季班"
    assert body[0]["enrollmentCount"] == 5
    assert body[0]["courseType"] == "micro_course"


def test_list_instances_search_filter(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
) -> None:
    inst = make_instance(title="春季班")  # type: ignore[operator]
    setup_db_results([[(inst, None, None, None, 0)]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/course-instances/?search=不匹配")
    assert r.status_code == 200
    assert r.json() == []


# ─── GET /{instance_id} 详情 ────────────────────────────────────


def test_get_instance_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
    make_enrollment: object,
) -> None:
    inst = make_instance(title="X")  # type: ignore[operator]
    # detail join: row tuple (instance, course_title, course_category);
    # 之后单 query 聚合 count 直接返 (total=2, completed=1)。
    setup_db_results([(inst, "课程标题", "心理"), (2, 1)])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}")
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "X"
    assert body["course"]["title"] == "课程标题"
    assert body["enrollmentStats"]["total"] == 2
    assert body["enrollmentStats"]["completed"] == 1


def test_get_instance_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}")
    assert r.status_code == 404


def test_list_candidates_returns_empty_stub(
    admin_org_client: TestClient,
) -> None:
    """Phase 3 stub — 直接返 []."""
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/candidates")
    assert r.status_code == 200
    assert r.json() == []


# ─── POST / 创建 (Template→Instance 派生) ──────────────────────


def test_create_instance_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_course: object,
    mock_db: AsyncMock,
) -> None:
    """源 course 已 published + admin → 201, 通知 admin."""
    src = make_course(status="published")  # type: ignore[operator]
    # source course; admin user_ids list (没人也行)
    setup_db_results([src, []])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/course-instances/",
        json={
            "courseId": _COURSE_ID,
            "title": "实例 1",
            "publishMode": "assign",
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["title"] == "实例 1"
    assert body["status"] == "draft"
    mock_db.commit.assert_awaited()


def test_create_instance_404_when_course_missing(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """源 course 不存在或不可见 → 404."""
    setup_db_results([None])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/course-instances/",
        json={"courseId": _COURSE_ID, "title": "x", "publishMode": "assign"},
    )
    assert r.status_code == 404


def test_create_instance_409_when_course_not_published(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_course: object,
) -> None:
    """源 course.status != 'published' → 409 (镜像 service.ts:128)."""
    src = make_course(status="draft")  # type: ignore[operator]
    setup_db_results([src])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/course-instances/",
        json={"courseId": _COURSE_ID, "title": "x", "publishMode": "assign"},
    )
    assert r.status_code == 409


def test_create_instance_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG_ID}/course-instances/",
        json={"courseId": _COURSE_ID, "title": "x", "publishMode": "assign"},
    )
    assert r.status_code == 403


# ─── PATCH /{instance_id} 更新 ─────────────────────────────────


def test_update_instance_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
    mock_db: AsyncMock,
) -> None:
    inst = make_instance(title="旧")  # type: ignore[operator]
    setup_db_results([inst])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}",
        json={"title": "新", "capacity": 50},
    )
    assert r.status_code == 200
    assert inst.title == "新"
    assert inst.capacity == 50


def test_update_instance_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}",
        json={"title": "x"},
    )
    assert r.status_code == 404


# ─── DELETE /{instance_id} ─────────────────────────────────────


def test_delete_instance_draft_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
    mock_db: AsyncMock,
) -> None:
    """draft 状态 → 204."""
    inst = make_instance(status="draft")  # type: ignore[operator]
    setup_db_results([inst])
    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}")
    assert r.status_code == 204


def test_delete_instance_400_when_active(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
) -> None:
    """active 状态 → 400 (only draft can be deleted)."""
    inst = make_instance(status="active")  # type: ignore[operator]
    setup_db_results([inst])
    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}")
    assert r.status_code == 400


def test_delete_instance_404_when_missing(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}")
    assert r.status_code == 404


# ─── Lifecycle: activate / close / archive ────────────────────


def test_activate_instance_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
) -> None:
    inst = make_instance(status="draft")  # type: ignore[operator]
    setup_db_results([inst])
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/activate")
    assert r.status_code == 200
    assert inst.status == "active"


def test_close_instance_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
) -> None:
    inst = make_instance(status="active")  # type: ignore[operator]
    setup_db_results([inst])
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/close")
    assert r.status_code == 200
    assert inst.status == "closed"


def test_archive_instance_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
) -> None:
    inst = make_instance(status="closed")  # type: ignore[operator]
    setup_db_results([inst])
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/archive")
    assert r.status_code == 200
    assert inst.status == "archived"


def test_activate_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/activate")
    assert r.status_code == 404
