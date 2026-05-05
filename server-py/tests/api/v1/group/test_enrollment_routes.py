"""
Group enrollment routes — 镜像 Node ``server/src/modules/group/enrollment.routes.ts``.

覆盖 3 endpoints + capacity-aware initial status + auto-promote waitlist + RBAC.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.group.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"
_INSTANCE_ID = "00000000-0000-0000-0000-000000000333"
_ENROLLMENT_ID = "00000000-0000-0000-0000-000000000444"
_USER_ID = "00000000-0000-0000-0000-000000000010"


# ─── POST /:instance_id/enroll-batch ──────────────────────────


def test_enroll_batch_with_user_id_succeeds(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
    make_instance: object,
) -> None:
    """传 userId: 跳过 findOrCreate, 直接 enroll."""
    inst = make_instance(capacity=None)  # type: ignore[operator]
    # 流: dup_q (None) + instance_q (inst) — capacity NULL 跳计数
    setup_db_results([None, inst])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}/enroll-batch",
        json={"members": [{"userId": _USER_ID}]},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["enrolled"] == 1
    assert body["errors"] == []
    mock_db.commit.assert_awaited()


def test_enroll_batch_member_no_id_or_email_records_error(
    admin_org_client: TestClient,
) -> None:
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}/enroll-batch",
        json={"members": [{"name": "孤"}]},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["enrolled"] == 0
    assert len(body["errors"]) == 1


def test_enroll_batch_empty_members_returns_400(
    admin_org_client: TestClient,
) -> None:
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}/enroll-batch",
        json={"members": []},
    )
    assert r.status_code == 400


def test_enroll_batch_rejects_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}/enroll-batch",
        json={"members": [{"userId": _USER_ID}]},
    )
    assert r.status_code == 403


# ─── POST /:instance_id/enroll ────────────────────────────────


def test_enroll_single_self_no_capacity_pending(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
    make_instance: object,
) -> None:
    """无 capacity → status 'pending'."""
    inst = make_instance(capacity=None)  # type: ignore[operator]
    setup_db_results([None, inst])  # dup_q + instance_q
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}/enroll",
        json={},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "pending"
    mock_db.commit.assert_awaited()


def test_enroll_single_capacity_full_waitlisted(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
) -> None:
    """capacity 满: status='waitlisted'."""
    inst = make_instance(capacity=2)  # type: ignore[operator]
    # dup_q + instance_q + count(*) = 2 (>=capacity)
    setup_db_results([None, inst, 2])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}/enroll",
        json={},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "waitlisted"


def test_enroll_single_duplicate_returns_409(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_enrollment: object,
) -> None:
    """已存在同 (instance, user) → ConflictError 409."""
    existing = make_enrollment()  # type: ignore[operator]
    setup_db_results([existing])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}/enroll",
        json={},
    )
    assert r.status_code == 409


def test_enroll_single_with_care_episode_writes_timeline(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
    make_instance: object,
) -> None:
    """care_episode_id: 同步写 care_timeline."""
    inst = make_instance(capacity=None)  # type: ignore[operator]
    setup_db_results([None, inst])

    care_id = "00000000-0000-0000-0000-0000000000c1"
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/group/instances/{_INSTANCE_ID}/enroll",
        json={"careEpisodeId": care_id},
    )
    assert r.status_code == 201
    # add 至少调用 2 次: enrollment + timeline
    assert mock_db.add.call_count >= 2


# ─── PATCH /enrollments/:enrollment_id ────────────────────────


def test_update_enrollment_status_approved_sets_enrolled_at(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
    make_enrollment: object,
) -> None:
    enr = make_enrollment(status="pending")  # type: ignore[operator]
    setup_db_results([enr])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/group/instances/enrollments/{_ENROLLMENT_ID}",
        json={"status": "approved"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "approved"
    assert body["enrolledAt"] is not None
    mock_db.commit.assert_awaited()


def test_update_enrollment_status_rejected_triggers_promote(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_enrollment: object,
    make_instance: object,
) -> None:
    """rejected → autoPromote: 找 instance + count + 找 next waitlist."""
    enr = make_enrollment(status="pending")  # type: ignore[operator]
    inst = make_instance(capacity=2)  # type: ignore[operator]
    next_waitlist = make_enrollment(  # type: ignore[operator]
        enrollment_id=uuid.UUID("00000000-0000-0000-0000-0000000005ff"),
        status="waitlisted",
    )
    # enrollment lookup → autoPromote: instance lookup → count → next waitlist
    setup_db_results([enr, inst, 1, next_waitlist])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/group/instances/enrollments/{_ENROLLMENT_ID}",
        json={"status": "rejected"},
    )
    assert r.status_code == 200
    # 状态被改 + 旁边那行被 promote 到 pending
    assert next_waitlist.status == "pending"


def test_update_enrollment_status_not_found_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/group/instances/enrollments/{_ENROLLMENT_ID}",
        json={"status": "approved"},
    )
    assert r.status_code == 404


def test_update_enrollment_status_missing_status_returns_400(
    admin_org_client: TestClient,
) -> None:
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/group/instances/enrollments/{_ENROLLMENT_ID}",
        json={},
    )
    assert r.status_code == 400


def test_update_enrollment_status_rejects_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.patch(
        f"/api/orgs/{_ORG_ID}/group/instances/enrollments/{_ENROLLMENT_ID}",
        json={"status": "approved"},
    )
    assert r.status_code == 403
