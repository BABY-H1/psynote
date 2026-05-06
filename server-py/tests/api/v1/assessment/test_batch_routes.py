"""
Batch router tests — 镜像 ``server/src/modules/assessment/batch.routes.ts``.

4 endpoint:
  GET   /api/orgs/{org_id}/assessment-batches/                      — 列表
  GET   /api/orgs/{org_id}/assessment-batches/{batch_id}            — 详情 + stats
  POST  /api/orgs/{org_id}/assessment-batches/                      — 创建 (admin only)
  PATCH /api/orgs/{org_id}/assessment-batches/{batch_id}/close      — 关闭 (admin only)
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.assessment.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"
_BID = "00000000-0000-0000-0000-000000000333"
_AID = "00000000-0000-0000-0000-000000000111"


def test_list_batches_happy(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
    make_batch: object,
) -> None:
    b = make_batch()  # type: ignore[operator]
    setup_db_results([[b]])
    r = staff_client.get(f"/api/orgs/{_ORG_ID}/assessment-batches/")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_list_batches_rejects_client_role(client_role_client: TestClient) -> None:
    r = client_role_client.get(f"/api/orgs/{_ORG_ID}/assessment-batches/")
    assert r.status_code == 403


def test_get_batch_happy_with_stats(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
    make_batch: object,
    make_result: object,
) -> None:
    """详情含实时 stats: 2 results, 1 level_2 + 1 level_3 (P0.4: SQL GROUP BY 聚合)."""
    b = make_batch()  # type: ignore[operator]
    setup_db_results([b, [("level_2", 1), ("level_3", 1)]])
    r = staff_client.get(f"/api/orgs/{_ORG_ID}/assessment-batches/{_BID}")
    assert r.status_code == 200
    body = r.json()
    assert body["stats"]["total"] == 10
    assert body["stats"]["completed"] == 2
    assert body["stats"]["riskDistribution"] == {"level_2": 1, "level_3": 1}


def test_get_batch_404(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = staff_client.get(f"/api/orgs/{_ORG_ID}/assessment-batches/{_BID}")
    assert r.status_code == 404


def test_create_batch_admin_happy(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """admin 创建 batch."""
    setup_db_results([])  # 创建只走 db.add, 无 select
    r = admin_client.post(
        f"/api/orgs/{_ORG_ID}/assessment-batches/",
        json={
            "assessmentId": _AID,
            "title": "T",
            "totalTargets": 10,
        },
    )
    assert r.status_code == 201, r.text


def test_create_batch_rejects_counselor(
    staff_client: TestClient,
) -> None:
    r = staff_client.post(
        f"/api/orgs/{_ORG_ID}/assessment-batches/",
        json={
            "assessmentId": _AID,
            "title": "T",
            "totalTargets": 10,
        },
    )
    assert r.status_code == 403


def test_close_batch_admin_happy(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
    make_batch: object,
) -> None:
    b = make_batch(status="active")  # type: ignore[operator]
    setup_db_results([b])
    r = admin_client.patch(f"/api/orgs/{_ORG_ID}/assessment-batches/{_BID}/close")
    assert r.status_code == 200
    assert b.status == "closed"


def test_close_batch_404(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_client.patch(f"/api/orgs/{_ORG_ID}/assessment-batches/{_BID}/close")
    assert r.status_code == 404
