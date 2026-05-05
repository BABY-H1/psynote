"""
EAP API — 镜像 ``server/src/modules/eap/`` (5 routes 文件 + 1 internal emitter).

Routers (各自不同 prefix, 由 ``app/main.py`` 分别 include — Tier 3 完成后统一注册):
  - ``partnership_router``  — ``/api/orgs/{org_id}/eap/partnerships`` (企业↔机构合作)
  - ``assignment_router``   — ``/api/orgs/{org_id}/eap/assignments`` (咨询师派遣)
  - ``analytics_router``    — ``/api/orgs/{org_id}/eap/analytics`` (HR 聚合, NO PHI)
  - ``public_router``       — ``/api/public/eap`` (员工注册, 无 auth)

Internal helpers:
  - ``emit_eap_event`` (event_emitter): 业务侧 hook 调用, 写 eap_usage_events
"""

from app.api.v1.eap.analytics_router import router as analytics_router
from app.api.v1.eap.assignment_router import router as assignment_router
from app.api.v1.eap.event_emitter import EmitEventParams, emit_eap_event
from app.api.v1.eap.partnership_router import router as partnership_router
from app.api.v1.eap.public_router import router as public_router

__all__ = [
    "EmitEventParams",
    "analytics_router",
    "assignment_router",
    "emit_eap_event",
    "partnership_router",
    "public_router",
]
