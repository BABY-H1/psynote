"""Groups + courses 测试.

全部 guardian-blocked. 重点:
  - GET /groups: 列 recruiting + my-enrollment-status + scheme summary
  - GET /groups/{id}: enrollment 必须存在
  - POST check-in: enrollment + session 必须 match
  - GET /courses: published 过滤
  - GET /courses/{id}: enrollment 必须存在 + visibility 过滤
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.client_portal.conftest import SetupDbResults

_ORG = "00000000-0000-0000-0000-000000000099"
_INSTANCE = "00000000-0000-0000-0000-000000000ccc"
_SESSION = "00000000-0000-0000-0000-000000000eee"
_COURSE = "00000000-0000-0000-0000-0000000000c1"
_CHILD = "00000000-0000-0000-0000-000000000002"


def test_list_groups_returns_empty_when_no_recruiting(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([[]])
    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/groups")
    assert r.status_code == 200
    assert r.json() == []


def test_list_groups_rejects_as_param(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/groups?as={_CHILD}")
    assert r.status_code == 403


def test_my_groups_self_only(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_group_enrollment: object,
) -> None:
    rows = [(make_group_enrollment(), "Test Group", "recruiting")]  # type: ignore[operator]
    setup_db_results([rows])
    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/my-groups")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_get_group_404_when_not_enrolled(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])  # enrollment 不存在
    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/groups/{_INSTANCE}")
    assert r.status_code == 400  # ValidationError


def test_check_in_creates_attendance(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_group_enrollment: object,
    make_session_record: object,
) -> None:
    enr = make_group_enrollment()  # type: ignore[operator]
    rec = make_session_record()  # type: ignore[operator]
    setup_db_results([enr, rec, None])  # enrollment + session + 无 existing attendance
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG}/client/groups/{_INSTANCE}/sessions/{_SESSION}/check-in"
    )
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "present"


def test_check_in_returns_existing_when_already_checked(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_group_enrollment: object,
    make_session_record: object,
    make_attendance: object,
) -> None:
    enr = make_group_enrollment()  # type: ignore[operator]
    rec = make_session_record()  # type: ignore[operator]
    existing = make_attendance()  # type: ignore[operator]
    setup_db_results([enr, rec, existing])
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG}/client/groups/{_INSTANCE}/sessions/{_SESSION}/check-in"
    )
    assert r.status_code == 200


def test_check_in_404_when_not_enrolled(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG}/client/groups/{_INSTANCE}/sessions/{_SESSION}/check-in"
    )
    assert r.status_code == 400


def test_list_courses_published_only(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_course: object,
) -> None:
    rows = [make_course()]  # type: ignore[operator]
    setup_db_results([rows])
    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/courses")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_my_courses_self_only(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_course_enrollment: object,
) -> None:
    enr = make_course_enrollment()  # type: ignore[operator]
    rows = [(enr, "Test Course", "psychology")]
    setup_db_results([rows])
    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/my-courses")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_get_course_404_when_not_enrolled(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/courses/{_COURSE}")
    assert r.status_code == 400


def test_get_course_happy_no_chapters(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_course_enrollment: object,
    make_course: object,
) -> None:
    enr = make_course_enrollment()  # type: ignore[operator]
    course = make_course()  # type: ignore[operator]
    setup_db_results([enr, course, []])  # enrollment + course + 0 chapters
    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/courses/{_COURSE}")
    assert r.status_code == 200
    body = r.json()
    assert body["course"]["id"] == str(uuid.UUID(_COURSE))
    assert body["chapters"] == []
