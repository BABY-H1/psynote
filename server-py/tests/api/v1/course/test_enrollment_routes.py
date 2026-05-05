"""
Course enrollment router — 镜像 Node ``course-enrollment.routes.ts``.

涵盖 endpoint:
  - GET   /{instance_id}/enrollments                                          — 列表 (含 user join)
  - POST  /{instance_id}/assign                                               — 单点指派
  - POST  /{instance_id}/batch-enroll                                         — 批量班级报名
  - PATCH /{instance_id}/enrollments/{enrollment_id}                          — 审批 (approved/rejected)
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.course.conftest import SetupDbResults

_ORG_ID = "00000000-0000-0000-0000-000000000099"
_INSTANCE_ID = "00000000-0000-0000-0000-000000000555"
_ENROLL_ID = "00000000-0000-0000-0000-000000000666"
_TARGET_USER_ID_1 = "00000000-0000-0000-0000-000000000aaa"
_TARGET_USER_ID_2 = "00000000-0000-0000-0000-000000000bbb"


# ─── GET /{instance_id}/enrollments 列表 ────────────────────────


def test_list_enrollments_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_enrollment: object,
) -> None:
    e = make_enrollment()  # type: ignore[operator]
    setup_db_results([[(e, "学员A", "a@x.com")]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/enrollments")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["userName"] == "学员A"


def test_list_enrollments_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.get(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/enrollments"
    )
    assert r.status_code == 403


# ─── POST /{instance_id}/assign 单点指派 ────────────────────────


def test_assign_users_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
    mock_db: AsyncMock,
) -> None:
    """admin/counselor 单点指派 — 1 个全新用户 + 1 个已存在 → 1 created + 1 skipped."""
    inst = make_instance()  # type: ignore[operator]
    # FIFO: instance 查询; user1 dup query (None=新建); user2 dup query (existing)
    side: list[MagicMock] = []
    inst_m = MagicMock()
    inst_m.scalar_one_or_none = MagicMock(return_value=inst)
    inst_m.scalar = MagicMock(return_value=inst)
    inst_m.first = MagicMock(return_value=inst)
    side.append(inst_m)

    # user1 dup — None
    m1 = MagicMock()
    m1.scalar_one_or_none = MagicMock(return_value=None)
    m1.first = MagicMock(return_value=None)
    side.append(m1)

    # user2 dup — exists (返回 (id,))
    existing_id = uuid.UUID("00000000-0000-0000-0000-000000000999")
    m2 = MagicMock()
    m2.scalar_one_or_none = MagicMock(return_value=(existing_id,))
    m2.first = MagicMock(return_value=(existing_id,))
    side.append(m2)

    mock_db.execute = AsyncMock(side_effect=side)

    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/assign",
        json={"userIds": [_TARGET_USER_ID_1, _TARGET_USER_ID_2]},
    )
    assert r.status_code == 201
    body = r.json()
    assert len(body["results"]) == 2
    assert body["results"][0]["skipped"] is False
    assert body["results"][1]["skipped"] is True
    mock_db.commit.assert_awaited()


def test_assign_users_404_when_instance_missing(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/assign",
        json={"userIds": [_TARGET_USER_ID_1]},
    )
    assert r.status_code == 404


# ─── POST /{instance_id}/batch-enroll 批量班级 ────────────────


def test_batch_enroll_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
    mock_db: AsyncMock,
) -> None:
    """批量报名 — 单条都新建."""
    inst = make_instance()  # type: ignore[operator]
    # instance + 1 个 user dup (None)
    side: list[MagicMock] = []
    inst_m = MagicMock()
    inst_m.scalar_one_or_none = MagicMock(return_value=inst)
    inst_m.first = MagicMock(return_value=inst)
    side.append(inst_m)

    m1 = MagicMock()
    m1.scalar_one_or_none = MagicMock(return_value=None)
    m1.first = MagicMock(return_value=None)
    side.append(m1)

    mock_db.execute = AsyncMock(side_effect=side)

    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/batch-enroll",
        json={
            "userIds": [_TARGET_USER_ID_1],
            "groupLabel": "高一(3)班",
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["groupLabel"] == "高一(3)班"
    assert body["results"][0]["skipped"] is False


def test_batch_enroll_404_when_instance_missing(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/batch-enroll",
        json={"userIds": [_TARGET_USER_ID_1]},
    )
    assert r.status_code == 404


# ─── PATCH /enrollments/{id} 审批 ──────────────────────────────


def test_update_approval_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_enrollment: object,
    mock_db: AsyncMock,
) -> None:
    e = make_enrollment(approval_status="pending")  # type: ignore[operator]
    setup_db_results([e])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/enrollments/{_ENROLL_ID}",
        json={"approvalStatus": "approved"},
    )
    assert r.status_code == 200
    assert e.approval_status == "approved"
    mock_db.commit.assert_awaited()


def test_update_approval_400_when_invalid_status(
    admin_org_client: TestClient,
) -> None:
    """only 'approved' / 'rejected' 合法."""
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/enrollments/{_ENROLL_ID}",
        json={"approvalStatus": "weird"},
    )
    assert r.status_code == 400


def test_update_approval_404_when_missing(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/course-instances/{_INSTANCE_ID}/enrollments/{_ENROLL_ID}",
        json={"approvalStatus": "approved"},
    )
    assert r.status_code == 404
