"""
AI module 共享 helpers — 镜像 ``server/src/modules/ai/ai-shared.ts``.

Node 端 ``applyAiGuards`` / ``applyAdminAiGuards`` 是 Fastify plugin-scope
hook 注入; FastAPI 端等价做法是 ``Depends`` + 路由层显式声明。这里只导出 helper:
  - ``require_admin_or_counselor(org)`` — 统一权限检查
  - ``require_org(org)`` — 必须有 org context

Phase 3 阶段 BYOK resolver 失败 = 配置错 (raise ValidationError 400). Node 端
``applyAiGuards`` 里的 ``aiClient.isConfigured`` 检查 (返 503) 等价被 resolver
内置 fallback chain 替代。
"""

from __future__ import annotations

from app.lib.errors import ForbiddenError
from app.middleware.org_context import OrgContext


def require_admin_or_counselor(org: OrgContext | None) -> OrgContext:
    """``requireRole('org_admin', 'counselor')`` 等价 (legacy role)。"""
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.role not in ("org_admin", "counselor"):
        raise ForbiddenError("insufficient_role")
    return org


def require_org(org: OrgContext | None) -> OrgContext:
    """要求有 org context (但不限定角色)。"""
    if org is None:
        raise ForbiddenError("org_context_required")
    return org


__all__ = [
    "require_admin_or_counselor",
    "require_org",
]
