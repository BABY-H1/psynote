"""
Global error handlers — register on FastAPI app to map domain exceptions
to HTTP responses。

镜像 server/src/middleware/error-handler.ts (Node) 的 errorHandler。

映射:
  AppError              → status_code + ``{error: code, message: message}``
  RequestValidationError → 400 + ``{error: 'VALIDATION_ERROR', message: ...}``
  其他 Exception        → 500 + ``{error: 'INTERNAL_ERROR', message: ...}``
                           (NODE_ENV=production 时 message 用通用兜底, 防
                            stacktrace 泄露)

接入 (在 app/main.py)::

    from app.middleware.error_handler import register_error_handlers
    register_error_handlers(app)
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import get_settings
from app.lib.errors import AppError

logger = logging.getLogger(__name__)


def register_error_handlers(app: FastAPI) -> None:
    """注册全局 exception handlers 到 FastAPI app。startup 调一次。"""

    @app.exception_handler(AppError)
    async def _handle_app_error(_request: Request, exc: AppError) -> JSONResponse:
        # AppError 是已知业务错误, 不打 stack trace (太啰嗦)
        logger.info("AppError: %s %s", exc.code or exc.__class__.__name__, exc.message)
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": exc.code or "ERROR",
                "message": exc.message,
            },
        )

    @app.exception_handler(RequestValidationError)
    async def _handle_validation(_request: Request, exc: RequestValidationError) -> JSONResponse:
        # FastAPI 默认 body 是 [{loc, msg, type}, ...] 数组, 太程序员视角。
        # 我们组成更人话的 message: "field foo: missing; field bar: invalid".
        message = _format_validation_errors(exc.errors())
        logger.info("RequestValidationError: %s", message)
        return JSONResponse(
            status_code=400,
            content={
                "error": "VALIDATION_ERROR",
                "message": message,
            },
        )

    @app.exception_handler(StarletteHTTPException)
    async def _handle_http_exc(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
        """
        FastAPI/Starlette 自抛的 HTTPException (e.g. middleware/auth.py 抛的 401).
        body 默认是 {"detail": ...}, 我们改成 ``{error, message}`` 格式与 AppError
        对齐 (前端只需识别一种 envelope)。
        """
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": _http_status_to_code(exc.status_code),
                "message": exc.detail if isinstance(exc.detail, str) else str(exc.detail),
            },
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(Exception)
    async def _handle_unknown(_request: Request, exc: Exception) -> JSONResponse:
        """未知异常 catch-all。打 stack trace 给 logger, 响应根据环境决定是否暴露 message。"""
        logger.exception("Unhandled exception")

        try:
            settings = get_settings()
            is_production = settings.NODE_ENV == "production"
        except SystemExit:
            # get_settings() 启动期 hard-fail; 在这种情况就当 production (保守)
            is_production = True

        message: str
        if is_production:
            message = "An unexpected error occurred"
        else:
            message = str(exc) or exc.__class__.__name__

        return JSONResponse(
            status_code=500,
            content={
                "error": "INTERNAL_ERROR",
                "message": message,
            },
        )


def _format_validation_errors(errors: Sequence[Any]) -> str:
    """
    把 FastAPI/Pydantic 的 errors 数组转成可读字符串。

    pydantic v2 ``RequestValidationError.errors()`` 返回 ``Sequence[Any]``
    (实际是 list[ErrorDetails]). 用 dict.get 风格访问让两种结构都通。

    输入: [{'loc': ('body', 'email'), 'msg': 'field required', 'type': 'missing'}, ...]
    输出: "body.email: field required; body.password: field required"
    """
    parts: list[str] = []
    for err in errors:
        loc_parts = [
            str(p)
            for p in (err.get("loc") if isinstance(err, dict) else getattr(err, "loc", ())) or ()
        ]
        loc = ".".join(loc_parts) if loc_parts else "body"
        msg = (err.get("msg") if isinstance(err, dict) else getattr(err, "msg", None)) or "invalid"
        parts.append(f"{loc}: {msg}")
    return "; ".join(parts) if parts else "Invalid request"


# 常见 HTTP status → code 的简单映射 (与 AppError code 对齐, 让前端可识别)
_STATUS_CODE_MAP: dict[int, str] = {
    400: "VALIDATION_ERROR",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
}


def _http_status_to_code(status: int) -> str:
    return _STATUS_CODE_MAP.get(status, "CLIENT_ERROR" if 400 <= status < 500 else "SERVER_ERROR")
