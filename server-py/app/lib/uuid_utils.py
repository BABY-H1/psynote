"""UUID 解析 helper — 业务输入 (str path / body 字段) → uuid.UUID, 失败时 raise ValidationError 400。

之前 23+ router 各自重复定义 ``def _parse_uuid(value, field) -> uuid.UUID:`` 实现 100% 一致 —
提取共享 helper 消除复制粘贴。
"""

from __future__ import annotations

import uuid

from app.lib.errors import ValidationError


def parse_uuid_or_raise(value: str, *, field: str = "id") -> uuid.UUID:
    """解析 ``str`` → ``uuid.UUID``, 不合法 raise ``ValidationError(f"{field} 不是合法 UUID")``。

    Args:
        value: 待解析字符串 (path param / body 字段)
        field: 错误信息中的字段名, 默认 ``"id"``

    Raises:
        ValidationError: 400, code=VALIDATION_ERROR — value 非合法 UUID。
            涵盖 ``ValueError`` (格式错), ``TypeError`` (非 str/bytes), ``AttributeError`` (None)。
    """
    try:
        return uuid.UUID(value)
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValidationError(f"{field} 不是合法 UUID") from exc


def parse_uuid_or_none(value: object) -> uuid.UUID | None:
    """宽松解析 ``str | None | 其它`` → ``uuid.UUID | None``, 不合法直接返 None。

    用在"可选 UUID 输入"场景 (例如可选 query param / 旧记录里残留的脏数据), 不抛异常。
    需要硬校验 (path param 必填) 用 :func:`parse_uuid_or_raise`。

    曾分散于 result_router / triage_automation_service / report_router 等 3+ 处, 现统一。
    """
    if isinstance(value, uuid.UUID):
        return value
    if not isinstance(value, str):
        return None
    try:
        return uuid.UUID(value)
    except (ValueError, TypeError):
        return None


__all__ = ["parse_uuid_or_none", "parse_uuid_or_raise"]
