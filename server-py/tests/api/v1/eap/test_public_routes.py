"""
EAP Public routes tests — 镜像 ``server/src/modules/eap/eap-public.routes.test.ts`` (213 行).

W0.4 安全审计 (2026-05-03): 已存在用户必须验密码 (防 takeover).
W2.10 (security audit 2026-05-03): "已是成员" 与"加入"分支响应一致 (防 email enumeration).

完整覆盖 Node 测试 5 个 cases + GET /info 路径:
  - 新邮箱 → 建 user + member + profile (新建时 password_hash 是真实 hash, 不是 fake UUID)
  - 已存在 + 有 hash + 密码对 + 未加入 → 201
  - 已存在 + 有 hash + 密码错 → 401, 不附加 member / profile
  - 已存在 + 无 hash → claim flow: 设密码 + 加入
  - 已存在 + 已是成员 + 密码对 → 201 'registered' (W2.10 与"加入"分支响应一致)
  - 已存在 + 已是成员 + 密码错 → 401
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.eap.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"
_SLUG = "acme"
_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000010")


# ─── GET /:org_slug/info ────────────────────────────────────────


def test_info_happy(
    client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
) -> None:
    """info 含 logo / theme / departments."""
    org = make_org(  # type: ignore[operator]
        slug=_SLUG,
        plan="premium",
        settings={
            "orgType": "enterprise",
            "branding": {"logoUrl": "https://x.com/l.png", "themeColor": "#abcdef"},
            "eapConfig": {
                "departments": [
                    {"id": "d1", "name": "技术部"},
                    {"id": "d2", "name": "财务部"},
                ],
            },
        },
    )
    setup_db_results([org])
    r = client.get(f"/api/public/eap/{_SLUG}/info")
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Test Org"
    assert body["logoUrl"] == "https://x.com/l.png"
    assert len(body["departments"]) == 2


def test_info_org_not_found_404(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = client.get(f"/api/public/eap/{_SLUG}/info")
    assert r.status_code == 404


def test_info_non_enterprise_org_404(
    client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
) -> None:
    """非 enterprise org → 统一 404 (防 enumeration)."""
    org = make_org(  # type: ignore[operator]
        plan="free",  # starter tier
        settings={"orgType": "counseling"},  # 非 enterprise → 无 'eap' feature
    )
    setup_db_results([org])
    r = client.get(f"/api/public/eap/{_SLUG}/info")
    assert r.status_code == 404


# ─── POST /:org_slug/register ───────────────────────────────────


def test_register_new_email_creates_user_member_profile(
    client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
    make_org: object,
) -> None:
    """新邮箱 → 建 user + member(client) + employee_profile, password_hash=真 bcrypt hash."""
    org = make_org()  # type: ignore[operator]
    # 1) org lookup; 2) user lookup (None — 新邮箱); 3) member lookup (None)
    setup_db_results([org, None, None])
    r = client.post(
        f"/api/public/eap/{_SLUG}/register",
        json={"email": "emp@acme.com", "password": "secret123", "name": "员工"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "registered"
    assert body["isNewUser"] is True
    mock_db.commit.assert_awaited()


def test_register_existing_user_correct_password_201(
    client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
    make_user_row: object,
) -> None:
    """⭐ W0.4: 已存在 + 有 hash + 密码对 → 201 (使用 bcrypt 真实 hash 验证)."""
    from app.core.security import hash_password

    org = make_org()  # type: ignore[operator]
    real_hash = hash_password("secret123")
    existing = make_user_row(  # type: ignore[operator]
        user_id=_USER_ID, email="e@a.com", password_hash=real_hash
    )
    # 1) org; 2) existing user; 3) member None (未加入)
    setup_db_results([org, existing, None])
    r = client.post(
        f"/api/public/eap/{_SLUG}/register",
        json={"email": "e@a.com", "password": "secret123", "name": "员工"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["isNewUser"] is False
    assert body["status"] == "registered"


def test_register_existing_user_wrong_password_401(
    client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
    make_org: object,
    make_user_row: object,
) -> None:
    """⭐ W0.4: 已存在 + 有 hash + 密码错 → 401, 不附加成员关系."""
    from app.core.security import hash_password

    org = make_org()  # type: ignore[operator]
    real_hash = hash_password("real-correct")
    existing = make_user_row(  # type: ignore[operator]
        user_id=_USER_ID, email="e@a.com", password_hash=real_hash
    )
    # 1) org; 2) existing user (密码错时不查 member)
    setup_db_results([org, existing])
    r = client.post(
        f"/api/public/eap/{_SLUG}/register",
        json={"email": "e@a.com", "password": "wrong-password", "name": "员工"},
    )
    assert r.status_code == 401
    # rollback 调用 — 不能 commit
    mock_db.commit.assert_not_awaited()
    mock_db.rollback.assert_awaited()


def test_register_existing_user_no_hash_claim_flow_201(
    client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
    make_org: object,
    make_user_row: object,
) -> None:
    """⭐ W0.4: 已存在 + 无 hash → claim flow: 设密码 + 加入."""
    org = make_org()  # type: ignore[operator]
    # password_hash=None → 走 claim 分支
    existing = make_user_row(  # type: ignore[operator]
        user_id=_USER_ID, email="c@a.com", password_hash=None
    )
    setup_db_results([org, existing, None])
    r = client.post(
        f"/api/public/eap/{_SLUG}/register",
        json={"email": "c@a.com", "password": "newpass1", "name": "员工"},
    )
    assert r.status_code == 201
    # password_hash 已被设置 (存在 user 上)
    assert existing.password_hash is not None
    mock_db.commit.assert_awaited()


def test_register_existing_member_correct_password_201_unified_response(
    client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
    make_user_row: object,
) -> None:
    """⭐ W2.10: 已是成员 + 密码对 → 201 status='registered' (与新加入一致, 防 enumeration)."""
    from app.core.security import hash_password

    org = make_org()  # type: ignore[operator]
    real_hash = hash_password("ok-password")
    existing = make_user_row(  # type: ignore[operator]
        user_id=_USER_ID, email="e@a.com", password_hash=real_hash
    )
    # 1) org; 2) existing user; 3) member already exists (membership lookup hits)
    setup_db_results([org, existing, uuid.uuid4()])
    r = client.post(
        f"/api/public/eap/{_SLUG}/register",
        json={"email": "e@a.com", "password": "ok-password", "name": "员工"},
    )
    # 与新加入分支响应完全一致
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "registered"
    assert body["status"] != "already_registered"  # 不能暴露 "已存在" 信息
    assert body["isNewUser"] is False


def test_register_existing_member_wrong_password_401(
    client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
    make_user_row: object,
) -> None:
    """已是成员 + 密码错 → 401 (即使是已成员, 也不能用错密码绕过, 防接管)."""
    from app.core.security import hash_password

    org = make_org()  # type: ignore[operator]
    real_hash = hash_password("ok-password")
    existing = make_user_row(  # type: ignore[operator]
        user_id=_USER_ID, email="e@a.com", password_hash=real_hash
    )
    setup_db_results([org, existing])
    r = client.post(
        f"/api/public/eap/{_SLUG}/register",
        json={"email": "e@a.com", "password": "wrong-pw", "name": "员工"},
    )
    assert r.status_code == 401


def test_register_short_password_400(
    client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
) -> None:
    """密码 < 6 位 → 400."""
    org = make_org()  # type: ignore[operator]
    setup_db_results([org])
    r = client.post(
        f"/api/public/eap/{_SLUG}/register",
        json={"email": "x@y.com", "password": "abc", "name": "短"},
    )
    assert r.status_code == 400


def test_register_org_not_found_404(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = client.post(
        f"/api/public/eap/{_SLUG}/register",
        json={"email": "x@y.com", "password": "secret123", "name": "x"},
    )
    assert r.status_code == 404
