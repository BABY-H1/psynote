"""Client portal API — 镜像 ``server/src/modules/client-portal/`` (10 文件).

Routers (各自不同 endpoint, 都挂在 ``/api/orgs/{org_id}/client`` prefix):
  - ``router`` — 主聚合 router, include 全部 7 个 sub-routers (与 Node ``client.routes.ts``
    23-endpoint contract 完全对齐)

Sub-routers (按需独立 import, 测试可单独 include):
  - ``dashboard_router``           — /dashboard /timeline
  - ``appointments_router``        — /appointments /appointment-requests
  - ``counselors_router``          — /counselors
  - ``assessment_router``          — /results /results/{id} /results/trajectory/{scaleId}
  - ``my_assessments_router``      — /my-assessments
  - ``documents_consents_router``  — /documents /documents/{id} /documents/{id}/sign
                                      /consents /consents/{id}/revoke /referrals
                                      /referrals/{id}/consent
  - ``groups_courses_router``      — /groups /groups/{id} /my-groups
                                      /groups/{id}/sessions/{rid}/check-in
                                      /courses /courses/{id} /my-courses
"""

from app.api.v1.client_portal.appointments_router import router as appointments_router
from app.api.v1.client_portal.assessment_router import router as assessment_router
from app.api.v1.client_portal.client_router import router as router
from app.api.v1.client_portal.counselors_router import router as counselors_router
from app.api.v1.client_portal.dashboard_router import router as dashboard_router
from app.api.v1.client_portal.documents_consents_router import (
    router as documents_consents_router,
)
from app.api.v1.client_portal.groups_courses_router import router as groups_courses_router
from app.api.v1.client_portal.my_assessments_router import router as my_assessments_router

__all__ = [
    "appointments_router",
    "assessment_router",
    "counselors_router",
    "dashboard_router",
    "documents_consents_router",
    "groups_courses_router",
    "my_assessments_router",
    "router",
]
