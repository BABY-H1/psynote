"""Enrollment response API — 镜像 ``server/src/modules/enrollment-response/``。

Phase 9α — 学员对内容块的响应记录 (polymorphic, 跨 course / group enrollment 共用)。

挂在两个独立 prefix 下 (与 Node ``app.ts:251-252`` 一致):

  ``router``                      — 咨询师 / 机构端
                                    (``/api/orgs/{org_id}/enrollment-responses``)
  ``client_router``               — 学员 portal 提交自己响应
                                    (``/api/orgs/{org_id}/client/enrollment-responses``)

4 个 endpoint:

  GET   /                                — 按 enrollment 列出全部响应
                                           (client 角色仅看自己, 顶部做 ownership 校验)
  GET   /pending-safety                  — org 内待审 safety flag 列表
                                           (org_admin / counselor only)
  POST  /{response_id}/review            — 标记某响应已审
                                           (org_admin / counselor only)
  POST  /                  (client side)  — 学员提交响应 (subscribed to 1 enrollment)

业务逻辑全部 inline (跟 auth / content_block 风格一致, 不分 service.py)。
"""

from app.api.v1.enrollment_response.router import client_router, router

__all__ = ["client_router", "router"]
