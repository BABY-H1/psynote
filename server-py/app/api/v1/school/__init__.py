"""
School API — 镜像 ``server/src/modules/school/`` (3 routes 文件).

Routers (各自不同 prefix, 由 ``app/main.py`` 分别 include — Tier 3 完成后统一注册):
  - ``class_router``     — ``/api/orgs/{org_id}/school/classes`` (班级 CRUD)
  - ``student_router``   — ``/api/orgs/{org_id}/school/students`` (学生 CRUD + import + stats)
  - ``analytics_router`` — ``/api/orgs/{org_id}/school/analytics`` (校领导聚合, 不读 PHI 原始数据)
"""

from app.api.v1.school.analytics_router import router as analytics_router
from app.api.v1.school.class_router import router as class_router
from app.api.v1.school.student_router import router as student_router

__all__ = [
    "analytics_router",
    "class_router",
    "student_router",
]
