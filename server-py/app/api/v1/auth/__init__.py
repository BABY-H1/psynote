"""Auth API — 镜像 server/src/modules/auth/。

7 个 endpoint:
  POST /register          (410 Gone, 引导走 OrgType 专属注册入口)
  POST /login
  POST /refresh
  POST /logout
  POST /change-password   (auth 必需)
  POST /forgot-password
  POST /reset-password
"""

from app.api.v1.auth.router import router

__all__ = ["router"]
