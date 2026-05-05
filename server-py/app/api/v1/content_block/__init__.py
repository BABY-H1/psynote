"""Content block API — 镜像 server/src/modules/content-block/。

Phase 9α — 内容块 (course chapter / group scheme session 共享) 的统一 CRUD。
6 个 endpoint 挂在 ``/api/orgs/{org_id}/content-blocks`` 前缀下:

  GET  /                  — 按 parentType + parentId 列出
  GET  /batch             — 批量按 parentIds (列表) 拉取, 防 N+1
  POST /                  — 创建一个块
  PATCH /{block_id}       — 改 payload / visibility / sort_order
  DELETE /{block_id}      — 删
  POST /reorder           — 批量更新 sort_order

业务逻辑全部 inline 在 router (跟 auth 风格一致, 不分 service.py)。
"""

from app.api.v1.content_block.router import router

__all__ = ["router"]
