"""
Tests for app/middleware/auth.py — FastAPI Dependency `get_current_user`。

镜像 server/src/middleware/auth.ts 的 authGuard:
  - 缺 Authorization header → 401
  - 不带 Bearer 前缀 → 401
  - token 无效/过期/alg 错 → 401
  - payload 缺 sub → 401
  - 合法 → 注入 AuthUser (id, email, is_system_admin)

测试策略:
  - 大多数测试: 构造一个 mini FastAPI app, 挂一个 protected route, 用 TestClient
    发请求, 验证 status_code + body, 这样覆盖 dependency → HTTPException →
    HTTP 响应的完整链路。
  - 少数测试: 直接 await dependency 函数, 校验返回值 / 抛出异常。
"""

from __future__ import annotations

import pytest
from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient

# Cross-compat fixture (来自 test_security.py, 同一个 Node 端真实生成)
TEST_SECRET = "phase1-cross-compat-secret-32chars-min"
NODE_ACCESS_TOKEN = (  # exp 已过期, 测试 dependency 用自己签的 token
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJzdWIiOiJ1c2VyLWNyb3NzLWNvbXBhdC0xIiwiZW1haWwiOiJjcm9zc2NvbXBhdEBleGFtcGxlLmNvbSIsImlzU3lzdGVtQWRtaW4iOmZhbHNlLCJpYXQiOjE3Nzc4MjQwMDMsImV4cCI6MTc3ODQyODgwM30."
    "32ou7hPgfjavIYfCn61nectjAxcjrWjEDcOB72hDOdA"
)
NODE_EXPIRED_TOKEN = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJzdWIiOiJ1c2VyLTEiLCJpYXQiOjE3Nzc4MjQwMDMsImV4cCI6MTc3NzgyNDAwMn0."
    "q2W_6WKhQ3tfIQ4zpgyUCbd0PcKOlXx1KmspYOsiU2g"
)
ALG_NONE_TOKEN = (
    "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhdHRhY2tlciIsImlzU3lzdGVtQWRtaW4iOnRydWV9."
)


# ─── Test fixture: build mini FastAPI app with protected route ─────


@pytest.fixture
def protected_app(base_env: pytest.MonkeyPatch) -> FastAPI:
    """
    Mini FastAPI app 暴露一个用 get_current_user dependency 守门的 route,
    返回当前用户信息。所有 401 测试用同一个 app。
    """
    base_env.setenv("JWT_SECRET", TEST_SECRET)
    from app.middleware.auth import AuthUser, get_current_user

    app = FastAPI()

    @app.get("/whoami")
    async def whoami(user: AuthUser = Depends(get_current_user)) -> dict[str, object]:
        return {
            "id": user.id,
            "email": user.email,
            "is_system_admin": user.is_system_admin,
        }

    return app


@pytest.fixture
def client(protected_app: FastAPI) -> TestClient:
    return TestClient(protected_app)


# ─── 401 paths ─────────────────────────────────────────────────


def test_no_auth_header_returns_401(client: TestClient) -> None:
    response = client.get("/whoami")
    assert response.status_code == 401


def test_missing_bearer_prefix_returns_401(client: TestClient) -> None:
    """auth.ts:26: 必须 startsWith('Bearer ')"""
    response = client.get("/whoami", headers={"Authorization": "Token abc.def.ghi"})
    assert response.status_code == 401


def test_empty_token_after_bearer_returns_401(client: TestClient) -> None:
    response = client.get("/whoami", headers={"Authorization": "Bearer "})
    assert response.status_code == 401


def test_garbage_token_returns_401(client: TestClient) -> None:
    response = client.get("/whoami", headers={"Authorization": "Bearer not.a.jwt"})
    assert response.status_code == 401


def test_expired_token_returns_401(client: TestClient) -> None:
    response = client.get("/whoami", headers={"Authorization": f"Bearer {NODE_EXPIRED_TOKEN}"})
    assert response.status_code == 401


