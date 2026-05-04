"""
Tests for app/middleware/error_handler.py — register_error_handlers FastAPI 接入。

镜像 server/src/middleware/error-handler.ts 的映射:
  AppError  → status_code + body {error, message}
  Pydantic / FastAPI 验证错 → 400 VALIDATION_ERROR
  其他 unknown → 500 INTERNAL_ERROR (production hide internal message)
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

# ─── helper: build mini app with registered handler ─────────────


def _build_app() -> FastAPI:
    """构造含 register_error_handlers 的 mini app + 几条触发不同错的 route."""
    from app.lib.errors import (
        ConflictError,
        ForbiddenError,
        NotFoundError,
        UnauthorizedError,
        ValidationError,
    )
    from app.middleware.error_handler import register_error_handlers

    app = FastAPI()
    register_error_handlers(app)

    @app.get("/raise/not-found")
    async def _r1() -> None:
        raise NotFoundError(resource="Course", resource_id="course-42")

    @app.get("/raise/not-found-no-id")
    async def _r1b() -> None:
        raise NotFoundError(resource="Org")

    @app.get("/raise/forbidden")
    async def _r2() -> None:
        raise ForbiddenError("not your org")

    @app.get("/raise/unauthorized")
    async def _r3() -> None:
        raise UnauthorizedError()

    @app.get("/raise/validation")
    async def _r4() -> None:
        raise ValidationError("Email is required")

    @app.get("/raise/conflict")
    async def _r5() -> None:
        raise ConflictError("Email already exists")

    @app.get("/raise/generic")
    async def _r6() -> None:
        raise RuntimeError("internal boom — should NOT leak in prod")

    class Body(BaseModel):
        email: str

    @app.post("/validate")
    async def _r7(body: Body) -> dict[str, str]:
        return {"email": body.email}

    return app


@pytest.fixture
def client(base_env: pytest.MonkeyPatch) -> TestClient:
    return TestClient(_build_app(), raise_server_exceptions=False)


# ─── AppError 子类映射 ────────────────────────────────────────


def test_not_found_with_id(client: TestClient) -> None:
    response = client.get("/raise/not-found")
    assert response.status_code == 404
    body = response.json()
    assert body["error"] == "NOT_FOUND"
    assert "Course" in body["message"]
    assert "course-42" in body["message"]


def test_not_found_no_id(client: TestClient) -> None:
    response = client.get("/raise/not-found-no-id")
    assert response.status_code == 404
    body = response.json()
    assert body["error"] == "NOT_FOUND"
    assert "Org" in body["message"]


def test_forbidden_custom_message(client: TestClient) -> None:
    response = client.get("/raise/forbidden")
    assert response.status_code == 403
    body = response.json()
    assert body["error"] == "FORBIDDEN"
    assert body["message"] == "not your org"


def test_unauthorized_default_message(client: TestClient) -> None:
    response = client.get("/raise/unauthorized")
    assert response.status_code == 401
    body = response.json()
    assert body["error"] == "UNAUTHORIZED"
    assert body["message"]  # 默认非空


def test_validation_app_error(client: TestClient) -> None:
    """业务层抛 ValidationError → 400 + VALIDATION_ERROR code"""
    response = client.get("/raise/validation")
    assert response.status_code == 400
    body = response.json()
    assert body["error"] == "VALIDATION_ERROR"
    assert body["message"] == "Email is required"


def test_conflict_409(client: TestClient) -> None:
    response = client.get("/raise/conflict")
    assert response.status_code == 409
    body = response.json()
    assert body["error"] == "CONFLICT"


# ─── FastAPI 自带 RequestValidationError (body schema 错) → 400 ───


def test_request_validation_error_returns_400(client: TestClient) -> None:
    """POST 缺字段 → FastAPI Pydantic 抛 RequestValidationError, 应映射 400 VALIDATION_ERROR"""
    response = client.post("/validate", json={})  # 缺 email
    assert response.status_code == 400
    body = response.json()
    assert body["error"] == "VALIDATION_ERROR"
    assert body["message"]  # 含字段名等细节


# ─── 未知 Exception → 500 (prod hide message, dev 显示) ──────────


def test_generic_exception_500_dev_shows_message(
    base_env: pytest.MonkeyPatch,
) -> None:
    """NODE_ENV=development 时 500 body 暴露原始 message (debug 用)"""
    base_env.setenv("NODE_ENV", "development")
    from app.core.config import get_settings

    get_settings.cache_clear()

    client = TestClient(_build_app(), raise_server_exceptions=False)
    response = client.get("/raise/generic")
    assert response.status_code == 500
    body = response.json()
    assert body["error"] == "INTERNAL_ERROR"
    assert "internal boom" in body["message"]


def test_generic_exception_500_production_hides_message(
    base_env: pytest.MonkeyPatch,
) -> None:
    """NODE_ENV=production 时 500 body 必须 hide 原始 message (防 stacktrace 泄露)"""
    base_env.setenv("NODE_ENV", "production")
    from app.core.config import get_settings

    get_settings.cache_clear()

    client = TestClient(_build_app(), raise_server_exceptions=False)
    response = client.get("/raise/generic")
    assert response.status_code == 500
    body = response.json()
    assert body["error"] == "INTERNAL_ERROR"
    assert "internal boom" not in body["message"]
    assert body["message"]  # 但仍有友好的 generic message
