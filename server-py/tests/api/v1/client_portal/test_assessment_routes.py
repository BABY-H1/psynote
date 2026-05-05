"""GET /results, /results/{id}, /results/trajectory/{scaleId} 测试.

Phase 9β client_visible 强校验; Phase 14 ?as= 完全拒绝.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.client_portal.conftest import SetupDbResults

_ORG = "00000000-0000-0000-0000-000000000099"
_RESULT = "00000000-0000-0000-0000-000000000333"
_SCALE = "00000000-0000-0000-0000-0000000000ee"
_CHILD = "00000000-0000-0000-0000-000000000002"


def test_list_results_filters_to_client_visible(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_result: object,
) -> None:
    rows = [make_result(client_visible=True)]  # type: ignore[operator]
    setup_db_results([rows])
    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/results")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["clientVisible"] is True


def test_list_results_rejects_as_param(
    client_role_org_client: TestClient,
) -> None:
    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/results?as={_CHILD}")
    assert r.status_code == 403


def test_get_single_result_404_when_not_visible(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/results/{_RESULT}")
    assert r.status_code == 404


def test_get_single_result_happy(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_result: object,
) -> None:
    setup_db_results([make_result(client_visible=True)])  # type: ignore[operator]
    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/results/{_RESULT}")
    assert r.status_code == 200
    body = r.json()
    assert body["clientVisible"] is True


def test_trajectory_rejects_as_param(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.get(
        f"/api/orgs/{_ORG}/client/results/trajectory/{_SCALE}?as={_CHILD}"
    )
    assert r.status_code == 403


def test_trajectory_returns_visible_results(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_result: object,
) -> None:
    rows = [make_result(client_visible=True)]  # type: ignore[operator]
    setup_db_results([rows])
    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/results/trajectory/{_SCALE}")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
