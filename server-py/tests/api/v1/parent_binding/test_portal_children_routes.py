"""家长 portal "我的孩子" 测试.

镜像 portal-children.routes.ts:
  GET    /         列我持有 active 关系
  DELETE /{rel_id} 解除关系 (status='revoked', revoked_at=now)
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.parent_binding.conftest import SetupDbResults

_ORG = "00000000-0000-0000-0000-000000000099"
_REL = "00000000-0000-0000-0000-000000000222"


def test_list_my_children_returns_active_relations(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    from datetime import UTC, datetime

    rel_id = uuid.UUID(_REL)
    child_id = uuid.UUID("00000000-0000-0000-0000-000000000003")
    rows = [
        (
            rel_id,
            child_id,
            "孩子甲",
            "father",
            "active",
            datetime(2026, 5, 1, tzinfo=UTC),
        )
    ]
    setup_db_results([rows])
    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/children/")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["childUserId"] == str(child_id)
    assert body[0]["relation"] == "father"
    assert body[0]["status"] == "active"


def test_list_my_children_empty(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([[]])
    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/children/")
    assert r.status_code == 200
    assert r.json() == []


def test_revoke_relationship_happy(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_relationship: object,
) -> None:
    setup_db_results([make_relationship()])  # type: ignore[operator]
    r = client_role_org_client.delete(f"/api/orgs/{_ORG}/client/children/{_REL}")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "revoked"


def test_revoke_relationship_404_when_not_found(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = client_role_org_client.delete(f"/api/orgs/{_ORG}/client/children/{_REL}")
    assert r.status_code == 404


def test_revoke_relationship_404_when_not_my_relation(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_relationship: object,
) -> None:
    """不是我持有的关系 → 当成 NotFound (防 enum)."""
    other_holder = uuid.UUID("00000000-0000-0000-0000-000000000777")
    rel = make_relationship(holder=other_holder)  # type: ignore[operator]
    setup_db_results([rel])
    r = client_role_org_client.delete(f"/api/orgs/{_ORG}/client/children/{_REL}")
    assert r.status_code == 404


def test_revoke_relationship_idempotent_when_already_revoked(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_relationship: object,
) -> None:
    """已 revoked 的关系: 直接返回当前状态 (idempotent)."""
    rel = make_relationship(status_="revoked")  # type: ignore[operator]
    setup_db_results([rel])
    r = client_role_org_client.delete(f"/api/orgs/{_ORG}/client/children/{_REL}")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "revoked"
