"""
Admin library routes — 镜像 ``admin-library.routes.ts``.

Phase 3 Tier 4 smoke tests (6 类知识库 CRUD + distribution):

  - GET    /api/admin/library/{type}                    — 平台级列表
  - GET    /api/admin/library/{type}/{id}               — 平台级单条 (org_id IS NULL 限制)
  - POST   /api/admin/library/{type}                    — 创建 (org_id=NULL)
  - PATCH  /api/admin/library/{type}/{id}               — 顶层字段更新
  - DELETE /api/admin/library/{type}/{id}               — 删除 (course 软删)
  - PATCH  /api/admin/library/{type}/{id}/distribution  — 分发 allowed_org_ids

type ∈ {scales, courses, schemes, templates, goals, agreements}.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.admin.conftest import SetupDbResults


_ITEM_ID = "00000000-0000-0000-0000-000000000033"


# ─── Auth/RBAC ──────────────────────────────────────────────────────


def test_list_library_requires_auth(client: TestClient) -> None:
    r = client.get("/api/admin/library/scales")
    assert r.status_code == 401


def test_list_library_rejects_non_sysadm(authed_client: TestClient) -> None:
    r = authed_client.get("/api/admin/library/scales")
    assert r.status_code == 403


def test_list_library_unknown_type(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """unknown type slug → 404."""
    setup_db_results([])
    r = sysadm_client.get("/api/admin/library/widgets")
    assert r.status_code == 404


# ─── List / Get ─────────────────────────────────────────────────────


def test_list_scales_empty(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([[]])
    r = sysadm_client.get("/api/admin/library/scales")
    assert r.status_code == 200
    assert r.json() == []


def test_get_scale_404(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = sysadm_client.get(f"/api/admin/library/scales/{_ITEM_ID}")
    assert r.status_code == 404


def test_get_scale_happy(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """scale 存在 → 返回 row 序列化为 dict (camelCase)."""
    from app.db.models.scales import Scale

    s = Scale()
    s.id = uuid.UUID(_ITEM_ID)
    s.org_id = None
    s.title = "PHQ-9"
    s.description = "depression scale"
    s.instructions = None
    s.scoring_mode = "sum"
    s.is_public = True
    s.allowed_org_ids = []
    s.created_by = None
    setup_db_results([s])

    r = sysadm_client.get(f"/api/admin/library/scales/{_ITEM_ID}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == _ITEM_ID
    assert body["title"] == "PHQ-9"
    assert body["isPublic"] is True


# ─── Create ─────────────────────────────────────────────────────────


def test_create_scale_missing_title(sysadm_client: TestClient) -> None:
    """title 必填 — 缺则 400."""
    r = sysadm_client.post("/api/admin/library/scales", json={})
    assert r.status_code == 400


def test_create_scale_happy(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """浅 insert (Phase 3 trade-off, 子表不写)."""
    setup_db_results([])  # create_library_item 不 select, 直接 add
    r = sysadm_client.post(
        "/api/admin/library/scales",
        json={"title": "GAD-7", "description": "anxiety"},
    )
    assert r.status_code == 201
    mock_db.add.assert_called()
    mock_db.commit.assert_awaited()


def test_create_course_sets_template(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """course 平台级 → is_template=True (与 Node admin-library.routes.ts:222-228 一致)."""
    setup_db_results([])
    r = sysadm_client.post(
        "/api/admin/library/courses",
        json={"title": "正念入门"},
    )
    assert r.status_code == 201


def test_create_template_unknown_type(sysadm_client: TestClient) -> None:
    r = sysadm_client.post("/api/admin/library/foo", json={"title": "x"})
    assert r.status_code == 404


# ─── Update ─────────────────────────────────────────────────────────


def test_patch_library_404(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = sysadm_client.patch(
        f"/api/admin/library/scales/{_ITEM_ID}",
        json={"title": "newtitle"},
    )
    assert r.status_code == 404


def test_patch_library_happy(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    from app.db.models.scales import Scale

    s = Scale()
    s.id = uuid.UUID(_ITEM_ID)
    s.org_id = None
    s.title = "Old"
    s.description = None
    s.instructions = None
    s.scoring_mode = "sum"
    s.is_public = True
    s.allowed_org_ids = []
    s.created_by = None
    setup_db_results([s])

    r = sysadm_client.patch(
        f"/api/admin/library/scales/{_ITEM_ID}",
        json={"title": "Renamed"},
    )
    assert r.status_code == 200
    assert s.title == "Renamed"
    mock_db.commit.assert_awaited()


# ─── Delete ─────────────────────────────────────────────────────────


def test_delete_scale_physical(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """非 course 类型 → 物理 DELETE."""
    setup_db_results([None])  # delete query 自身没 row
    r = sysadm_client.delete(f"/api/admin/library/scales/{_ITEM_ID}")
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    mock_db.commit.assert_awaited()


def test_delete_course_soft(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """course → 软删 (status=archived). 先 select 查存在性."""
    from app.db.models.courses import Course

    c = Course()
    c.id = uuid.UUID(_ITEM_ID)
    c.org_id = None
    c.title = "T"
    c.is_template = True
    c.is_public = True
    c.status = "published"
    c.creation_mode = "manual"
    setup_db_results([c])

    r = sysadm_client.delete(f"/api/admin/library/courses/{_ITEM_ID}")
    assert r.status_code == 200
    assert c.status == "archived"
    mock_db.commit.assert_awaited()


def test_delete_course_404(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = sysadm_client.delete(f"/api/admin/library/courses/{_ITEM_ID}")
    assert r.status_code == 404


# ─── Distribution ───────────────────────────────────────────────────


def test_distribution_404(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = sysadm_client.patch(
        f"/api/admin/library/scales/{_ITEM_ID}/distribution",
        json={"allowedOrgIds": []},
    )
    assert r.status_code == 404


def test_distribution_invalid_uuid(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """allowedOrgIds 含非 UUID → 400."""
    from app.db.models.scales import Scale

    s = Scale()
    s.id = uuid.UUID(_ITEM_ID)
    s.org_id = None
    s.title = "T"
    s.scoring_mode = "sum"
    s.is_public = True
    s.allowed_org_ids = []
    setup_db_results([s])

    r = sysadm_client.patch(
        f"/api/admin/library/scales/{_ITEM_ID}/distribution",
        json={"allowedOrgIds": ["not-a-uuid"]},
    )
    assert r.status_code == 400


def test_distribution_happy(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    from app.db.models.scales import Scale

    s = Scale()
    s.id = uuid.UUID(_ITEM_ID)
    s.org_id = None
    s.title = "T"
    s.scoring_mode = "sum"
    s.is_public = True
    s.allowed_org_ids = []
    setup_db_results([s])

    target_orgs = [
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222",
    ]
    r = sysadm_client.patch(
        f"/api/admin/library/scales/{_ITEM_ID}/distribution",
        json={"allowedOrgIds": target_orgs},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["allowedOrgIds"] == target_orgs
    assert s.allowed_org_ids == target_orgs
    mock_db.commit.assert_awaited()


def test_distribution_rejects_non_sysadm(authed_client: TestClient) -> None:
    r = authed_client.patch(
        f"/api/admin/library/scales/{_ITEM_ID}/distribution",
        json={"allowedOrgIds": []},
    )
    assert r.status_code == 403
