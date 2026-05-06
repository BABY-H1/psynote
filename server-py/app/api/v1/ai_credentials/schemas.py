"""
``ai_credentials`` API schemas (Pydantic v2 + CamelModel).

读列表 / 状态时**永不返回明文 key**, 只暴露 hint (尾 4 位 + 长度) 让运维区分。
"""

from __future__ import annotations

from datetime import datetime
from ipaddress import ip_address
from typing import Literal
from urllib.parse import urlparse

from pydantic import Field, field_validator

from app.api.v1._schema_base import CamelModel


def _validate_safe_url(value: str) -> str:
    """Phase 5 P0 fix (SSRF 防御): 校验 base_url 不指向内网 / 非 HTTPS scheme。

    威胁: 攻击者 (拿到 org_admin token) 创建 AI credential 用 ``base_url=
    http://169.254.169.254`` (云元数据) 或 ``http://internal-redis:6379`` 让
    服务器 POST 到内网。Decrypted API key 也会被当 Bearer 发去攻击者域。

    规则:
      1. scheme 必须是 https (dev 例外: NODE_ENV=development 时允许 http)
      2. host 不能是 RFC1918 私有 IP / loopback / link-local
      3. host 必须有 (URL 必须含 host)
    域名形式 (e.g. api.openai.com) 放行 (依赖 DNS 解析时不再二次校验, 这是 trade-off)。
    """
    parsed = urlparse(value)
    if not parsed.hostname:
        raise ValueError("base_url must include a host")

    from app.core.config import get_settings

    settings = get_settings()
    is_dev = settings.NODE_ENV != "production"

    if parsed.scheme not in ("https", "http"):
        raise ValueError(f"base_url scheme must be https (or http in dev), got {parsed.scheme!r}")
    if parsed.scheme == "http" and not is_dev:
        raise ValueError("base_url must use https in production")

    # IP 校验: 是 IP 就拒绝内网/loopback; 是域名就放行
    try:
        ip = ip_address(parsed.hostname)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast:
            raise ValueError(
                f"base_url IP {parsed.hostname} not allowed (private/loopback/link-local/multicast)"
            )
    except ValueError as exc:
        # ip_address raises ValueError on hostname (not IP) — 放行域名
        if "not allowed" in str(exc):
            raise
    return value


# ── 输入 ─────────────────────────────────────────────────────────


class AICredentialCreateRequest(CamelModel):
    """新增凭据 — system admin 才能写 platform scope; org admin 写本 org 的 scope。

    ``scope`` / ``scope_id`` 由路由层强制 (system 路径 → platform/任意 org;
    org 路径 → org/当前 org_id), 客户端不能伪造。
    """

    provider: str = Field(min_length=1, default="openai-compatible")
    base_url: str = Field(min_length=1)
    model: str = Field(min_length=1)
    api_key: str = Field(min_length=1)  # 明文 — 路由层 encrypt 后落地
    data_residency: Literal["cn", "global"] = "cn"
    is_default: bool = False
    label: str | None = None

    @field_validator("base_url")
    @classmethod
    def _check_base_url(cls, v: str) -> str:
        return _validate_safe_url(v)


class AICredentialUpdateRequest(CamelModel):
    """部分更新 — 不允许改 scope / scope_id。``api_key`` 可空 (仅改 model / label / 重置 default)."""

    base_url: str | None = None
    model: str | None = None
    api_key: str | None = None  # 提供 = 轮换密钥 (重新加密)
    data_residency: Literal["cn", "global"] | None = None
    is_default: bool | None = None
    label: str | None = None

    @field_validator("base_url")
    @classmethod
    def _check_base_url(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return _validate_safe_url(v)


class AICredentialTestRequest(CamelModel):
    """ping 测试 — 路由层会 resolve 凭据并发一个 minimal chat completion (echo) 验证连通。"""

    test_prompt: str = "ping"


# ── 输出 ─────────────────────────────────────────────────────────


class AICredentialPublic(CamelModel):
    """公开视图 — 永不含明文 api_key, 只有 hint (尾 4 位 + 长度) 给 system_admin / org_admin。"""

    id: str
    scope: str
    scope_id: str | None = None
    provider: str
    base_url: str
    model: str
    data_residency: str
    is_default: bool
    is_disabled: bool
    label: str | None = None
    api_key_hint: str | None = None  # 'sk-...XYZW (32 chars)' 仅 admin 视图
    created_at: datetime | None = None
    rotated_at: datetime | None = None
    last_used_at: datetime | None = None
    last_error_at: datetime | None = None


class AICredentialStatus(CamelModel):
    """counselor 视图 — 仅"已配置/未配置"。"""

    org_id: str
    has_org_credential: bool
    has_platform_fallback: bool
    provider: str | None = None
    data_residency: str | None = None
    model: str | None = None


class AICredentialTestResult(CamelModel):
    success: bool
    message: str
    latency_ms: int | None = None


__all__ = [
    "AICredentialCreateRequest",
    "AICredentialPublic",
    "AICredentialStatus",
    "AICredentialTestRequest",
    "AICredentialTestResult",
    "AICredentialUpdateRequest",
]
