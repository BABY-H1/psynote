"""共享 Pydantic v2 schema 基类 — 所有 API v1 schemas 继承。

所有 v1 API 走 ``alias_generator=to_camel`` + ``populate_by_name=True`` + ``serialize_by_alias=True``,
让 wire 层是 camelCase (与 Node API 合约对齐, client / portal 不变), Python 内部仍是 snake_case。

之前 10 个 module schemas.py 各自独立定义同款 ``_CamelModel`` (Pydantic v2 alias_generator=to_camel) —
跨模块零 import 重用。这里提取共享基类, 让所有 schema 模块走同一个真理来源 (single source of truth)。
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Wire camelCase, Python snake_case (与 Node API 合约对齐)。

    - ``alias_generator=to_camel``: snake_case 字段自动生成 camelCase alias
    - ``populate_by_name=True``: 反序列化时同时接受 snake_case 和 camelCase
    - ``serialize_by_alias=True``: 序列化时只输出 camelCase, 防 dump 时多写 alias key
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
    )


__all__ = ["CamelModel"]
