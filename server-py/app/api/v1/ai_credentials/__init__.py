"""
``ai_credentials`` CRUD — 镜像 (Node 还没有这个模块, Phase 3 Tier 4 新建)。

挂载点:
  - ``/api/ai-credentials`` (system_admin 全平台可见可改)
  - ``/api/orgs/{org_id}/ai-credentials`` (org_admin 自己 org 可见可改)

权限矩阵 (per plan):
  - ``system_admin``: 全可见可改
  - ``org_admin``: 自己 org 凭据 R/W (写不能读现有明文, 只能"覆盖"或"轮换")
  - ``counselor``: 看 "已配置 / 未配置" 状态, 不看明文
  - ``client``: 完全不可见 (路由层 ``role != client`` 守门)
"""

from app.api.v1.ai_credentials.org_router import router as org_router
from app.api.v1.ai_credentials.system_router import router as system_router

__all__ = ["org_router", "system_router"]
