"""Counseling API — 镜像 ``server/src/modules/counseling/`` (25 文件).

Routers (各自不同 prefix, 由 ``app/main.py`` 分别 include — 本模块 NOT 注册):
  - ``router``                       — ``/api/orgs/{org_id}/care-episodes``
  - ``appointment_router``           — ``/api/orgs/{org_id}/appointments``
  - ``availability_router``          — ``/api/orgs/{org_id}/availability``
  - ``session_note_router``          — ``/api/orgs/{org_id}/session-notes`` (PHI 核心)
  - ``note_template_router``         — ``/api/orgs/{org_id}/note-templates``
  - ``treatment_plan_router``        — ``/api/orgs/{org_id}/treatment-plans``
  - ``client_profile_router``        — ``/api/orgs/{org_id}/clients`` (子路径 /{user_id}/profile)
  - ``client_assignment_router``     — ``/api/orgs/{org_id}/client-assignments`` (RBAC)
  - ``client_access_grant_router``   — ``/api/orgs/{org_id}/client-access-grants``
  - ``goal_library_router``          — ``/api/orgs/{org_id}/goal-library``
  - ``ai_conversation_router``       — ``/api/orgs/{org_id}/ai-conversations``
  - ``public_router``                — ``/api/public/counseling`` (无 auth — W0.4 / W2.10 安全镜像)

Internal services (不暴露 router):
  - ``services.build_client_summary_input``
  - ``services.build_case_progress_input``
"""

from app.api.v1.counseling.ai_conversation_router import router as ai_conversation_router
from app.api.v1.counseling.appointment_router import router as appointment_router
from app.api.v1.counseling.availability_router import router as availability_router
from app.api.v1.counseling.client_access_grant_router import router as client_access_grant_router
from app.api.v1.counseling.client_assignment_router import router as client_assignment_router
from app.api.v1.counseling.client_profile_router import router as client_profile_router
from app.api.v1.counseling.episode_router import router
from app.api.v1.counseling.goal_library_router import router as goal_library_router
from app.api.v1.counseling.note_template_router import router as note_template_router
from app.api.v1.counseling.public_router import router as public_router
from app.api.v1.counseling.session_note_router import router as session_note_router
from app.api.v1.counseling.treatment_plan_router import router as treatment_plan_router

__all__ = [
    "ai_conversation_router",
    "appointment_router",
    "availability_router",
    "client_access_grant_router",
    "client_assignment_router",
    "client_profile_router",
    "goal_library_router",
    "note_template_router",
    "public_router",
    "router",
    "session_note_router",
    "treatment_plan_router",
]
