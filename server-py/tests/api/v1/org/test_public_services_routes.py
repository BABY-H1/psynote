"""
Public services + intake routes — 镜像 ``public-services.routes.ts``.

Phase 3 smoke tests:
  - GET  /api/public/orgs/{slug}/services       — 公开 (no auth) 列表
  - POST /api/public/orgs/{slug}/services/intake — 公开提交 intake (transactional)
  - GET  /api/orgs/{org_id}/service-intakes/    — 已认证 admin 列待处理
  - POST /api/orgs/{org_id}/service-intakes/{intake_id}/assign — 分配
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.org.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"
_INTAKE_ID = "00000000-0000-0000-0000-000000000300"


# ─── GET /api/public/orgs/{slug}/services ───────────────────────


def test_public_services_unknown_slug(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """unknown slug → 200 + 空列表 (Node 行为, 防 enumeration)."""
    setup_db_results([None])
    r = client.get("/api/public/orgs/ghost/services")
    assert r.status_code == 200
    assert r.json() == {"orgId": None, "orgName": "", "services": []}


def test_public_services_active_only(
    client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
) -> None:
    """org.settings.publicServices 中 isActive 才返回."""
    org = make_org(  # type: ignore[operator]
        slug="testorg",
        settings={
            "publicServices": [
                {
                    "id": "s1",
                    "title": "Active",
                    "description": "desc",
                    "sessionFormat": "individual",
                    "isActive": True,
                },
                {
                    "id": "s2",
                    "title": "Inactive",
                    "description": "x",
                    "sessionFormat": "individual",
                    "isActive": False,
                },
            ]
        },
    )
    setup_db_results([org])
    r = client.get("/api/public/orgs/testorg/services")
    assert r.status_code == 200
    body = r.json()
    assert body["orgName"] == "Test Org"
    assert len(body["services"]) == 1
    assert body["services"][0]["title"] == "Active"


# ─── POST /api/public/orgs/{slug}/services/intake (transactional) ─


def test_public_intake_creates_user_and_intake(
    client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
    mock_db: AsyncMock,
) -> None:
    """Transactional 端点: org found → user 不存在 (建) → 没 member (建) →
    counselor 列表 [] → no auto-assign → 通知 admin 列表 [] → commit.

    Phase 5: 重点 — phone 必填且写入 user.phone.
    """
    org = make_org()  # type: ignore[operator]
    setup_db_results(
        [
            org,  # org by slug
            None,  # user lookup (by phone)
            None,  # member dup check
            [],  # counselors list (empty → no auto-assign)
            [],  # admin list (empty)
        ]
    )
    r = client.post(
        "/api/public/orgs/test-org/services/intake",
        json={
            "serviceId": "svc-1",
            "name": "李同学",
            "phone": "13800000000",
            "email": "li@example.com",  # 可选
            "chiefComplaint": "近期失眠",
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "pending"
    assert body["assignedCounselorId"] is None
    mock_db.commit.assert_awaited_once()

    # Phase 5: 写到 user.phone, 而非合成
    from app.db.models.users import User

    user_added: User | None = None
    for call in mock_db.add.call_args_list:
        obj = call.args[0]
        if isinstance(obj, User):
            user_added = obj
            break
    assert user_added is not None
    assert user_added.phone == "13800000000"


def test_public_intake_phone_required_no_email(
    client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
) -> None:
    """Phase 5: email 可选, 只传 phone 也成."""
    org = make_org()  # type: ignore[operator]
    setup_db_results([org, None, None, [], []])
    r = client.post(
        "/api/public/orgs/test-org/services/intake",
        json={
            "serviceId": "svc-1",
            "name": "李同学",
            "phone": "13900001111",
        },
    )
    assert r.status_code == 201


def test_public_intake_missing_phone_400(
    client: TestClient,
) -> None:
    """Phase 5: phone 必填, 缺则 422."""
    r = client.post(
        "/api/public/orgs/test-org/services/intake",
        json={
            "serviceId": "svc-1",
            "name": "李同学",
            "email": "li@example.com",
        },
    )
    assert r.status_code in (400, 422)


def test_public_intake_invalid_phone_400(client: TestClient) -> None:
    """Phase 5: phone 不合法 (10 位 / 字母 / 12x 起头) → 422."""
    r = client.post(
        "/api/public/orgs/test-org/services/intake",
        json={
            "serviceId": "svc-1",
            "name": "李同学",
            "phone": "12345",
        },
    )
    assert r.status_code in (400, 422)


def test_public_intake_404_unknown_slug(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = client.post(
        "/api/public/orgs/ghost/services/intake",
        json={"serviceId": "x", "name": "x", "phone": "13800000000"},
    )
    assert r.status_code == 404


# ─── GET /api/orgs/{id}/service-intakes/ ────────────────────────


def test_list_intakes_admin_only(counselor_org_client: TestClient) -> None:
    """非 admin role → 403."""
    r = counselor_org_client.get(f"/api/orgs/{_ORG_ID}/service-intakes/")
    assert r.status_code == 403


def test_list_intakes_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """admin → 200 + 含 client name/email join."""
    from app.db.models.service_intakes import ServiceIntake

    intake = ServiceIntake()
    intake.id = uuid.UUID(_INTAKE_ID)
    intake.org_id = uuid.UUID(_ORG_ID)
    intake.service_id = "svc-1"
    intake.client_user_id = uuid.UUID("00000000-0000-0000-0000-000000000200")
    intake.preferred_counselor_id = None
    intake.intake_source = "org_portal"
    intake.intake_data = {}
    intake.status = "pending"
    intake.assigned_counselor_id = None
    intake.assigned_at = None

    setup_db_results([[(intake, "李同学", "li@example.com")]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/service-intakes/")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["clientName"] == "李同学"
    assert body[0]["clientEmail"] == "li@example.com"


# ─── POST .../service-intakes/{intake_id}/assign ────────────────


def test_assign_intake_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    from app.db.models.service_intakes import ServiceIntake

    intake = ServiceIntake()
    intake.id = uuid.UUID(_INTAKE_ID)
    intake.org_id = uuid.UUID(_ORG_ID)
    intake.service_id = "x"
    intake.client_user_id = uuid.UUID("00000000-0000-0000-0000-000000000200")
    intake.status = "pending"
    intake.assigned_counselor_id = None
    intake.assigned_at = None
    intake.intake_data = {}
    intake.intake_source = "org_portal"
    intake.preferred_counselor_id = None

    # 1) intake fetch, 2) client_assignment dup check
    setup_db_results([intake, None])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/service-intakes/{_INTAKE_ID}/assign",
        json={"counselorId": "00000000-0000-0000-0000-000000000400"},
    )
    assert r.status_code == 200
    assert r.json() == {"success": True}
    assert intake.status == "assigned"
    mock_db.commit.assert_awaited()


def test_assign_intake_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/service-intakes/{_INTAKE_ID}/assign",
        json={"counselorId": "00000000-0000-0000-0000-000000000400"},
    )
    assert r.status_code == 404
