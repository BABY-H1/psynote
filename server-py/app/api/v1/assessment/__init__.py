"""Assessment API — 镜像 ``server/src/modules/assessment/`` (14 文件 ~2780 行).

Routers (各自不同 prefix, 由 ``app/main.py`` 分别 include):

  - ``router``                — ``/api/orgs/{org_id}/assessments``        (assessment CRUD)
  - ``scale_router``          — ``/api/orgs/{org_id}/scales``             (scale + dimensions + items + rules)
  - ``batch_router``          — ``/api/orgs/{org_id}/assessment-batches`` (批量发放)
  - ``distribution_router``   — ``/api/orgs/{org_id}/assessments/{assessment_id}/distributions``
  - ``report_router``         — ``/api/orgs/{org_id}/assessment-reports`` (报告 + PDF stub)
  - ``result_router``         — ``/api/orgs/{org_id}/assessment-results`` (PHI 核心)
  - ``public_result_router``  — ``/api/public/assessments``               (匿名公开提交, no auth)

Services 共享:
  - ``pdf_service``                  — Phase 3 stub (空白 PDF + zip), Phase 4 接 WeasyPrint
  - ``triage_automation_service``    — 自动研判 + crisis 候选 + 风险通知
"""

from app.api.v1.assessment.assessment_router import router
from app.api.v1.assessment.batch_router import router as batch_router
from app.api.v1.assessment.distribution_router import router as distribution_router
from app.api.v1.assessment.report_router import router as report_router
from app.api.v1.assessment.result_router import (
    public_router as public_result_router,
)
from app.api.v1.assessment.result_router import router as result_router
from app.api.v1.assessment.scale_router import router as scale_router

__all__ = [
    "batch_router",
    "distribution_router",
    "public_result_router",
    "report_router",
    "result_router",
    "router",
    "scale_router",
]
