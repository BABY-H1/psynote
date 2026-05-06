"""
Group session routes — 镜像 Node ``server/src/modules/group/session.routes.ts``.

覆盖 7 endpoints + RBAC + scheme-init guard + attendance upsert + summary 仅 completed.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.group.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"
_INSTANCE_ID = "00000000-0000-0000-0000-000000000333"
_SESSION_ID = "00000000-0000-0000-0000-000000000555"
_ENROLLMENT_ID = "00000000-0000-0000-0000-000000000444"


# ─── GET /:instance_id/sessions ───────────────────────────────


def test_list_session_records_happy_with_attendance_count(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_session_record: object,
    make_attendance: object,
) -> None:
    """records + 每条出勤计数 (#5: GROUP BY 聚合 (sid, total, present) tuple)."""
    rec = make_session_record(session_number=1)  # type: ignore[operator]
    # 出勤聚合: rec.id 下 1 present + 1 absent → total=2 / present=1
    setup_db_results([[rec], [(rec.id, 2, 1)]])

    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}/sessions")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) == 1
    assert body[0]["totalAttendance"] == 2
    assert body[0]["attendanceCount"] == 1


def test_list_session_records_empty(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([[]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}/sessions")
    assert r.status_code == 200
    assert r.json() == []


def test_list_session_records_rejects_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.get(f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}/sessions")
    assert r.status_code == 403


# ─── GET /:instance_id/sessions/:session_id ───────────────────


def test_get_session_record_with_attendance(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_session_record: object,
    make_attendance: object,
    make_enrollment: object,
) -> None:
    rec = make_session_record()  # type: ignore[operator]
    att = make_attendance(status="present")  # type: ignore[operator]
    enr = make_enrollment()  # type: ignore[operator]
    # join row tuple: (att, enrollment, user_name, user_email)
    setup_db_results([rec, [(att, enr, "甲", "a@b.com")]])

    r = admin_org_client.get(
        f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}/sessions/{_SESSION_ID}"
    )
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == _SESSION_ID
    assert len(body["attendance"]) == 1
    assert body["attendance"][0]["user"]["name"] == "甲"


def test_get_session_record_not_found(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.get(
        f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}/sessions/{_SESSION_ID}"
    )
    assert r.status_code == 404


# ─── POST /:instance_id/sessions/init ─────────────────────────


def test_init_session_records_with_scheme_creates_records(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
    make_instance: object,
    make_scheme_session: object,
) -> None:
    """instance 有 scheme + 还没 init: 派生 records."""
    import uuid as uuid_mod

    inst = make_instance(  # type: ignore[operator]
        scheme_id=uuid_mod.UUID("00000000-0000-0000-0000-000000000111")
    )
    ss = make_scheme_session(title="ScSess", sort_order=0)  # type: ignore[operator]
    setup_db_results([inst, None, [ss]])  # instance / existing / scheme_sessions

    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}/sessions/init")
    assert r.status_code == 201
    body = r.json()
    assert isinstance(body, list)
    assert len(body) == 1
    mock_db.commit.assert_awaited()


def test_init_session_records_no_scheme_returns_400(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
) -> None:
    """instance.scheme_id NULL → ValidationError."""
    inst = make_instance(scheme_id=None)  # type: ignore[operator]
    setup_db_results([inst])

    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}/sessions/init")
    assert r.status_code == 400


def test_init_session_records_already_initialized_returns_400(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
    make_session_record: object,
) -> None:
    """已经 init 过 → 拒绝."""
    import uuid as uuid_mod

    inst = make_instance(  # type: ignore[operator]
        scheme_id=uuid_mod.UUID("00000000-0000-0000-0000-000000000111")
    )
    existing = make_session_record()  # type: ignore[operator]
    setup_db_results([inst, existing])
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}/sessions/init")
    assert r.status_code == 400


def test_init_session_records_rejects_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}/sessions/init"
    )
    assert r.status_code == 403


# ─── POST /:instance_id/sessions (ad-hoc) ─────────────────────


def test_create_ad_hoc_session_record(
    admin_org_client: TestClient,
    mock_db: AsyncMock,
) -> None:
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}/sessions",
        json={"title": "课外补", "sessionNumber": 9},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["title"] == "课外补"
    assert body["sessionNumber"] == 9
    mock_db.commit.assert_awaited()


def test_create_session_record_missing_required_fields_400(
    admin_org_client: TestClient,
) -> None:
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}/sessions",
        json={"title": "no number"},
    )
    assert r.status_code == 400


# ─── PATCH /:instance_id/sessions/:session_id ─────────────────


def test_update_session_record_status_to_completed(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
    make_session_record: object,
) -> None:
    rec = make_session_record(status="planned")  # type: ignore[operator]
    setup_db_results([rec])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}/sessions/{_SESSION_ID}",
        json={"status": "completed", "notes": "结束"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "completed"
    assert r.json()["notes"] == "结束"
    mock_db.commit.assert_awaited()


def test_update_session_record_not_found(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}/sessions/{_SESSION_ID}",
        json={"status": "completed"},
    )
    assert r.status_code == 404


# ─── POST /:instance_id/sessions/:session_id/attendance ────


def test_record_attendance_inserts_new(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """upsert path: 没有 existing → insert."""
    setup_db_results([None])  # existing 检查 → 不存在

    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}/sessions/{_SESSION_ID}/attendance",
        json={
            "attendances": [
                {"enrollmentId": _ENROLLMENT_ID, "status": "present"},
            ]
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) == 1
    mock_db.commit.assert_awaited()


def test_record_attendance_upserts_existing(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_attendance: object,
) -> None:
    """upsert path: existing → update status."""
    existing = make_attendance(status="absent")  # type: ignore[operator]
    setup_db_results([existing])

    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}/sessions/{_SESSION_ID}/attendance",
        json={
            "attendances": [
                {"enrollmentId": _ENROLLMENT_ID, "status": "present", "note": "改"},
            ]
        },
    )
    assert r.status_code == 200
    body = r.json()
    # status 已被改成 present
    assert body[0]["status"] == "present"


def test_record_attendance_empty_array_400(
    admin_org_client: TestClient,
) -> None:
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}/sessions/{_SESSION_ID}/attendance",
        json={"attendances": []},
    )
    assert r.status_code == 400


# ─── GET /:instance_id/attendance-summary ─────────────────────


def test_attendance_summary_only_completed_counted(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """summary 只算 status='completed' 的 records.

    这里给 1 个 completed record 的 id, 然后 attendance rows: 1 present + 1 absent.
    """
    import uuid as uuid_mod

    rec_id = uuid_mod.UUID("00000000-0000-0000-0000-000000000777")
    enr_a = uuid_mod.UUID("00000000-0000-0000-0000-000000000888")
    enr_b = uuid_mod.UUID("00000000-0000-0000-0000-000000000999")
    # #6: SQL GROUP BY 直接返 (enrollment_id, total, present);
    # enr_a 1 present → total=1/present=1; enr_b 1 absent → total=1/present=0
    setup_db_results([[rec_id], [(enr_a, 1, 1), (enr_b, 1, 0)]])

    r = admin_org_client.get(
        f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}/attendance-summary"
    )
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, dict)
    assert body[str(enr_a)]["present"] == 1
    assert body[str(enr_a)]["total"] == 1
    assert body[str(enr_b)]["present"] == 0
    assert body[str(enr_b)]["total"] == 1


def test_attendance_summary_no_completed_returns_empty(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([[]])
    r = admin_org_client.get(
        f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}/attendance-summary"
    )
    assert r.status_code == 200
    assert r.json() == {}
