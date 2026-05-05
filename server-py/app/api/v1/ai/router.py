"""
AI routes 主入口 — 镜像 ``server/src/modules/ai/ai.routes.ts``.

注册策略 (Phase 3 Tier 4 阶段):
  - 主聚合 router 由 ``app/main.py`` 挂在 ``/api/orgs/{org_id}/ai`` (统一前缀)
  - **不在 main.py 注册** — 由 Tier 4 整合 agent 完成所有 router 一次性 register

Node 端 ``adminAiRoutes`` (mount at ``/api/admin/ai``) 与 ``aiRoutes`` 复用 4 个
sub-router (scales / schemes / courses / templates), Python 端等价由 main 直接
include scales/schemes/courses/templates 到 admin prefix。
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.ai.assessment_router import router as _assessment
from app.api.v1.ai.course_authoring_router import router as _course_authoring
from app.api.v1.ai.group_schemes_router import router as _group_schemes
from app.api.v1.ai.scales_material_router import router as _scales_material
from app.api.v1.ai.templates_router import router as _templates
from app.api.v1.ai.treatment_router import router as _treatment

router = APIRouter()

# 6 sub-router 全部 include 到主 router 上 — 路径全平铺到 ``/api/orgs/{org_id}/ai/...``
router.include_router(_assessment)
router.include_router(_treatment)
router.include_router(_scales_material)
router.include_router(_group_schemes)
router.include_router(_course_authoring)
router.include_router(_templates)


__all__ = ["router"]
