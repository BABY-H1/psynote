"""Upload API — 镜像 ``server/src/modules/upload/``。

1 个 endpoint (mounted at ``/api/orgs/{org_id}/upload``):
  POST /   multipart 上传单文件, 落到 UPLOAD_DIR/{org_id}/{uuid}.{ext}
"""

from app.api.v1.upload.router import router

__all__ = ["router"]
