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
