"""Group API — 镜像 ``server/src/modules/group/`` (5 sub-routes 文件).

Routers (各自不同 prefix, 由 ``app/main.py`` 分别 include):
  - ``scheme_router``         — ``/api/orgs/{org_id}/group/schemes`` (方案模板)
  - ``instance_router``       — ``/api/orgs/{org_id}/group/instances`` (实例 CRUD)
  - ``session_router``        — ``/api/orgs/{org_id}/group/instances`` (sessions sub-routes)
  - ``enrollment_router``     — ``/api/orgs/{org_id}/group/instances`` (enrollment sub-routes)
  - ``public_enroll_router``  — ``/api/public/groups`` (无 auth, 公开报名 + 签到)
"""

from app.api.v1.group.enrollment_router import router as enrollment_router
from app.api.v1.group.instance_router import router as instance_router
from app.api.v1.group.public_enroll_router import router as public_enroll_router
from app.api.v1.group.scheme_router import router as scheme_router
from app.api.v1.group.session_router import router as session_router

__all__ = [
    "enrollment_router",
    "instance_router",
    "public_enroll_router",
    "scheme_router",
    "session_router",
]
