"""
Assessment core router tests — 镜像 ``server/src/modules/assessment/assessment.routes.ts``.

Phase 3 smoke tests (Node 端无 .test.ts, 这里建立基线), 6 endpoint:

  GET    /api/orgs/{org_id}/assessments/                       — 列表 (rejectClient)
  GET    /api/orgs/{org_id}/assessments/{aid}                  — 详情 (含 scales+dimMap)
  POST   /api/orgs/{org_id}/assessments/                       — 创建 (admin/counselor)
  PATCH  /api/orgs/{org_id}/assessments/{aid}                  — 更新
  DELETE /api/orgs/{org_id}/assessments/{aid}                  — 软删除
  POST   /api/orgs/{org_id}/assessments/{aid}/restore          — 恢复 (admin only)
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.assessment.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"
_AID = "00000000-0000-0000-0000-000000000111"


# ─── GET / ──────────────────────────────────────────────────────


def test_list_assessments_happy(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
    make_assessment: object,
) -> None:
    a = make_assessment(title="A 普查")  # type: ignore[operator]
    setup_db_results([[a]])

    r = staff_client.get(f"/api/orgs/{_ORG_ID}/assessments/")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) == 1
    assert body[0]["title"] == "A 普查"


def test_list_assessments_rejects_client_role(
    client_role_client: TestClient,
) -> None:
    r = client_role_client.get(f"/api/orgs/{_ORG_ID}/assessments/")
    assert r.status_code == 403


# ─── GET /{aid} ─────────────────────────────────────────────────


def test_get_assessment_happy(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
    make_assessment: object,
) -> None:
    a = make_assessment(title="新生入学测评")  # type: ignore[operator]
    # 三段 query: 1) assessment, 2) scales+join, 3) (无 scales → 不查 dimensions)
    setup_db_results([a, []])
    r = staff_client.get(f"/api/orgs/{_ORG_ID}/assessments/{_AID}")
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "新生入学测评"
    assert body["scales"] == []
    assert body["dimensionNameMap"] == {}


def test_get_assessment_404(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = staff_client.get(f"/api/orgs/{_ORG_ID}/assessments/{_AID}")
    assert r.status_code == 404


# ─── POST / ─────────────────────────────────────────────────────


def test_create_assessment_admin_happy(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
    make_assessment: object,
    mock_db: AsyncMock,
) -> None:
    """admin 创建, body 走 scaleIds (不走 blocks)."""
    a = make_assessment()  # type: ignore[operator]
    # FIFO: 1) INSERT junction (mock anything), 2) GET 详情 select assessment, 3) GET scales empty
    setup_db_results([None, a, []])
    r = admin_client.post(
        f"/api/orgs/{_ORG_ID}/assessments/",
        json={
            "title": "T",
            "scaleIds": ["00000000-0000-0000-0000-000000000222"],
        },
    )
    assert r.status_code == 201
    mock_db.commit.assert_awaited()


def test_create_assessment_requires_scale(
    admin_client: TestClient,
) -> None:
    """无 scale (既没 scaleIds 也没 blocks) → 400."""
    r = admin_client.post(
        f"/api/orgs/{_ORG_ID}/assessments/",
        json={"title": "T"},
    )
    assert r.status_code == 400
    assert "scale" in r.json()["message"]


def test_create_assessment_rejects_client_role(
    client_role_client: TestClient,
) -> None:
    r = client_role_client.post(
        f"/api/orgs/{_ORG_ID}/assessments/",
        json={"title": "T", "scaleIds": ["x"]},
    )
    assert r.status_code == 403


# ─── PATCH /{aid} ───────────────────────────────────────────────


def test_update_assessment_happy(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
    make_assessment: object,
) -> None:
    a = make_assessment(title="Old")  # type: ignore[operator]
    # PATCH: 1) load, then 2) GET refresh: load + scales (empty)
    setup_db_results([a, a, []])
    r = admin_client.patch(
        f"/api/orgs/{_ORG_ID}/assessments/{_AID}",
        json={"title": "New"},
    )
    assert r.status_code == 200
    assert a.title == "New"  # mutated in-place


def test_update_assessment_404(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_client.patch(
        f"/api/orgs/{_ORG_ID}/assessments/{_AID}",
        json={"title": "x"},
    )
    assert r.status_code == 404


# ─── DELETE /{aid} ──────────────────────────────────────────────


def test_delete_assessment_soft_happy(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
    make_assessment: object,
) -> None:
    a = make_assessment()  # type: ignore[operator]
    setup_db_results([a])
    r = admin_client.delete(f"/api/orgs/{_ORG_ID}/assessments/{_AID}")
    assert r.status_code == 204
    assert a.deleted_at is not None


def test_delete_assessment_404(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_client.delete(f"/api/orgs/{_ORG_ID}/assessments/{_AID}")
    assert r.status_code == 404


# ─── POST /{aid}/restore ────────────────────────────────────────


def test_restore_admin_happy(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
    make_assessment: object,
) -> None:
    a = make_assessment(deleted=True)  # type: ignore[operator]
    setup_db_results([a])
    r = admin_client.post(f"/api/orgs/{_ORG_ID}/assessments/{_AID}/restore")
    assert r.status_code == 200
    assert a.deleted_at is None


def test_restore_rejects_counselor(
    staff_client: TestClient,  # counselor not org_admin
) -> None:
    r = staff_client.post(f"/api/orgs/{_ORG_ID}/assessments/{_AID}/restore")
    assert r.status_code == 403
