"""
Referral router tests — 镜像 ``server/src/modules/referral/referral.routes.ts``.

Endpoints (8):
  GET   /                         列表
  GET   /inbox                    receiver 收件箱
  GET   /{referralId}             详情
  GET   /{referralId}/data-package
  POST  /                         基础创建
  POST  /extended                 Phase 9δ 扩展创建
  POST  /{referralId}/respond     receiver decision
  PATCH /{referralId}             更新
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.referral.conftest import SetupDbResults

_ORG_ID = "00000000-0000-0000-0000-000000000099"
_REFERRAL_ID = "00000000-0000-0000-0000-000000000d01"
_EPISODE_ID = "00000000-0000-0000-0000-000000000111"
_CLIENT_ID = "00000000-0000-0000-0000-000000000010"


# ─── GET / 列表 ─────────────────────────────────────────────────


def test_list_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_referral: object,
) -> None:
    r = make_referral()  # type: ignore[operator]
    setup_db_results([[r]])
    resp = admin_org_client.get(f"/api/orgs/{_ORG_ID}/referrals/")
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body, list)
    assert body[0]["id"] == _REFERRAL_ID


def test_list_no_org_403(authed_client: TestClient) -> None:
    resp = authed_client.get(f"/api/orgs/{_ORG_ID}/referrals/")
    assert resp.status_code == 403


# ─── GET /inbox ────────────────────────────────────────────────


def test_inbox_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_referral: object,
) -> None:
    r = make_referral(status="consented", mode="platform")  # type: ignore[operator]
    setup_db_results([[r]])
    resp = admin_org_client.get(f"/api/orgs/{_ORG_ID}/referrals/inbox")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1


# ─── POST / 基础创建 ────────────────────────────────────────────


def test_create_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([])
    payload = {
        "careEpisodeId": _EPISODE_ID,
        "clientId": _CLIENT_ID,
        "reason": "需要精神科评估",
        "targetName": "三甲心理科",
    }
    resp = admin_org_client.post(f"/api/orgs/{_ORG_ID}/referrals/", json=payload)
    assert resp.status_code == 201
    body = resp.json()
    assert body["reason"] == "需要精神科评估"


def test_create_missing_reason_400(admin_org_client: TestClient) -> None:
    payload = {
        "careEpisodeId": _EPISODE_ID,
        "clientId": _CLIENT_ID,
        "reason": "",
    }
    resp = admin_org_client.post(f"/api/orgs/{_ORG_ID}/referrals/", json=payload)
    assert resp.status_code == 400  # error_handler maps 422 → 400


def test_create_403_when_client(client_role_org_client: TestClient) -> None:
    payload = {
        "careEpisodeId": _EPISODE_ID,
        "clientId": _CLIENT_ID,
        "reason": "X",
    }
    resp = client_role_org_client.post(f"/api/orgs/{_ORG_ID}/referrals/", json=payload)
    assert resp.status_code == 403


# ─── POST /extended ────────────────────────────────────────────


def test_create_extended_platform_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([])
    payload = {
        "careEpisodeId": _EPISODE_ID,
        "clientId": _CLIENT_ID,
        "reason": "已完成评估",
        "mode": "platform",
        "toCounselorId": "00000000-0000-0000-0000-00000000aaaa",
        "dataPackageSpec": {"sessionNoteIds": ["00000000-0000-0000-0000-00000000bbbb"]},
    }
    resp = admin_org_client.post(f"/api/orgs/{_ORG_ID}/referrals/extended", json=payload)
    assert resp.status_code == 201
    body = resp.json()
    assert body["mode"] == "platform"


def test_create_extended_invalid_mode(admin_org_client: TestClient) -> None:
    payload = {
        "careEpisodeId": _EPISODE_ID,
        "clientId": _CLIENT_ID,
        "reason": "X",
        "mode": "weird",
    }
    resp = admin_org_client.post(f"/api/orgs/{_ORG_ID}/referrals/extended", json=payload)
    assert resp.status_code == 400


def test_create_extended_platform_requires_counselor_or_org(
    admin_org_client: TestClient,
) -> None:
    payload = {
        "careEpisodeId": _EPISODE_ID,
        "clientId": _CLIENT_ID,
        "reason": "X",
        "mode": "platform",
    }
    resp = admin_org_client.post(f"/api/orgs/{_ORG_ID}/referrals/extended", json=payload)
    assert resp.status_code == 400


# ─── GET /{referral_id} 详情 ────────────────────────────────────


def test_get_referral_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_referral: object,
) -> None:
    r = make_referral()  # type: ignore[operator]
    setup_db_results([r])
    resp = admin_org_client.get(f"/api/orgs/{_ORG_ID}/referrals/{_REFERRAL_ID}")
    assert resp.status_code == 200
    assert resp.json()["id"] == _REFERRAL_ID


def test_get_referral_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    resp = admin_org_client.get(f"/api/orgs/{_ORG_ID}/referrals/{_REFERRAL_ID}")
    assert resp.status_code == 404


# ─── PATCH /{referral_id} ─────────────────────────────────────


def test_update_referral_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_referral: object,
) -> None:
    r = make_referral()  # type: ignore[operator]
    setup_db_results([r])
    resp = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/referrals/{_REFERRAL_ID}",
        json={"followUpNotes": "客户已就诊"},
    )
    assert resp.status_code == 200
    assert r.follow_up_notes == "客户已就诊"


def test_update_referral_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    resp = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/referrals/{_REFERRAL_ID}",
        json={"followUpNotes": "x"},
    )
    assert resp.status_code == 404


# ─── POST /{referral_id}/respond ──────────────────────────────


def test_respond_accept_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_referral: object,
) -> None:
    r = make_referral(status="consented")  # type: ignore[operator]
    setup_db_results([r])
    resp = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/referrals/{_REFERRAL_ID}/respond",
        json={"decision": "accept"},
    )
    assert resp.status_code == 200
    assert r.status == "accepted"


def test_respond_reject_with_reason(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_referral: object,
) -> None:
    r = make_referral(status="consented")  # type: ignore[operator]
    setup_db_results([r])
    resp = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/referrals/{_REFERRAL_ID}/respond",
        json={"decision": "reject", "reason": "排期已满"},
    )
    assert resp.status_code == 200
    assert r.status == "rejected"
    assert r.rejection_reason == "排期已满"


def test_respond_invalid_decision(admin_org_client: TestClient) -> None:
    resp = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/referrals/{_REFERRAL_ID}/respond",
        json={"decision": "weird"},
    )
    assert resp.status_code == 400
