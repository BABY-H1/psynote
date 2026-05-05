"""
Scale router tests — 镜像 ``server/src/modules/assessment/scale.routes.ts``.

5 endpoint:
  GET    /api/orgs/{org_id}/scales/                 — 列表 (含 dimCount/itemCount)
  GET    /api/orgs/{org_id}/scales/{sid}            — 详情 (嵌套 dim/rules/items)
  POST   /api/orgs/{org_id}/scales/                 — 创建 (admin/counselor)
  PATCH  /api/orgs/{org_id}/scales/{sid}            — 更新
  DELETE /api/orgs/{org_id}/scales/{sid}            — 硬删
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.assessment.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"
_SID = "00000000-0000-0000-0000-000000000222"


# ─── GET / ──────────────────────────────────────────────────────


def test_list_scales_happy(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
    make_scale: object,
) -> None:
    s = make_scale(title="PHQ-9")  # type: ignore[operator]
    # Phase 5 N+1 修后, 改成 3 个查询: scales / GROUP BY dim_count / GROUP BY item_count.
    # 后两个 .all() 返 [(scale_id, count)] 形态.
    setup_db_results([[s], [(s.id, 3)], [(s.id, 9)]])
    r = staff_client.get(f"/api/orgs/{_ORG_ID}/scales/")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["title"] == "PHQ-9"
    assert body[0]["dimensionCount"] == 3
    assert body[0]["itemCount"] == 9


def test_list_scales_rejects_client_role(client_role_client: TestClient) -> None:
    r = client_role_client.get(f"/api/orgs/{_ORG_ID}/scales/")
    assert r.status_code == 403


# ─── GET /{sid} ─────────────────────────────────────────────────


def test_get_scale_happy(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
    make_scale: object,
) -> None:
    s = make_scale()  # type: ignore[operator]
    # FIFO: 1) scale, 2) dimensions=[], 3) (skip rules; no dimensions), 4) items=[]
    setup_db_results([s, [], []])
    r = staff_client.get(f"/api/orgs/{_ORG_ID}/scales/{_SID}")
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "Test Scale"
    assert body["dimensions"] == []
    assert body["items"] == []


def test_get_scale_404(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = staff_client.get(f"/api/orgs/{_ORG_ID}/scales/{_SID}")
    assert r.status_code == 404


# ─── POST / ─────────────────────────────────────────────────────


def test_create_scale_happy(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """admin 创建 scale + 1 dim + 1 item."""
    # FIFO 复杂: insert 走 db.add (无 execute), GET 详情 = 1 scale + 1 dim_list + 1 rule_list + 1 items_list
    # 但 _insert_dimensions_and_rules 没有额外 execute (用 db.add) — 只有 GET 端的查询
    from tests.api.v1.assessment.conftest import _make_scale

    s = _make_scale()
    setup_db_results([s, [], [], []])
    r = admin_client.post(
        f"/api/orgs/{_ORG_ID}/scales/",
        json={
            "title": "Test",
            "dimensions": [{"name": "情绪", "rules": []}],
            "items": [
                {
                    "text": "我感到低落",
                    "dimensionIndex": 0,
                    "options": [{"label": "无", "value": 0}, {"label": "经常", "value": 3}],
                }
            ],
        },
    )
    assert r.status_code == 201, r.text


def test_create_scale_rejects_client_role(
    client_role_client: TestClient,
) -> None:
    r = client_role_client.post(
        f"/api/orgs/{_ORG_ID}/scales/",
        json={
            "title": "X",
            "dimensions": [{"name": "d"}],
            "items": [
                {
                    "text": "t",
                    "dimensionIndex": 0,
                    "options": [{"label": "a", "value": 0}],
                }
            ],
        },
    )
    assert r.status_code == 403


# ─── PATCH /{sid} ───────────────────────────────────────────────


def test_update_scale_happy_scalar_only(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
    make_scale: object,
) -> None:
    """更新仅 scalar, 不动 dimensions/items."""
    s = make_scale()  # type: ignore[operator]
    # FIFO: 1) _assert_scale_owned_by_org load, 2-4) GET 详情 reload (scale, dims, items)
    setup_db_results([s, s, [], []])
    r = admin_client.patch(
        f"/api/orgs/{_ORG_ID}/scales/{_SID}",
        json={"title": "Renamed"},
    )
    assert r.status_code == 200, r.text
    assert s.title == "Renamed"


def test_update_scale_rejects_partial_nested(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
    make_scale: object,
) -> None:
    """dimensions 单独送, items 不送 → 400."""
    s = make_scale()  # type: ignore[operator]
    setup_db_results([s])
    r = admin_client.patch(
        f"/api/orgs/{_ORG_ID}/scales/{_SID}",
        json={"dimensions": [{"name": "d"}]},
    )
    assert r.status_code == 400


# ─── DELETE /{sid} ──────────────────────────────────────────────


def test_delete_scale_happy(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
    make_scale: object,
) -> None:
    s = make_scale()  # type: ignore[operator]
    # FIFO: 1) _assert_scale_owned_by_org load, 2) DELETE
    setup_db_results([s, None])
    r = admin_client.delete(f"/api/orgs/{_ORG_ID}/scales/{_SID}")
    assert r.status_code == 204


def test_delete_scale_404(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_client.delete(f"/api/orgs/{_ORG_ID}/scales/{_SID}")
    assert r.status_code == 404
