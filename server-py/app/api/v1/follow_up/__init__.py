"""Follow-up 模块 — 镜像 ``server/src/modules/follow-up/``。

挂载: /api/orgs/{org_id}/follow-up → router (plans + reviews)
"""

from app.api.v1.follow_up.router import router

__all__ = ["router"]