def test_alg_none_attack_returns_401(client: TestClient) -> None:
    """W3.4: alg=none 必须被 decode_token 的 algorithms=['HS256'] pin 拒, 不能 200"""
    response = client.get("/whoami", headers={"Authorization": f"Bearer {ALG_NONE_TOKEN}"})
    assert response.status_code == 401


def test_wrong_secret_returns_401(base_env: pytest.MonkeyPatch, protected_app: FastAPI) -> None:
    """换 JWT_SECRET 后旧 token 必须失效"""
    # 注: protected_app fixture 已经拿了 TEST_SECRET 构造 client; 但 dependency
    # 每次调用都重读 settings, 所以现在改 secret 仍然影响后续请求。
    base_env.setenv("JWT_SECRET", "totally-different-secret-32chars-x")
    from app.core.config import get_settings

    get_settings.cache_clear()
    client = TestClient(protected_app)
    response = client.get("/whoami", headers={"Authorization": f"Bearer {NODE_ACCESS_TOKEN}"})
    assert response.status_code == 401


# ─── 200 paths (合法 token) ────────────────────────────────────


def test_valid_python_signed_token_returns_200(
    base_env: pytest.MonkeyPatch, client: TestClient
) -> None:
    """
    Python 自签 token → Python dependency 验通过, 注入 AuthUser。
    """
    from app.core.security import create_access_token

    token = create_access_token(
        user_id="user-200-test", email="ok@example.com", is_system_admin=False
    )
    response = client.get("/whoami", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "user-200-test"
    assert body["email"] == "ok@example.com"
    assert body["is_system_admin"] is False


def test_valid_token_with_admin_flag(base_env: pytest.MonkeyPatch, client: TestClient) -> None:
    from app.core.security import create_access_token

    token = create_access_token(user_id="admin-1", email="admin@p.com", is_system_admin=True)
    response = client.get("/whoami", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["is_system_admin"] is True


def test_token_without_email_defaults_to_empty_string(
    base_env: pytest.MonkeyPatch, client: TestClient
) -> None:
    """
    auth.ts:49: payload.email 缺失时填 '' (而非 null), 跟 Node 行为一致。
    """
    from app.core.security import create_access_token

    token = create_access_token(user_id="u1", email=None, is_system_admin=False)
    response = client.get("/whoami", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["email"] == ""


def test_payload_missing_sub_returns_401(base_env: pytest.MonkeyPatch, client: TestClient) -> None:
    """
    auth.ts:43-45: payload.sub 缺失 → throw UnauthorizedError('Invalid token payload')。
    用 PyJWT 直接签一个无 sub 的 token 模拟这个场景。
    """
    import jwt as pyjwt

    base_env.setenv("JWT_SECRET", TEST_SECRET)
    from app.core.config import get_settings

    get_settings.cache_clear()
    bogus_token = pyjwt.encode(
        {"email": "no-sub@example.com", "exp": 9999999999},
        TEST_SECRET,
        algorithm="HS256",
    )
    response = client.get("/whoami", headers={"Authorization": f"Bearer {bogus_token}"})
    assert response.status_code == 401


# ─── Direct-call unit tests (sanity, 不走 HTTP) ──────────────────


@pytest.mark.asyncio
async def test_get_current_user_returns_authuser_instance(
    base_env: pytest.MonkeyPatch,
) -> None:
    """直接 await 一次, 校验返回的就是 AuthUser pydantic model"""
    from app.core.security import create_access_token
    from app.middleware.auth import AuthUser, get_current_user

    token = create_access_token(user_id="direct-1", email="d@e.com", is_system_admin=False)
    user = await get_current_user(authorization=f"Bearer {token}")
    assert isinstance(user, AuthUser)
    assert user.id == "direct-1"


@pytest.mark.asyncio
async def test_get_current_user_raises_httpexception_401(
    base_env: pytest.MonkeyPatch,
) -> None:
    from app.middleware.auth import get_current_user

    with pytest.raises(HTTPException) as exc:
        await get_current_user(authorization=None)
    assert exc.value.status_code == 401
