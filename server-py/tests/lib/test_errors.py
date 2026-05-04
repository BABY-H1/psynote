"""
Tests for app/lib/errors.py — AppError 层级 (镜像 server/src/lib/errors.ts)。

每个 subclass:
  - 是 AppError 的子类 (catch-all 用)
  - 有正确的 status_code 与 code
  - 默认 message 合理 / 自定义 message 透传
"""

from __future__ import annotations

# ─── AppError 基类 ───────────────────────────────────────────────


def test_app_error_basic() -> None:
    from app.lib.errors import AppError

    err = AppError(status_code=418, message="I'm a teapot", code="TEAPOT")
    assert err.status_code == 418
    assert err.message == "I'm a teapot"
    assert err.code == "TEAPOT"
    # 同时是 Exception 的子类 (能被 Python try/except 抓)
    assert isinstance(err, Exception)


def test_app_error_str_returns_message() -> None:
    """str(err) 应该返回 message, 让 logger.exception() / repr 看得见信息"""
    from app.lib.errors import AppError

    err = AppError(status_code=500, message="boom", code="X")
    assert str(err) == "boom"


def test_app_error_code_optional() -> None:
    from app.lib.errors import AppError

    err = AppError(status_code=500, message="just a message")
    assert err.code is None


# ─── NotFoundError 404 ───────────────────────────────────────────


def test_not_found_with_id() -> None:
    from app.lib.errors import AppError, NotFoundError

    err = NotFoundError(resource="User", resource_id="user-42")
    assert isinstance(err, AppError)
    assert err.status_code == 404
    assert err.code == "NOT_FOUND"
    assert "User" in err.message
    assert "user-42" in err.message


def test_not_found_without_id() -> None:
    from app.lib.errors import NotFoundError

    err = NotFoundError(resource="Organization")
    assert err.status_code == 404
    assert err.code == "NOT_FOUND"
    assert "Organization" in err.message


# ─── ForbiddenError 403 ──────────────────────────────────────────


def test_forbidden_default_message() -> None:
    from app.lib.errors import AppError, ForbiddenError

    err = ForbiddenError()
    assert isinstance(err, AppError)
    assert err.status_code == 403
    assert err.code == "FORBIDDEN"
    assert err.message  # 非空


def test_forbidden_custom_message() -> None:
    from app.lib.errors import ForbiddenError

    err = ForbiddenError("You shall not pass")
    assert err.message == "You shall not pass"
    assert err.status_code == 403


# ─── UnauthorizedError 401 ───────────────────────────────────────


def test_unauthorized_default_and_custom() -> None:
    from app.lib.errors import AppError, UnauthorizedError

    default_err = UnauthorizedError()
    assert isinstance(default_err, AppError)
    assert default_err.status_code == 401
    assert default_err.code == "UNAUTHORIZED"

    custom_err = UnauthorizedError("Token expired")
    assert custom_err.message == "Token expired"


# ─── ValidationError 400 ─────────────────────────────────────────


def test_validation_error() -> None:
    from app.lib.errors import AppError, ValidationError

    err = ValidationError("Email is required")
    assert isinstance(err, AppError)
    assert err.status_code == 400
    assert err.code == "VALIDATION_ERROR"
    assert err.message == "Email is required"


# ─── ConflictError 409 ───────────────────────────────────────────


def test_conflict_error() -> None:
    from app.lib.errors import AppError, ConflictError

    err = ConflictError("Email already registered")
    assert isinstance(err, AppError)
    assert err.status_code == 409
    assert err.code == "CONFLICT"
    assert err.message == "Email already registered"


# ─── All subclasses inherit AppError ────────────────────────────


def test_all_subclasses_inherit_app_error() -> None:
    """Catch-all `except AppError` 应能捕到所有 5 个子类"""
    from app.lib.errors import (
        AppError,
        ConflictError,
        ForbiddenError,
        NotFoundError,
        UnauthorizedError,
        ValidationError,
    )

    for cls in (
        NotFoundError,
        ForbiddenError,
        UnauthorizedError,
        ValidationError,
        ConflictError,
    ):
        assert issubclass(cls, AppError), cls.__name__
