"""Course API — 镜像 ``server/src/modules/course/`` (10 文件).

Routers (各自不同 prefix, 由 ``app/main.py`` 分别 include):
  - ``router``                — ``/api/orgs/{org_id}/courses`` (course CRUD + lifecycle + 子资源)
  - ``instance_router``       — ``/api/orgs/{org_id}/course-instances`` (instance CRUD + lifecycle)
  - ``enrollment_router``     — ``/api/orgs/{org_id}/course-instances`` (enrollment 列表 + assign + 审批)
  - ``feedback_router``       — ``/api/orgs/{org_id}/course-instances`` (feedback forms + responses)
  - ``homework_router``       — ``/api/orgs/{org_id}/course-instances`` (homework defs + submissions)
  - ``public_enroll_router``  — ``/api/public/courses`` (公开报名 — 无 auth)
"""

from app.api.v1.course.course_router import router
from app.api.v1.course.enrollment_router import router as enrollment_router
from app.api.v1.course.feedback_router import router as feedback_router
from app.api.v1.course.homework_router import router as homework_router
from app.api.v1.course.instance_router import router as instance_router
from app.api.v1.course.public_enroll_router import router as public_enroll_router

__all__ = [
    "enrollment_router",
    "feedback_router",
    "homework_router",
    "instance_router",
    "public_enroll_router",
    "router",
]
