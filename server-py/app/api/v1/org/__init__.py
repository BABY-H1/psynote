"""Org API — 镜像 ``server/src/modules/org/`` (6 sub-routes 文件).

Routers (各自不同 prefix, 由 ``app/main.py`` 分别 include):
  - ``router``                   — ``/api/orgs`` (org CRUD + members + triage)
  - ``public_services_router``   — ``/api/public`` (公开服务 + intake, no auth)
  - ``intake_router``            — ``/api/orgs/{org_id}/service-intakes``
  - ``dashboard_router``         — ``/api/orgs/{org_id}/dashboard``
  - ``branding_router``          — ``/api/orgs/{org_id}/branding``
  - ``subscription_router``      — ``/api/orgs/{org_id}``
  - ``license_router``           — ``/api/orgs/{org_id}/license``
"""

from app.api.v1.org.branding_router import router as branding_router
from app.api.v1.org.dashboard_router import router as dashboard_router
from app.api.v1.org.license_router import router as license_router
from app.api.v1.org.public_services_router import (
    intake_router,
)
from app.api.v1.org.public_services_router import (
    public_router as public_services_router,
)
from app.api.v1.org.router import router
from app.api.v1.org.subscription_router import router as subscription_router

__all__ = [
    "branding_router",
    "dashboard_router",
    "intake_router",
    "license_router",
    "public_services_router",
    "router",
    "subscription_router",
]
