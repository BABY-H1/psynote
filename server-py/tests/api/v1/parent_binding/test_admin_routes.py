"""Admin (counselor / org_admin) parent invite token 管理测试.

镜像 parent-binding.routes.ts: GET / POST / DELETE 三 endpoint + RBAC."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.parent_binding.conftest import SetupDbResults

_ORG = "00000000-0000-0000-0000-000000000099"
_CLASS = "00000000-0000-0000-0000-000000000022"
_TOKEN_ID = "00000000-0000-0000-0000-000000000111"


def test_list_tokens_happy(
    counselor_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_token_row: object,
) -> None:
    rows = [make_token_row()]  # type: ignore[operator]
    setup_db_results([rows])
    r = counselor_org_client.get(f"/api/orgs/{_ORG}/school/classes/{_CLASS}/parent-invite-tokens/")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_create_token_happy(
    counselor_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """class 必须属于 org → 模拟 SchoolClass id 返回."""
    cls_id = uuid.UUID(_CLASS)
    setup_db_results([cls_id])  # SchoolClass.id 校验通过
    r = counselor_org_client.post(
        f"/api/orgs/{_ORG}/school/classes/{_CLASS}/parent-invite-tokens/",
        json={"expiresInDays": 14},
    )
    assert r.status_code == 201
    body = r.json()
    assert "token" in body
    assert body["classId"] == _CLASS
    mock_db.commit.assert_awaited()


def test_create_token_404_when_class_not_in_org(
    counselor_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])  # 无该班级
    r = counselor_org_client.post(
        f"/api/orgs/{_ORG}/school/classes/{_CLASS}/parent-invite-tokens/",
        json={},
    )
    assert r.status_code == 404


def test_revoke_token_happy(
    counselor_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_token_row: object,
) -> None:
    setup_db_results([make_token_row()])  # type: ignore[operator]
    r = counselor_org_client.delete(
        f"/api/orgs/{_ORG}/school/classes/{_CLASS}/parent-invite-tokens/{_TOKEN_ID}"
    )
    assert r.status_code == 200
    body = r.json()
    assert body["revokedAt"] is not None


def test_revoke_token_404_when_not_found(
    counselor_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = counselor_org_client.delete(
        f"/api/orgs/{_ORG}/school/classes/{_CLASS}/parent-invite-tokens/{_TOKEN_ID}"
    )
    assert r.status_code == 404


def test_admin_endpoints_reject_client_role(
    client_role_org_client: TestClient,
) -> None:
    """legacy role='client' 必须被拒 (counselor / org_admin only)."""
    r = client_role_org_client.get(
        f"/api/orgs/{_ORG}/school/classes/{_CLASS}/parent-invite-tokens/"
    )
    assert r.status_code == 403


def test_admin_endpoints_allow_org_admin(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_token_row: object,
) -> None:
    setup_db_results([[make_token_row()]])  # type: ignore[operator]
    r = admin_org_client.get(f"/api/orgs/{_ORG}/school/classes/{_CLASS}/parent-invite-tokens/")
    assert r.status_code == 200
