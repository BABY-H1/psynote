"""Crisis API — 镜像 ``server/src/modules/crisis/`` (7 文件 ~974 行)。

Routers:
  - ``router``  — ``/api/orgs/{org_id}/crisis`` 危机案件 sign-off 状态机 + 仪表板

模块拆分 (与 Node 1:1):
  - ``router.py``           HTTP routes (镜像 crisis-case.routes.ts)
  - ``workflow_service.py`` 状态机 (镜像 crisis-case.workflow.ts)
    open → pending_sign_off → closed | reopened
  - ``queries_service.py``  read-only lookups (镜像 crisis-case.queries.ts)
  - ``helpers.py``          row → DTO + supervisor 通知扇出 (镜像 crisis-helpers.ts)
  - ``dashboard_service.py`` SQL 聚合分析 (镜像 crisis-dashboard.service.ts)

Phase 13 设计核心: 危机案件强制走督导 sign-off, counselor 提交结案
后必须由 org_admin 或 counselor+full_practice_access (督导) 审核。
"""

from app.api.v1.crisis.router import router

__all__ = ["router"]
