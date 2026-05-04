"""
Tests for app/main.py — FastAPI app + /health endpoint.

Phase 0 deliverable: 路由注册 + healthcheck 可达。后续 phase 会在此基础
加 middleware (auth/data_scope/phi_access) 和 26 个业务路由模块。

健康检查协议 (与 Caddy/Docker 期望对齐):
  GET /health      → 200 {"status": "ok", "version": "...", "environment": "..."}
  Caddy/k8s 用此判定 readiness; Phase 6 切流前 shadow 流量也走这个。

公共 fixture (`_clean_psynote_env`, `base_env`) 来自 tests/conftest.py。
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _ensure_valid_env(base_env: pytest.MonkeyPatch) -> None:
    """本文件所有测试都需要可构造 Settings (因为 import app.main 会触发)。

    `base_env` 提供最小有效 env, conftest 的 _clean_psynote_env autouse 已
    保证清空 + cache_clear, 故此处不需重复。覆盖式测试 (e.g. NODE_ENV=test)
    在测试函数内再 setenv。
    """
    base_env.setenv("NODE_ENV", "test")


@pytest.fixture
def client() -> TestClient:
    """构造 TestClient 同步触发 lifespan + 路由注册。"""
    from app.main import app

    return TestClient(app)


# ─── /health ─────────────────────────────────────────────────────


def test_health_returns_200(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200


def test_health_returns_status_ok(client: TestClient) -> None:
    response = client.get("/health")
    body = response.json()
    assert body["status"] == "ok"


def test_health_returns_version(client: TestClient) -> None:
    """version 字段需要存在 (Phase 6 shadow 流量对比版本用)"""
    response = client.get("/health")
    body = response.json()
    assert "version" in body
    assert isinstance(body["version"], str)
    assert len(body["version"]) > 0


def test_health_returns_environment(client: TestClient) -> None:
    """environment 字段反映 NODE_ENV"""
    response = client.get("/health")
    body = response.json()
    assert body["environment"] == "test"


def test_health_response_is_json(client: TestClient) -> None:
    response = client.get("/health")
    assert response.headers["content-type"].startswith("application/json")


# ─── App 元数据 ────────────────────────────────────────────────


def test_app_is_fastapi_instance() -> None:
    from app.main import app

    assert isinstance(app, FastAPI)


def test_app_has_title() -> None:
    """OpenAPI 文档生成 + Phase 6 shadow 对比要看 title"""
    from app.main import app

    assert "psynote" in app.title.lower()


# ─── 启动配置失败的 hard-fail 验证 (W0.3 重做) ─────────────────


def test_app_startup_fails_when_jwt_secret_too_short(
    base_env: pytest.MonkeyPatch,
) -> None:
    """
    JWT_SECRET <32 chars, get_settings() 必须 sys.exit(1)。
    base_env 给出有效 DATABASE_URL, 这里只覆盖 JWT_SECRET 到 31 chars 触发 W0.3。
    """
    base_env.setenv("JWT_SECRET", "a" * 31)
    from app.core.config import get_settings

    with pytest.raises(SystemExit) as exc:
        get_settings()
    assert exc.value.code == 1


# ─── Phase 1.7: error_handler wired into create_app ─────────────


def test_app_app_error_handler_wired(client: TestClient) -> None:
    """
    Phase 1.7 验证: register_error_handlers 在 create_app() 内被调用,
    routes 抛 AppError 时返回正确的 {error, message} 响应。
    """
    from app.lib.errors import NotFoundError
    from app.main import app

    # 临时挂一条触发 AppError 的 route
    @app.get("/__test/raises_not_found")
    async def _raise() -> None:
        raise NotFoundError(resource="TestThing", resource_id="42")

    response = client.get("/__test/raises_not_found")
    assert response.status_code == 404
    body = response.json()
    assert body["error"] == "NOT_FOUND"
    assert "TestThing" in body["message"]
    assert "42" in body["message"]
