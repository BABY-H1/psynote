"""GET /counselors 测试 — 主咨询师顶置 + guardian-readable."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.client_portal.conftest import SetupDbResults

_ORG = "00000000-0000-0000-0000-000000000099"


def test_list_counselors_marks_my_primary_first(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """主咨询师顶置: a 是 b 后面但成 my counselor 后被顶到前."""
    a_id = uuid.UUID("00000000-0000-0000-0000-0000000000a1")
    b_id = uuid.UUID("00000000-0000-0000-0000-0000000000a2")
    rows = [
        (a_id, "AAA", None, ["焦虑"], "bio-a"),
        (b_id, "BBB", None, [], None),
    ]
    setup_db_results([rows, b_id])  # counselors + my primary = b
    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/counselors")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 2
    # b 顶置 (主咨询师)
    assert body[0]["id"] == str(b_id)
    assert body[0]["isMyCounselor"] is True
    assert body[1]["isMyCounselor"] is False


def test_list_counselors_no_primary_keeps_original_order(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    from typing import Any

    a_id = uuid.UUID("00000000-0000-0000-0000-0000000000a1")
    b_id = uuid.UUID("00000000-0000-0000-0000-0000000000a2")
    rows: list[Any] = [
        (a_id, "AAA", None, [], None),
        (b_id, "BBB", None, [], None),
    ]
    setup_db_results([rows, None])
    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/counselors")
    assert r.status_code == 200
    body = r.json()
    assert body[0]["id"] == str(a_id)
    assert all(c["isMyCounselor"] is False for c in body)
