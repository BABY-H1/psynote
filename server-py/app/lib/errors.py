"""
AppError 层级 — 镜像 server/src/lib/errors.ts。

domain-level exceptions 用 AppError 子类抛, app/middleware/error_handler.py
统一捕获并转 HTTP 响应 (status + ``{error, message}`` body)。

为什么不直接用 ``fastapi.HTTPException``: 业务层 (services) 不该依赖 web
框架。AppError 是纯域异常, 由 middleware 层翻译成 HTTP。这样 services 可
以脱离 FastAPI 单测。

新代码请抛 AppError 子类。``app/middleware/auth.py`` / ``org_context.py``
当前直接抛 HTTPException (Phase 1.2 / 1.6 时还没本类), Phase X 可清理。
"""

from __future__ import annotations


class AppError(Exception):
    """
    Domain exception 基类。所有业务错误派生自此。

    Attributes:
        status_code: HTTP 状态码 (4xx / 5xx), error_handler 用
        message: 用户可见的描述 (英文; 前端做 i18n 时按 code 映射)
        code: 机器可读 code (e.g. 'NOT_FOUND'), 前端按 code 决定 UI 行为
    """

    def __init__(
        self,
        status_code: int,
        message: str,
        code: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.code = code


class NotFoundError(AppError):
    """404 — 资源不存在或不可见 (与权限隔离, 防 enumeration)。"""

    def __init__(self, resource: str, resource_id: str | None = None) -> None:
        if resource_id:
            message = f"{resource} '{resource_id}' not found"
        else:
            message = f"{resource} not found"
        super().__init__(status_code=404, message=message, code="NOT_FOUND")


class ForbiddenError(AppError):
    """403 — 已认证但无权操作。"""

    def __init__(
        self,
        message: str = "You do not have permission to perform this action",
    ) -> None:
        super().__init__(status_code=403, message=message, code="FORBIDDEN")


class UnauthorizedError(AppError):
    """401 — 未认证或 token 失效。"""

    def __init__(self, message: str = "Authentication required") -> None:
        super().__init__(status_code=401, message=message, code="UNAUTHORIZED")


class ValidationError(AppError):
    """400 — 请求体 / 参数校验不通过。"""

    def __init__(self, message: str) -> None:
        super().__init__(status_code=400, message=message, code="VALIDATION_ERROR")


class ConflictError(AppError):
    """409 — 资源冲突 (e.g. 邮箱已注册)。"""

    def __init__(self, message: str) -> None:
        super().__init__(status_code=409, message=message, code="CONFLICT")


class PHIComplianceError(AppError):
    """403 — PHI 合规拦截 (出境同意未声明 / 数据驻留校验失败)。

    Phase 3 Tier 4 BYOK 引入: 当 ``ai_credentials.data_residency='global'`` 但 org
    的 settings.consentsToPhiExport 不为 True 时, ``resolve_ai_credential`` 直接抛
    此异常拒绝调用。这个 error 不该静默退到 platform 默认 (因为 platform 默认本身
    可能也是 global), 必须由 org admin 显式声明出境同意。
    """

    def __init__(
        self, message: str = "PHI cross-border export not consented by organization"
    ) -> None:
        super().__init__(status_code=403, message=message, code="PHI_COMPLIANCE_ERROR")
