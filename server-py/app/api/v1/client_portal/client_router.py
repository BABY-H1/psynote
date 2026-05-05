"""Client portal contract orchestrator — 镜像 ``server/src/modules/client-portal/client.routes.ts``.

Node 端 ``client.routes.ts`` 自身没有 endpoint, 只挂载 7 个 sub-routers
(dashboard / appointments / counselors / assessment / my-assessments /
documents-consents / groups-courses) 在同一 ``/api/orgs/{org_id}/client``
prefix 下, 加 ``authGuard + orgContextGuard``.

Python 端镜像设计:
  - 各 sub-router 独立模块
  - 本文件 export 一个 ``router: APIRouter`` 把所有 sub 包起来 (与 Node test
    "23 endpoints" 契约对齐), 便于 ``app/main.py`` 一次 ``include_router``
  - auth + org_context 通过各 sub-router 自己的 endpoint Depends 强制 (FastAPI
    无 Fastify ``addHook('preHandler', ...)`` 等价, 不用全局 hook)

23 endpoints 契约 (与 ``client.routes.test.ts`` 完全对齐):
  GET    /appointments
  GET    /consents
  GET    /counselors
  GET    /courses
  GET    /courses/{course_id}
  GET    /dashboard
  GET    /documents
  GET    /documents/{doc_id}
  GET    /groups
  GET    /groups/{instance_id}
  GET    /my-assessments
  GET    /my-courses
  GET    /my-groups
  GET    /referrals
  GET    /results
  GET    /results/{result_id}
  GET    /results/trajectory/{scale_id}
  GET    /timeline
  POST   /appointment-requests
  POST   /consents/{consent_id}/revoke
  POST   /documents/{doc_id}/sign
  POST   /groups/{instance_id}/sessions/{session_record_id}/check-in
  POST   /referrals/{referral_id}/consent
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.client_portal.appointments_router import router as appointments_router
from app.api.v1.client_portal.assessment_router import router as assessment_router
from app.api.v1.client_portal.counselors_router import router as counselors_router
from app.api.v1.client_portal.dashboard_router import router as dashboard_router
from app.api.v1.client_portal.documents_consents_router import (
    router as documents_consents_router,
)
from app.api.v1.client_portal.groups_courses_router import router as groups_courses_router
from app.api.v1.client_portal.my_assessments_router import router as my_assessments_router

router = APIRouter()
router.include_router(dashboard_router)
router.include_router(appointments_router)
router.include_router(counselors_router)
router.include_router(assessment_router)
router.include_router(my_assessments_router)
router.include_router(documents_consents_router)
router.include_router(groups_courses_router)


__all__ = ["router"]
