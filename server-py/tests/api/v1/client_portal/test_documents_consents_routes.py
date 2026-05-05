"""Documents + consents + referrals 测试.

Phase 14:
  - documents / consents 接受 ?as= (代签 OK)
  - referrals + /consent 拒绝 ?as= (家长不能代孩子做转介决定)
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.client_portal.conftest import SetupDbResults

_ORG = "00000000-0000-0000-0000-000000000099"
_DOC = "00000000-0000-0000-0000-000000000666"
_CONSENT = "00000000-0000-0000-0000-000000000777"
_REF = "00000000-0000-0000-0000-000000000888"
_CHILD = "00000000-0000-0000-0000-000000000002"


def test_list_documents_self_only(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_document: object,
) -> None:
    docs = [make_document()]  # type: ignore[operator]
    setup_db_results([docs])
    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/documents")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_get_document_unauthorized_when_not_owned(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_document: object,
) -> None:
    """ownership 不匹配 → 400 (Node 行为: ValidationError 'Unauthorized')."""
    other = make_document(client_id=uuid.UUID("00000000-0000-0000-0000-0000000000bb"))  # type: ignore[operator]
    setup_db_results([other])
    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/documents/{_DOC}")
    assert r.status_code == 400


def test_sign_document_records_signer_on_behalf_of_when_viewing_as(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_relationship: object,
    make_document: object,
    child_user_id: str,
) -> None:
    """监护人代签: signature_data.signerOnBehalfOf 必须 == caller."""
    rel = make_relationship()  # type: ignore[operator]
    # ownership 是 child
    doc = make_document(client_id=uuid.UUID(child_user_id))  # type: ignore[operator]
    setup_db_results([rel, doc])
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG}/client/documents/{_DOC}/sign?as={child_user_id}",
        json={"name": "家长代签"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "signed"
    assert body["signatureData"]["signerOnBehalfOf"] is not None


def test_list_consents_self_only(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_consent: object,
) -> None:
    rows = [make_consent()]  # type: ignore[operator]
    setup_db_results([rows])
    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/consents")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_revoke_consent_happy(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_consent: object,
) -> None:
    setup_db_results([make_consent()])  # type: ignore[operator]
    r = client_role_org_client.post(f"/api/orgs/{_ORG}/client/consents/{_CONSENT}/revoke")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "revoked"


def test_referrals_rejects_as_param(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/referrals?as={_CHILD}")
    assert r.status_code == 403


def test_referral_consent_happy(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_referral: object,
) -> None:
    setup_db_results([make_referral()])  # type: ignore[operator]
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG}/client/referrals/{_REF}/consent",
        json={"consent": True},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "consented"


def test_referral_consent_rejects_as_param(
    client_role_org_client: TestClient,
) -> None:
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG}/client/referrals/{_REF}/consent?as={_CHILD}",
        json={"consent": True},
    )
    assert r.status_code == 403
