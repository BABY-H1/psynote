"""
Distribution router tests — 镜像 ``server/src/modules/assessment/distribution.routes.ts``.

3 endpoint:
  GET   /api/orgs/{org_id}/assessments/{aid}/distributions/             — 列表
  POST  /api/orgs/{org_id}/assessments/{aid}/distributions/             — 创建 (admin/counselor)
  PATCH /api/orgs/{org_id}/assessments/{aid}/distributions/{did}/status — 更新状态
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.assessment.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"
_AID = "00000000-0000-0000-0000-000000000111"
_DID = "00000000-0000-0000-0000-000000000444"


def test_list_distributions_happy(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
    make_distribution: object,
) -> None:
    d = make_distribution()  # type: ignore[operator]
    setup_db_results([[d]])
    r = staff_client.get(f"/api/orgs/{_ORG_ID}/assessments/{_AID}/distributions/")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_list_distributions_rejects_client_role(
    client_role_client: TestClient,
) -> None:
    r = client_role_client.get(f"/api/orgs/{_ORG_ID}/assessments/{_AID}/distributions/")
    assert r.status_code == 403


def test_create_distribution_happy(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """counselor 创建 distribution."""
    setup_db_results([])
    r = staff_client.post(
        f"/api/orgs/{_ORG_ID}/assessments/{_AID}/distributions/",
        json={"mode": "public", "targets": []},
    )
    assert r.status_code == 201, r.text


def test_create_distribution_rejects_client_role(
    client_role_client: TestClient,
) -> None:
    r = client_role_client.post(
        f"/api/orgs/{_ORG_ID}/assessments/{_AID}/distributions/",
        json={"mode": "public"},
    )
    assert r.status_code == 403


def test_update_distribution_status_happy(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
    make_distribution: object,
) -> None:
    d = make_distribution()  # type: ignore[operator]
    setup_db_results([d])
    r = staff_client.patch(
        f"/api/orgs/{_ORG_ID}/assessments/{_AID}/distributions/{_DID}/status",
        json={"status": "closed"},
    )
    assert r.status_code == 200
    assert d.status == "closed"


def test_update_distribution_status_404(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = staff_client.patch(
        f"/api/orgs/{_ORG_ID}/assessments/{_AID}/distributions/{_DID}/status",
        json={"status": "closed"},
    )
    assert r.status_code == 404
