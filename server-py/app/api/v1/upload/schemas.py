"""
Upload API 响应 schema (Pydantic v2)。

镜像 ``server/src/modules/upload/upload.routes.ts:24-29`` 的 JSON shape — 上传成功后返:
  { url, fileName, fileType, fileSize }

请求体走 multipart/form-data (FastAPI ``UploadFile = File(...)``), 不走 Pydantic。
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    """所有 upload schema 的基类 — wire camelCase, Python snake_case。"""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
    )


class UploadResponse(_CamelModel):
    """
    POST 上传成功响应 (镜像 upload.routes.ts:23-28)。

    - ``url``: 静态访问路径 (e.g. ``/uploads/{org_id}/{uuid}.png``)
    - ``file_name``: 原文件名 (用户上传时的文件名)
    - ``file_type``: 由扩展名推 — text/audio/image/pdf/presentation/video/document 之一
    - ``file_size``: 字节数
    """

    url: str
    file_name: str
    file_type: str
    file_size: int
