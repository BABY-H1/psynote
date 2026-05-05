"""Parent binding API — 镜像 ``server/src/modules/parent-binding/`` (4 文件).

3 个 routers (各自 prefix 不同, 由 ``app/main.py`` 分别 include):
  - ``admin_router``           — ``/api/orgs/{org_id}/school/classes/{class_id}/parent-invite-tokens``
                                  (counselor / org_admin 管理 tokens)
  - ``public_router``          — ``/api/public/parent-bind`` (无 auth, 家长公开绑定)
  - ``portal_children_router`` — ``/api/orgs/{org_id}/client/children``
                                  (家长 portal "我的孩子")
"""

from app.api.v1.parent_binding.admin_router import router as admin_router
from app.api.v1.parent_binding.portal_children_router import (
    router as portal_children_router,
)
from app.api.v1.parent_binding.public_router import router as public_router

__all__ = [
    "admin_router",
    "portal_children_router",
    "public_router",
]
