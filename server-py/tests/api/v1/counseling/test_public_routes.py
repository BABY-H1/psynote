"""
Counseling public router tests — 镜像
``server/src/modules/counseling/counseling-public.routes.test.ts``。

Endpoints (2, 无 auth):
  GET  /api/public/counseling/{org_slug}/info
  POST /api/public/counseling/{org_slug}/register

⚠ 安全镜像 (W0.4 + W2.10):
  1. 仅暴露 settings.orgType=='counseling' 的机构 (404 不暴露 orgSlug 是否存在)
  2. 已存在用户必须 bcrypt.compare 验密码 (防接管)
  3. 已是成员 + 密码对 → 201 + 'registered' (不暴露 membership)
  4. 缺字段 / password<6 位 → 400
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.counseling.conftest import SetupDbResults


# ─── GET /{org_slug}/info ──────────────────────────────────────


def test_get_info_happy_returns_branding(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """合法 counseling org → 返 name/logo/themeColor."""
    setup_db_results(
        [
            (
                "00000000-0000-0000-0000-000000000099",
                "阳光心理咨询中心",
                "sunshine",
                {
                    "orgType": "counseling",
                    "branding": {"logoUrl": "/logo.png", "themeColor": "#0f766e"},
                },
            )
        ]
    )
    r = client.get("/api/public/counseling/sunshine/info")
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "阳光心理咨询中心"
    assert body["slug"] == "sunshine"
    assert body["logoUrl"] == "/logo.png"
    assert body["themeColor"] == "#0f766e"


def test_get_info_404_when_org_missing(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = client.get("/api/public/counseling/missing/info")
    assert r.status_code == 404


def test_get_info_404_when_not_counseling_type(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """orgType != 'counseling' → 404 (不越权暴露 school/enterprise)."""
    setup_db_results(
        [
            (
                "00000000-0000-0000-0000-000000000099",
                "学校",
                "school1",
                {"orgType": "school"},
            )
        ]
    )
    r = client.get("/api/public/counseling/school1/info")
    assert r.status_code == 404


# ─── POST /{org_slug}/register ────────────────────────────────


def test_register_404_when_org_missing(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = client.post(
        "/api/public/counseling/sunshine/register",
        json={"email": "c@x.com", "password": "secret123", "name": "张三"},
    )
    assert r.status_code == 404


def test_register_404_when_org_not_counseling(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """orgType=school → 404 (不越权)."""
    setup_db_results(
        [
            (
                "00000000-0000-0000-0000-000000000099",
                {"orgType": "school"},
            )
        ]
    )
    r = client.post(
        "/api/public/counseling/school1/register",
        json={"email": "c@x.com", "password": "secret123", "name": "张三"},
    )
    assert r.status_code == 404


def test_register_new_email_creates_user_and_member(
    client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """新邮箱 → 建 user + 加入 org_members(client) + clientProfile."""
    org_id = "00000000-0000-0000-0000-000000000099"
    setup_db_results(
        [
            (org_id, {"orgType": "counseling"}),  # org lookup
            None,  # user lookup → 不存在
            None,  # member lookup → 不存在
        ]
    )
    r = client.post(
        "/api/public/counseling/sunshine/register",
        json={
            "email": "new@x.com",
            "password": "secret123",
            "name": "张三",
            "phone": "13800138000",
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "registered"
    assert body["isNewUser"] is True
    assert isinstance(body["accessToken"], str)
    assert isinstance(body["refreshToken"], str)


def test_register_existing_user_correct_password(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """W0.4: 已存在用户 + 密码对 → 加入 org. bcrypt.compare 必须被调用."""
    import uuid

    org_id_uuid = uuid.UUID("00000000-0000-0000-0000-000000000099")
    user_id_uuid = uuid.UUID("00000000-0000-0000-0000-000000000010")
    setup_db_results(
        [
            (org_id_uuid, {"orgType": "counseling"}),
            (user_id_uuid, "e@x.com", False, "real-hash"),
            None,  # member 不存在
        ]
    )
    with patch(
        "app.api.v1.counseling.public_router.verify_password", return_value=True
    ) as mock_verify:
        r = client.post(
            "/api/public/counseling/sunshine/register",
            json={"email": "e@x.com", "password": "secret123", "name": "张三"},
        )
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "registered"
    assert body["isNewUser"] is False
    mock_verify.assert_called_once_with("secret123", "real-hash")


def test_register_existing_user_wrong_password_401(
    client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """W0.4 防接管: 已存在用户 + 密码错 → 401, 不发 token, 不补建 member."""
    import uuid

    org_id_uuid = uuid.UUID("00000000-0000-0000-0000-000000000099")
    user_id_uuid = uuid.UUID("00000000-0000-0000-0000-000000000010")
    setup_db_results(
        [
            (org_id_uuid, {"orgType": "counseling"}),
            (user_id_uuid, "e@x.com", False, "real-hash"),
        ]
    )
    with patch("app.api.v1.counseling.public_router.verify_password", return_value=False):
        r = client.post(
            "/api/public/counseling/sunshine/register",
            json={"email": "e@x.com", "password": "wrong-password", "name": "张三"},
        )
    assert r.status_code == 401
    body = r.json()
    assert "accessToken" not in body
    assert "refreshToken" not in body


def test_register_existing_user_no_password_hash_claim_flow(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """passwordHash 为空 → claim flow: 设新密码 + 加入 org. bcrypt.compare 不应被调用."""
    import uuid

    org_id_uuid = uuid.UUID("00000000-0000-0000-0000-000000000099")
    user_id_uuid = uuid.UUID("00000000-0000-0000-0000-000000000010")

    # claim flow 需要查 user 行 (做 password 设置), 然后查 member 是否存在
    from app.db.models.users import User

    user_orm = User()
    user_orm.id = user_id_uuid
    user_orm.email = "c@x.com"
    user_orm.is_system_admin = False
    user_orm.password_hash = None
    user_orm.name = "old"

    setup_db_results(
        [
            (org_id_uuid, {"orgType": "counseling"}),
            (user_id_uuid, "c@x.com", False, None),  # existing user, no hash
            user_orm,  # 二次查 user 行做 update
            None,  # member 不存在
        ]
    )
    with (
        patch(
            "app.api.v1.counseling.public_router.verify_password", return_value=False
        ) as mock_verify,
        patch(
            "app.api.v1.counseling.public_router.hash_password",
            return_value="new-hash",
        ),
    ):
        r = client.post(
            "/api/public/counseling/sunshine/register",
            json={"email": "c@x.com", "password": "newsecret", "name": "张三"},
        )
    assert r.status_code == 201
    assert r.json()["status"] == "registered"
    # bcrypt.compare 不应被调用 (无 passwordHash → 走 claim 不走验证)
    mock_verify.assert_not_called()
    # users 行应被设新密码
    assert user_orm.password_hash == "new-hash"


def test_register_existing_member_correct_password_w210(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """W2.10: 已是成员 + 密码对 → 201 + 'registered' (与 join 分支一致, 不暴露 membership)."""
    import uuid

    org_id_uuid = uuid.UUID("00000000-0000-0000-0000-000000000099")
    user_id_uuid = uuid.UUID("00000000-0000-0000-0000-000000000010")
    setup_db_results(
        [
            (org_id_uuid, {"orgType": "counseling"}),
            (user_id_uuid, "e@x.com", False, "real-hash"),
            (uuid.uuid4(),),  # member 已存在
        ]
    )
    with patch("app.api.v1.counseling.public_router.verify_password", return_value=True):
        r = client.post(
            "/api/public/counseling/sunshine/register",
            json={"email": "e@x.com", "password": "secret123", "name": "张三"},
        )
    # W2.10: 状态码 + status 字符串与 "未加入" 分支统一
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "registered"
    assert body["status"] != "already_registered"
    assert isinstance(body["accessToken"], str)


def test_register_missing_fields_400(client: TestClient) -> None:
    """缺 password 或 name → 400."""
    r = client.post(
        "/api/public/counseling/sunshine/register",
        json={"email": "c@x.com"},
    )
    assert r.status_code == 400


def test_register_short_password_400(client: TestClient) -> None:
    """密码 < 6 位 → 400."""
    # Need to provide org settings to pass first check
    r = client.post(
        "/api/public/counseling/sunshine/register",
        json={"email": "c@x.com", "password": "12345", "name": "张三"},
    )
    assert r.status_code == 400
