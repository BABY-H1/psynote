"""
Consent router tests — 镜像 ``server/src/modules/compliance/consent.routes.ts`` +
``consent.service.ts``.

Endpoints (7):
  Templates:
    GET    /consent-templates
    POST   /consent-templates
    PATCH  /consent-templates/{id}
    DELETE /consent-templates/{id}

  Documents:
    POST   /consent-documents
    GET    /consent-documents
    GET    /consent-documents/{id}

Phase 14 代签流程 (signer_on_behalf_of) 通过 service helper ``sign_document``
单独测 (无 HTTP endpoint 走 client_portal).
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.compliance.conftest import SetupDbResults

_ORG_ID = "00000000-0000-0000-0000-000000000099"
_TEMPLATE_ID = "00000000-0000-0000-0000-000000000e01"
_DOC_ID = "00000000-0000-0000-0000-000000000e02"
_CLIENT_ID = "00000000-0000-0000-0000-000000000010"
_USER_UUID = uuid.UUID("00000000-0000-0000-0000-000000000001")
_GUARDIAN_UUID = uuid.UUID("00000000-0000-0000-0000-00000000aabb")
_CLIENT_UUID = uuid.UUID(_CLIENT_ID)


# ─── Templates ─────────────────────────────────────────────────


def test_list_templates_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_consent_template: object,
) -> None:
    t = make_consent_template()  # type: ignore[operator]
    setup_db_results([[t]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/consent-templates")
    assert r.status_code == 200
    body = r.json()
    assert body[0]["id"] == _TEMPLATE_ID


def test_create_template_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([])
    payload = {
        "title": "数据收集同意书",
        "consentType": "data_collection",
        "content": "本同意书...",
    }
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/consent-templates", json=payload)
    assert r.status_code == 201
    assert r.json()["title"] == "数据收集同意书"


def test_create_template_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG_ID}/consent-templates",
        json={"title": "X", "consentType": "X", "content": "X"},
    )
    assert r.status_code == 403


def test_update_template_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_consent_template: object,
) -> None:
    t = make_consent_template()  # type: ignore[operator]
    setup_db_results([t])  # ownership check
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/consent-templates/{_TEMPLATE_ID}",
        json={"title": "改标题"},
    )
    assert r.status_code == 200
    assert t.title == "改标题"


def test_update_template_404_when_not_owned(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])  # 找不到 = 不归本机构 = 404
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/consent-templates/{_TEMPLATE_ID}",
        json={"title": "X"},
    )
    assert r.status_code == 404


def test_delete_template_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_consent_template: object,
) -> None:
    t = make_consent_template()  # type: ignore[operator]
    setup_db_results([t])
    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/consent-templates/{_TEMPLATE_ID}")
    assert r.status_code == 200
    assert r.json()["success"] is True


# ─── Documents ─────────────────────────────────────────────────


def test_send_document_happy_client_recipient(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_consent_template: object,
) -> None:
    """默认 recipient_type='client' → status='pending'."""
    template = make_consent_template()  # type: ignore[operator]
    setup_db_results([template])  # template select
    payload = {
        "clientId": _CLIENT_ID,
        "templateId": _TEMPLATE_ID,
    }
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/consent-documents", json=payload)
    assert r.status_code == 201
    body = r.json()
    assert body["recipientType"] == "client"
    assert body["status"] == "pending"


def test_send_document_guardian_requires_recipient_name(
    admin_org_client: TestClient,
) -> None:
    """recipient_type='guardian' 必须有 recipient_name."""
    payload = {
        "clientId": _CLIENT_ID,
        "templateId": _TEMPLATE_ID,
        "recipientType": "guardian",
    }
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/consent-documents", json=payload)
    assert r.status_code == 400


def test_send_document_invalid_recipient_type(admin_org_client: TestClient) -> None:
    payload = {
        "clientId": _CLIENT_ID,
        "templateId": _TEMPLATE_ID,
        "recipientType": "weird",
    }
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/consent-documents", json=payload)
    assert r.status_code == 400


def test_send_document_guardian_status_issued(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_consent_template: object,
) -> None:
    """guardian recipient → status='issued' (无 portal 签署流, 线下交付)."""
    template = make_consent_template()  # type: ignore[operator]
    setup_db_results([template])
    payload = {
        "clientId": _CLIENT_ID,
        "templateId": _TEMPLATE_ID,
        "recipientType": "guardian",
        "recipientName": "母亲 王某",
    }
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/consent-documents", json=payload)
    assert r.status_code == 201
    body = r.json()
    assert body["recipientType"] == "guardian"
    assert body["status"] == "issued"
    assert body["recipientName"] == "母亲 王某"


def test_list_documents_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_client_doc: object,
) -> None:
    doc = make_client_doc()  # type: ignore[operator]
    setup_db_results([[doc]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/consent-documents")
    assert r.status_code == 200
    assert r.json()[0]["id"] == _DOC_ID


def test_get_document_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_client_doc: object,
) -> None:
    doc = make_client_doc()  # type: ignore[operator]
    setup_db_results([doc])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/consent-documents/{_DOC_ID}")
    assert r.status_code == 200
    assert r.json()["id"] == _DOC_ID


def test_get_document_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/consent-documents/{_DOC_ID}")
    assert r.status_code == 404


# ─── sign_document service helper (Phase 14 代签) ──────────────


def _make_result(row: Any) -> MagicMock:
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=row)
    result.scalar = MagicMock(return_value=row)
    return result


def _mock_db(rows: list[Any]) -> AsyncMock:
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.flush = AsyncMock()
    db.execute = AsyncMock(side_effect=[_make_result(r) for r in rows])
    return db


async def test_sign_document_self_signed(make_client_doc: Any) -> None:
    """来访者自签 — signer_on_behalf_of=None, signature_data 不含此键."""
    from app.api.v1.compliance.consent_router import sign_document

    doc = make_client_doc(
        care_episode_id=uuid.UUID("00000000-0000-0000-0000-000000000111"),
        consent_type="treatment",
    )
    db = _mock_db([doc])

    await sign_document(
        db,
        doc_id=doc.id,
        client_id=_CLIENT_UUID,
        name="张三",
        ip="127.0.0.1",
    )
    assert doc.status == "signed"
    assert doc.signed_at is not None
    assert doc.signature_data is not None
    assert "signerOnBehalfOf" not in doc.signature_data
    # consent_records + care_timeline 应该都 add 了
    assert db.add.call_count >= 2


async def test_sign_document_guardian_proxy(make_client_doc: Any) -> None:
    """Phase 14: 家长代签 — signature_data + consent_record 都记 signer_on_behalf_of."""
    from app.api.v1.compliance.consent_router import sign_document

    doc = make_client_doc(
        care_episode_id=uuid.UUID("00000000-0000-0000-0000-000000000111"),
        consent_type="treatment",
    )
    db = _mock_db([doc])

    await sign_document(
        db,
        doc_id=doc.id,
        client_id=_CLIENT_UUID,
        name="王女士 (母亲)",
        signer_on_behalf_of=_GUARDIAN_UUID,
    )
    assert doc.status == "signed"
    # 关键: signature_data 含 signerOnBehalfOf
    assert doc.signature_data["signerOnBehalfOf"] == str(_GUARDIAN_UUID)


async def test_sign_document_already_signed_blocks(make_client_doc: Any) -> None:
    """已 signed 的 doc → ValidationError, 不重复签."""
    from app.api.v1.compliance.consent_router import sign_document
    from app.lib.errors import ValidationError

    doc = make_client_doc(status="signed")
    db = _mock_db([doc])
    with pytest.raises(ValidationError, match="already processed"):
        await sign_document(db, doc_id=doc.id, client_id=_CLIENT_UUID, name="X")


async def test_sign_document_wrong_client_blocks(make_client_doc: Any) -> None:
    """不能代别的来访者签 — ValidationError."""
    from app.api.v1.compliance.consent_router import sign_document
    from app.lib.errors import ValidationError

    doc = make_client_doc()
    db = _mock_db([doc])
    other = uuid.UUID("00000000-0000-0000-0000-00000000ffff")
    with pytest.raises(ValidationError, match="Unauthorized"):
        await sign_document(db, doc_id=doc.id, client_id=other, name="X")


async def test_sign_document_404_when_doc_missing() -> None:
    from app.api.v1.compliance.consent_router import sign_document
    from app.lib.errors import NotFoundError

    db = _mock_db([None])
    with pytest.raises(NotFoundError):
        await sign_document(db, doc_id=uuid.UUID(_DOC_ID), client_id=_CLIENT_UUID, name="X")
