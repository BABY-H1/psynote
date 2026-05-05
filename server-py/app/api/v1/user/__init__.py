"""User API — 镜像 ``server/src/modules/user/``。

2 个 endpoint (mounted at ``/api/users``):
  GET   /me   self profile + 最近 active org_member
  PATCH /me   self update (name / avatar_url)
"""

from app.api.v1.user.router import router

__all__ = ["router"]
