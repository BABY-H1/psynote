"""
FastAPI app entry — Phase 0 阶段只暴露 /health。

后续 phase 在此挂上 middleware (auth/data_scope/phi_access) +
26 个业务路由模块 (auth/user/org/.../workflow)。

启动顺序:
  1. get_settings() — 校验 env, 任何字段非法立刻 sys.exit(1) (W0.3)
  2. FastAPI 实例化 + lifespan (Phase 0 暂无 startup 任务)
  3. include_router (Phase 1+ 加)

注: 读 pyproject.toml 中 [project].version 作为 /health 返回的版本号,
让 Phase 6 shadow 流量对比 (Node 4000 vs Python 8001) 能区分版本来源。
"""

from __future__ import annotations

from functools import lru_cache
from importlib.metadata import PackageNotFoundError, version
from typing import Any

from fastapi import FastAPI

from app.api.v1.auth import router as auth_router
from app.api.v1.content_block import router as content_block_router
from app.api.v1.notification import (
    public_appointments_router,
    reminder_settings_router,
)
from app.api.v1.notification import router as notification_router
from app.api.v1.org import (
    branding_router,
    dashboard_router,
    intake_router,
    license_router,
    public_services_router,
    subscription_router,
)
from app.api.v1.org import router as org_router
from app.api.v1.upload import router as upload_router
from app.api.v1.user import router as user_router
from app.core.config import get_settings
from app.middleware.error_handler import register_error_handlers


@lru_cache(maxsize=1)
def _resolve_version() -> str:
    """取 pyproject 声明的版本号; 安装/dev 模式都能拿到。

    `importlib.metadata.version` 每次调用要扫 sys.path 找 *.dist-info,
    /health 是热路径(Caddy/k8s readiness 每 10s 一次), 所以 lru_cache 锁住。
    """
    try:
        return version("psynote-server")
    except PackageNotFoundError:
        # uv sync 之前 / 测试 cwd 不包含安装时回落
        return "0.1.0-dev"


def create_app() -> FastAPI:
    """工厂函数 — 测试可以构造独立实例; 生产用 module-level `app`。"""
    settings = get_settings()  # 启动期校验, 失败立即 sys.exit(1)
    app_version = _resolve_version()  # closure 复用, 避免 /health 每次重算

    fastapi_app = FastAPI(
        title="psynote API (FastAPI)",
        description=(
            "Psynote 心理服务管理平台 — Python/FastAPI 实现 "
            "(Fastify→FastAPI 全量迁移目标, Option C). "
            "完整迁移计划见 ~/.claude/plans/optimized-swimming-sunset.md."
        ),
        version=app_version,
        # Phase 1 起 docs 需要 auth 保护; Phase 0 暂开放
        docs_url="/docs",
        redoc_url=None,
    )

    # Phase 1.7: AppError / RequestValidationError / 未知异常的统一映射
    # → JSON {error, message} 格式, 与 Node 端 error-handler.ts 对齐
    register_error_handlers(fastapi_app)

    # ─── Phase 3 routers ─────────────────────────────────────
    # 路径前缀 /api/auth 与 Node 一致, Caddy /api/* → app-py 切流时 0 改动。
    fastapi_app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
    # /api/users — 自服务用户 (镜像 Node app.ts:149)
    fastapi_app.include_router(user_router, prefix="/api/users", tags=["user"])
    # /api/orgs/{org_id}/upload — org-scoped 文件上传 (镜像 Node app.ts:214)
    fastapi_app.include_router(upload_router, prefix="/api/orgs/{org_id}/upload", tags=["upload"])
    # /api/orgs/{org_id}/content-blocks — 内容块 CRUD (镜像 Node app.ts:250)
    fastapi_app.include_router(
        content_block_router,
        prefix="/api/orgs/{org_id}/content-blocks",
        tags=["content-block"],
    )
    # /api/orgs/{org_id}/notifications — 用户通知 (镜像 Node app.ts:221)
    fastapi_app.include_router(
        notification_router,
        prefix="/api/orgs/{org_id}/notifications",
        tags=["notification"],
    )
    # /api/orgs/{org_id}/reminder-settings — 机构级提醒配置 (镜像 Node app.ts:224)
    fastapi_app.include_router(
        reminder_settings_router,
        prefix="/api/orgs/{org_id}/reminder-settings",
        tags=["notification"],
    )
    # /api/public/appointments — 邮件链接 confirm/cancel (无 auth, 镜像 Node app.ts:227)
    fastapi_app.include_router(
        public_appointments_router,
        prefix="/api/public/appointments",
        tags=["notification"],
    )
    # ─── Org module (6 sub-routers, 与 Node app.ts:150 / 201 / 203 / 205 / 207 / 209 / 211 对齐) ─
    # /api/orgs — org CRUD + members + triage (镜像 Node app.ts:150)
    fastapi_app.include_router(org_router, prefix="/api/orgs", tags=["org"])
    # /api/orgs/{org_id}/branding — 品牌 (镜像 Node app.ts:201)
    fastapi_app.include_router(
        branding_router,
        prefix="/api/orgs/{org_id}/branding",
        tags=["org-branding"],
    )
    # /api/orgs/{org_id}/subscription + /ai-usage (镜像 Node app.ts:203)
    fastapi_app.include_router(
        subscription_router,
        prefix="/api/orgs/{org_id}",
        tags=["org-subscription"],
    )
    # /api/orgs/{org_id}/license — 激活/移除 license (镜像 Node app.ts:205)
    fastapi_app.include_router(
        license_router,
        prefix="/api/orgs/{org_id}/license",
        tags=["org-license"],
    )
    # /api/orgs/{org_id}/dashboard/{stats,kpi-delta} (镜像 Node app.ts:207)
    fastapi_app.include_router(
        dashboard_router,
        prefix="/api/orgs/{org_id}/dashboard",
        tags=["org-dashboard"],
    )
    # /api/orgs/{org_id}/service-intakes — 已认证 intake 列表 + 分配 (镜像 Node app.ts:209)
    fastapi_app.include_router(
        intake_router,
        prefix="/api/orgs/{org_id}/service-intakes",
        tags=["org-intake"],
    )
    # /api/public — 公开 services + intake submit (无 auth, 镜像 Node app.ts:211)
    fastapi_app.include_router(
        public_services_router,
        prefix="/api/public",
        tags=["org-public"],
    )

    @fastapi_app.get("/health", tags=["meta"])
    async def health() -> dict[str, Any]:
        """
        Liveness/readiness probe.

        Caddy / Docker / k8s 用此判定容器是否健康。Phase 6 shadow 流量
        对比 (Node :4000/health vs Python :8001/health) 也走这条。
        """
        return {
            "status": "ok",
            "version": app_version,
            "environment": settings.NODE_ENV,
        }

    return fastapi_app


app = create_app()
