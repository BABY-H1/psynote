"""AI module — 镜像 ``server/src/modules/ai/`` (40+ 文件 / 33 pipelines / BYOK).

挂载点 (``app/main.py`` 注册):
  - ``/api/orgs/{org_id}/ai`` — 主 router (assessment / treatment / scales / schemes / courses /
    templates 6 个 sub-router 的聚合, 镜像 Node ai.routes.ts)
  - ``/api/admin/ai`` — sysadmin 库内容创作子集 (镜像 Node adminAiRoutes)

Phase 3 Tier 4 实装范围:
  - **BYOK 完整管线**: encrypt/decrypt + resolver fallback chain + PHI residency 拦截
  - **Provider**: OpenAI compatible (httpx async) — 完整网络层
  - **Usage tracker**: ``ai_call_logs`` insert (fire-and-forget)
  - **Routers**: 7 router 文件 (主 + 6 sub) 端点 1:1 镜像 Node
  - **Pipelines**: 33 个 stub (BYOK 调用点接通, 业务 prompt 留 Phase 5)
"""

from app.api.v1.ai.assessment_router import router as assessment_router
from app.api.v1.ai.course_authoring_router import router as course_authoring_router
from app.api.v1.ai.group_schemes_router import router as group_schemes_router
from app.api.v1.ai.router import router
from app.api.v1.ai.scales_material_router import router as scales_material_router
from app.api.v1.ai.templates_router import router as templates_router
from app.api.v1.ai.treatment_router import router as treatment_router

__all__ = [
    "assessment_router",
    "course_authoring_router",
    "group_schemes_router",
    "router",
    "scales_material_router",
    "templates_router",
    "treatment_router",
]
