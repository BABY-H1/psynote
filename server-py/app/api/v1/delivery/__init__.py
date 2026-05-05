"""Delivery 模块 — 镜像 ``server/src/modules/delivery/``。

Phase 3 Tier 4 — 跨模块服务实例聚合 + 统一 launch verb + 人员档案。

挂载:
  /api/orgs/{org_id}/services         → router (列表 + launch)
  /api/orgs/{org_id}/people           → person_archive_router (列表 + 单人档案)

外部 import 方式::

    from app.api.v1.delivery import router, person_archive_router
"""

from app.api.v1.delivery.person_archive_router import router as person_archive_router
from app.api.v1.delivery.router import router

__all__ = ["person_archive_router", "router"]
