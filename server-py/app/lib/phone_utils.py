"""中国手机号校验 helper — Phase 5 (2026-05-04) 决策。

国内市场全切手机号登录, 手机号必须满足中国大陆规则:
  - 11 位数字
  - 第一位 1
  - 第二位 3-9 (1[3-9]xxxxxxxxx)

参考: 工信部码号资源管理办法, 现网在用号段全在 13x/14x/15x/16x/17x/18x/19x.

提取共享 helper 让 5+ 个公开注册 endpoint (auth login / counseling register /
eap register / parent-bind / org public services intake) 走同一份正则, 避免
drift。

业务: 短信验证 Phase 7+ 才加, 现在只做格式校验。
"""

from __future__ import annotations

import re

from app.lib.errors import ValidationError

# 中国大陆手机号 (alpha 起): 1 + [3-9] + 9 位数字 = 共 11 位
_CN_PHONE_PATTERN: re.Pattern[str] = re.compile(r"^1[3-9]\d{9}$")
CN_PHONE_REGEX: str = r"^1[3-9]\d{9}$"


def is_valid_cn_phone(phone: str | None) -> bool:
    """phone 是否合法的中国大陆手机号 (11 位 1[3-9]xxxxxxxxx)。"""
    if not phone:
        return False
    return _CN_PHONE_PATTERN.match(phone) is not None


def validate_cn_phone_or_raise(phone: str, *, field: str = "phone") -> str:
    """验证 phone 是合法中国大陆手机号, 否则 ``ValidationError(400)``。

    Returns:
        原 phone 字符串 (chainable)。

    Raises:
        ValidationError: 400 — phone 不符合中国大陆规则。
    """
    if not is_valid_cn_phone(phone):
        raise ValidationError(f"{field} 不是合法的中国大陆手机号")
    return phone


__all__ = [
    "CN_PHONE_REGEX",
    "is_valid_cn_phone",
    "validate_cn_phone_or_raise",
]
