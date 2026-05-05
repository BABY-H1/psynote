"""Admin API — 镜像 ``server/src/modules/admin/`` (5 sub-routes 文件).

Routers (各自不同 prefix, 由 ``app/main.py`` 分别 include):
  - ``router``            — ``/api/admin``           (admin core: stats / orgs / users / config)
  - ``dashboard_router``  — ``/api/admin/dashboard`` (经营看板 sysadm only)
  - ``library_router``    — ``/api/admin/library``   (6 类知识库 CRUD + distribution)
  - ``license_router``    — ``/api/admin/licenses``  (issue / renew / modify / revoke)
  - ``tenant_router``     — ``/api/admin/tenants``   (租户 CRUD + members + services)

⚠ 强约束: **每个 endpoint 必须 system_admin 守门** (镜像 Node ``app.addHook('preHandler',
requireSystemAdmin)`` 全 router 守门). Python FastAPI 没 router-level preHandler 等价物,
在每个 handler 显式调 ``_require_system_admin(user)``.
"""

from app.api.v1.admin.dashboard_router import router as dashboard_router
from app.api.v1.admin.library_router import router as library_router
from app.api.v1.admin.license_router import router as license_router
from app.api.v1.admin.router import router
from app.api.v1.admin.tenant_router import router as tenant_router

__all__ = [
    "dashboard_router",
    "library_router",
    "license_router",
    "router",
    "tenant_router",
]
