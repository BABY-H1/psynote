"""Collaboration 模块 — 镜像 ``server/src/modules/collaboration/``。

挂载: /api/orgs/{org_id}/collaboration → router (4-tab UI 一站式)
"""

from app.api.v1.collaboration.router import router

__all__ = ["router"]
