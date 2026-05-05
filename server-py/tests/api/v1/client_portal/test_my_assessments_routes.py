"""GET /my-assessments — 跨 group + course 报名聚合测试."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.client_portal.conftest import SetupDbResults

_ORG = "00000000-0000-0000-0000-000000000099"
_CHILD = "00000000-0000-0000-0000-000000000002"


def test_my_assessments_rejects_as_param(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/my-assessments?as={_CHILD}")
    assert r.status_code == 403


def test_my_assessments_returns_empty_when_no_enrollments(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([[], []])  # group_rows + course_rows 都空
    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/my-assessments")
    assert r.status_code == 200
    assert r.json() == []


def test_my_assessments_aggregates_group_config(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """group enrollment + assessment_config 抓 phase, 查 assessments + 已完成."""
    aid = uuid.UUID("11111111-1111-1111-1111-111111111111")
    group_rows = [("Test Group", {"screening": [str(aid)]})]
    course_rows: list[object] = []  # 无 course
    a_rows = [(aid, "PHQ-9", "depression scale")]
    completed: list[uuid.UUID] = []  # 未完成
    setup_db_results([group_rows, course_rows, a_rows, completed])

    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/my-assessments")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["id"] == str(aid)
    assert body[0]["completed"] is False
    assert body[0]["context"]["phase"] == "screening"
    assert body[0]["context"]["instanceTitle"] == "Test Group"
    assert body[0]["runnerUrl"] == f"/assess/{aid}"
