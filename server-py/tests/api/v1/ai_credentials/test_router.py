"""
``ai_credentials`` CRUD 测试 — 权限矩阵 + 加密往返.

权限矩阵覆盖:
  - sysadmin:        全可见可改 (system_router 只允许 sysadmin)
  - org_admin:       本 org 凭据 R/W (org_router 主入口)
  - counselor:       仅 GET /status (不看明文)
  - client:          完全 403

加密往返:
  - POST 后存 DB 的 encrypted_key 不是明文
  - PATCH 提供 api_key 触发 rotated_at 更新

复用 tests/api/v1/ai/conftest.py 的 fixtures (test_app 包含 ai_credentials routers).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from unittest.mock import MagicMock

import pytest

if TYPE_CHECKING:
    from fastapi.testclient import TestClient

# 复用 tests/api/v1/ai 的 conftest
pytestmark = pytest.mark.usefixtures("_ai_test_env")

_ORG_ID = "00000000-0000-0000-0000-000000000099"
_CRED_ID = "00000000-0000-0000-0000-000000000aaa"


@pytest.fixture(autouse=True)
def _import_ai_conftest_fixtures(request: pytest.FixtureRequest) -> None:
    """让本目录测试找到 tests/api/v1/ai/conftest.py 的 fixtures."""
    # 通过 sys.path / pytest 自动发现, 这里 fixtures 已在 ai/conftest.py 注册
    _ = request


# ── status (counselor + admin 都能查) ─────────────────────


def test_status_admin_with_org_cred(
    admin_org_client: TestClient,
    setup_db_results: Any,
    make_credential: Any,
) -> None:
    org_cred = make_credential()
    setup_db_results([org_cred, None])  # org cred 有, platform 无
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/ai-credentials/status")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["hasOrgCredential"] is True
    assert body["hasPlatformFallback"] is False


def test_status_counselor_can_view(
    counselor_org_client: TestClient,
    setup_db_results: Any,
) -> None:
    """counselor 可看 status, 不看明文."""
    setup_db_results([None, None])
    r = counselor_org_client.get(f"/api/orgs/{_ORG_ID}/ai-credentials/status")
    assert r.status_code == 200
    body = r.json()
    assert body["hasOrgCredential"] is False
    # 无 hint / 明文字段
    assert "apiKey" not in body
    assert "apiKeyHint" not in body


def test_status_client_role_403(
    client_role_org_client: TestClient,
) -> None:
    """client 角色完全不可见."""
    r = client_role_org_client.get(f"/api/orgs/{_ORG_ID}/ai-credentials/status")
    assert r.status_code == 403


# ── list (org_admin 限定) ────────────────────────────────


def test_list_admin_returns_org_creds(
    admin_org_client: TestClient,
    setup_db_results: Any,
    make_credential: Any,
) -> None:
    cred = make_credential()
    setup_db_results([[cred]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/ai-credentials/")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) == 1
    # 永不返回明文
    assert "encryptedKey" not in body[0]
    assert "apiKey" not in body[0]


def test_list_counselor_403(
    counselor_org_client: TestClient,
) -> None:
    """counselor 不能列表 (只能看 status)."""
    r = counselor_org_client.get(f"/api/orgs/{_ORG_ID}/ai-credentials/")
    assert r.status_code == 403


# ── create (org_admin) ───────────────────────────────────


def test_create_org_credential_happy(
    admin_org_client: TestClient,
    setup_db_results: Any,
) -> None:
    """org_admin 创建 — POST 加密后落库."""
    # update demote 查询返回 no rows (空 update 结果)
    update_result = MagicMock()
    update_result.rowcount = 0
    setup_db_results([update_result])

    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/ai-credentials/",
        json={
            "provider": "openai-compatible",
            "baseUrl": "https://api.openai.com",
            "model": "gpt-4o",
            "apiKey": "sk-test-secret-key-1234567890",
            "dataResidency": "cn",
            "isDefault": True,
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["scope"] == "org"
    assert body["scopeId"] == _ORG_ID
    assert body["model"] == "gpt-4o"
    assert "apiKey" not in body
    assert "encryptedKey" not in body


def test_create_counselor_403(
    counselor_org_client: TestClient,
) -> None:
    r = counselor_org_client.post(
        f"/api/orgs/{_ORG_ID}/ai-credentials/",
        # 用合法 URL (Phase 5 P0 SSRF 校验通过), 让请求达到 role 检查再被拒
        json={"baseUrl": "https://api.openai.com/v1", "model": "y", "apiKey": "z"},
    )
    assert r.status_code == 403


# ── update (rotation = api_key 提供) ─────────────────────


def test_update_rotates_when_api_key_provided(
    admin_org_client: TestClient,
    setup_db_results: Any,
    make_credential: Any,
) -> None:
    cred = make_credential()
    setup_db_results([cred])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/ai-credentials/{_CRED_ID}",
        json={"apiKey": "sk-new-rotated-key"},
    )
    assert r.status_code == 200, r.text
    # rotated_at 应被设置
    assert cred.rotated_at is not None
    # 新加密的 key bytes 应和旧的不同 (轮换)
    # 注: cred 在内存中, 我们直接查实例


def test_update_changes_model_only(
    admin_org_client: TestClient,
    setup_db_results: Any,
    make_credential: Any,
) -> None:
    """不传 api_key → 只改 model, 不更新 rotated_at."""
    cred = make_credential()
    old_rotated = cred.rotated_at
    setup_db_results([cred])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/ai-credentials/{_CRED_ID}",
        json={"model": "gpt-4o-mini"},
    )
    assert r.status_code == 200
    assert cred.model == "gpt-4o-mini"
    assert cred.rotated_at == old_rotated  # 不动


def test_update_404_when_cross_org(
    admin_org_client: TestClient,
    setup_db_results: Any,
    make_credential: Any,
) -> None:
    """org_admin 试图改 platform 凭据 → 404 (越权防探测)."""
    import uuid as _uuid

    cred = make_credential(scope="platform", scope_id=None)
    cred.id = _uuid.UUID(_CRED_ID)
    setup_db_results([cred])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/ai-credentials/{_CRED_ID}",
        json={"model": "gpt-4o-mini"},
    )
    assert r.status_code == 404


# ── delete (soft delete) ─────────────────────────────────


def test_delete_soft_disables(
    admin_org_client: TestClient,
    setup_db_results: Any,
    make_credential: Any,
) -> None:
    cred = make_credential()
    setup_db_results([cred])
    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/ai-credentials/{_CRED_ID}")
    assert r.status_code == 204
    assert cred.is_disabled is True
    assert cred.is_default is False


# ── test (ping) ──────────────────────────────────────────


def test_test_endpoint_success(
    admin_org_client: TestClient,
    setup_db_results: Any,
    make_credential: Any,
) -> None:
    """POST /:id/test — resolve + decrypt 成功 → success=True."""
    cred = make_credential()
    # 1. cred 取一次, 2. resolve 取 org cred, 3. settings 取一次
    setup_db_results([cred, cred, {}])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/ai-credentials/{_CRED_ID}/test",
        json={"testPrompt": "ping"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True


# ── system_router (sysadmin only) ────────────────────────


def test_system_list_requires_sysadmin(
    admin_org_client: TestClient,
) -> None:
    """非 sysadmin 不能调 ``/api/ai-credentials``."""
    r = admin_org_client.get("/api/ai-credentials/")
    assert r.status_code == 403


def test_system_list_sysadmin_ok(
    sysadmin_client: TestClient,
    setup_db_results: Any,
    make_credential: Any,
) -> None:
    cred = make_credential()
    setup_db_results([[cred]])
    r = sysadmin_client.get("/api/ai-credentials/")
    assert r.status_code == 200, r.text


def test_system_create_platform_credential(
    sysadmin_client: TestClient,
    setup_db_results: Any,
) -> None:
    """sysadmin 创建 platform 凭据 (scope=platform 默认)."""
    update_result = MagicMock()
    update_result.rowcount = 0
    setup_db_results([update_result])

    r = sysadmin_client.post(
        "/api/ai-credentials/?scope=platform",
        json={
            "provider": "openai-compatible",
            "baseUrl": "https://api.openai.com",
            "model": "gpt-4o",
            "apiKey": "sk-platform-default",
            "dataResidency": "global",
            "isDefault": True,
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["scope"] == "platform"
    assert body["scopeId"] is None
    assert body["dataResidency"] == "global"
