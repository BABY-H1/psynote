"""Notification API — 镜像 server/src/modules/notification/。

3 个 router (与 Node 端 3 个独立 register 调用一致):

  ``router``                    — notification CRUD
                                  (挂在 /api/orgs/{org_id}/notifications)
  ``reminder_settings_router``  — 机构级提醒配置 GET/PUT (1 行/org)
                                  (挂在 /api/orgs/{org_id}/reminder-settings)
  ``public_appointments_router``— 邮件链接里的 confirm/cancel (无 auth, HTML 响应)
                                  (挂在 /api/public/appointments)
"""

from app.api.v1.notification.public_appointments_router import (
    router as public_appointments_router,
)
from app.api.v1.notification.reminder_settings_router import router as reminder_settings_router
from app.api.v1.notification.router import router

__all__ = [
    "public_appointments_router",
    "reminder_settings_router",
    "router",
]
