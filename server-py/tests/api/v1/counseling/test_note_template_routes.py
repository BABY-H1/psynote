"""
Note template router tests — 镜像 ``server/src/modules/counseling/note-template.routes.ts``。

Endpoints (4):
  GET    /                 — list (含内置 SOAP/DAP/BIRP)
  POST   /                 — create custom
  PATCH  /{template_id}    — update (ownership check)
  DELETE /{template_id}    — delete (ownership check)
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.counseling.conftest import SetupDbResults

_ORG_ID = "00000000-0000-0000-0000-000000000099"
_TEMPLATE_ID = "00000000-0000-0000-0000-000000000555"


# ─── GET / 列表 ──────────────────────────────────────────────────


def test_list_templates_includes_builtin(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """无自定义时也至少返回 3 个内置 (SOAP/DAP/BIRP)."""
    setup_db_results([[]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/note-templates/")
    assert r.status_code == 200
    body = r.json()
    assert len(body) >= 3
    builtin_ids = {b["id"] for b in body if b["id"].startswith("__")}
    assert "__soap__" in builtin_ids
    assert "__dap__" in builtin_ids
    assert "__birp__" in builtin_ids


def test_list_templates_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.get(f"/api/orgs/{_ORG_ID}/note-templates/")
    assert r.status_code == 403


# ─── POST / 创建 ────────────────────────────────────────────────


def test_create_template_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    setup_db_results([])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/note-templates/",
        json={
            "title": "我的模板",
            "format": "custom",
            "fieldDefinitions": [{"key": "x", "label": "X"}],
        },
    )
    assert r.status_code == 201
    mock_db.commit.assert_awaited()


def test_create_template_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG_ID}/note-templates/",
        json={
            "title": "x",
            "format": "custom",
            "fieldDefinitions": [{"key": "x", "label": "X"}],
        },
    )
    assert r.status_code == 403


# ─── PATCH /{template_id} ──────────────────────────────────────


def test_update_template_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_note_template: object,
) -> None:
    t = make_note_template(title="旧")  # type: ignore[operator]
    # _assert_template_owned_by_org → 1 SELECT (org_id 元组), 然后主查 1
    setup_db_results([(t.org_id,), t])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/note-templates/{_TEMPLATE_ID}",
        json={"title": "新"},
    )
    assert r.status_code == 200
    assert t.title == "新"


def test_update_template_403_other_org(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """模板属于别的 org → 403."""
    other_org = uuid.UUID("00000000-0000-0000-0000-000000000abc")
    setup_db_results([(other_org,)])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/note-templates/{_TEMPLATE_ID}",
        json={"title": "x"},
    )
    assert r.status_code == 403


# ─── DELETE /{template_id} ─────────────────────────────────────


def test_delete_template_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_note_template: object,
    mock_db: AsyncMock,
) -> None:
    t = make_note_template()  # type: ignore[operator]
    setup_db_results([(t.org_id,), t, None])
    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/note-templates/{_TEMPLATE_ID}")
    assert r.status_code == 200
    assert r.json()["success"] is True
    mock_db.commit.assert_awaited()


def test_delete_template_404_not_found(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])  # ownership check 找不到
    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/note-templates/{_TEMPLATE_ID}")
    assert r.status_code == 404
