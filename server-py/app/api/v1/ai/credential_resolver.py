"""
AI 凭据 resolver — BYOK fallback chain + PHI 出境合规拦截。

业务流程 (每次 pipeline 调 LLM 前):

  1. 查 ``ai_credentials`` 表, fallback chain:
     a. ``scope='org' AND scope_id=org_id AND provider=X AND is_default=true AND NOT is_disabled``
     b. ``scope='platform' AND provider=X AND is_default=true AND NOT is_disabled``

  2. 都没查到 → ``ConfigurationError`` (实际复用 ``ValidationError`` 400)

  3. PHI 出境合规拦截 (org scope):
     - 读 ``organizations.settings`` JSONB, 取 ``consentsToPhiExport`` (默认 False)
     - 凭据 ``data_residency='global'`` AND ``consentsToPhiExport != True`` → ``PHIComplianceError``
     - ``data_residency='cn'`` 一律放行
     - 注: Phase 7+ 可能加专门的 ``organizations.consents_to_phi_export`` 列, 现在用 settings JSONB

  4. 解密 ``encrypted_key`` (AES-256-GCM, AAD 绑死 scope+scope_id)

  5. 返回 ``ResolvedCredential`` (api_key 明文 + base_url + model + data_residency + credential_id)

⚠ 关键约束:
  - PHI 拦截必须在 resolver 内, 不能让 pipeline caller 自己记得调
  - 解密失败 (CryptoError) 不要 fallback 到下一个 — 静默 fallback 会掩盖密钥配置错误
  - last_used_at 更新 (Phase 5+ 后) 暂不在 resolver 做 (异步 / 非阻塞), 避免每次 AI 调都
    多走一次 DB write — 由 usage_tracker 统计已经够用

测试 (``tests/api/v1/ai/test_resolver.py``):
  - org 凭据存在: 返回 org 凭据
  - org 不存在 + platform 存在: fallback 到 platform
  - 都不存在: ValidationError
  - org 凭据 data_residency='global' + 出境同意=False: PHIComplianceError
  - org 凭据 data_residency='global' + 出境同意=True: 放行
  - org 凭据 data_residency='cn': 一律放行 (无视 consent)
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.ai_credentials import AICredential
from app.db.models.organizations import Organization
from app.lib.crypto import decrypt
from app.lib.errors import PHIComplianceError, ValidationError


@dataclass(frozen=True)
class ResolvedCredential:
    """resolver 返回值 — 路由层 / pipeline 用此 4 字段调 provider。"""

    api_key: str  # 明文 (resolver 解密后)
    base_url: str
    model: str
    data_residency: str  # 'cn' | 'global'
    credential_id: uuid.UUID
    scope: str  # 'platform' | 'org' (用于审计 + 调试)


# ── Provider 枚举 ────────────────────────────────────────────────

# 业务约定 (与 Drizzle ai_credentials.provider 行) — Phase 3 阶段统一走 'openai-compatible'
DEFAULT_PROVIDER = "openai-compatible"


# ── 内部 helper ──────────────────────────────────────────────────


async def _load_org_settings(db: AsyncSession, org_id: uuid.UUID) -> dict[str, Any]:
    """读 organizations.settings JSONB, 不存在 / NULL 返 {}。"""
    q = select(Organization.settings).where(Organization.id == org_id).limit(1)
    settings = (await db.execute(q)).scalar()
    if not settings:
        return {}
    if isinstance(settings, dict):
        return settings
    return {}


def _check_phi_residency(cred_residency: str, org_settings: dict[str, Any]) -> None:
    """PHI 出境合规拦截 — global provider 必须 org settings 里显式同意。

    Args:
        cred_residency: ``ai_credentials.data_residency`` ('cn' | 'global')
        org_settings: ``organizations.settings`` JSONB

    Raises:
        PHIComplianceError: data_residency='global' 但 consentsToPhiExport 未声明 True。
    """
    if cred_residency == "cn":
        return  # 境内 provider 一律放行
    # global / 其他: 必须 org 显式同意
    consent = bool(org_settings.get("consentsToPhiExport", False))
    if not consent:
        raise PHIComplianceError(
            "Org 未声明 PHI 出境同意 (settings.consentsToPhiExport != true), "
            "不能调用境外 AI provider"
        )


# ── 主入口 ──────────────────────────────────────────────────────


async def resolve_ai_credential(
    db: AsyncSession,
    *,
    org_id: uuid.UUID | str | None,
    provider: str = DEFAULT_PROVIDER,
) -> ResolvedCredential:
    """resolve fallback chain + PHI residency 拦截 + 解密。

    Args:
        db: SQLAlchemy AsyncSession
        org_id: 组织 ID (str 自动转 UUID); None / 全局任务 → 跳过 org 层, 直查 platform
        provider: ai_credentials.provider 字符串 (默认 'openai-compatible')

    Returns:
        ResolvedCredential — api_key 明文 + base_url + model 等。

    Raises:
        ValidationError: 没有任何 active 凭据可用 (org 和 platform 都没配)
        PHIComplianceError: 凭据是境外 + org 未同意出境
        CryptoError: 加密 key 损坏 / 主密钥配置错 / AAD 不一致
    """
    # 标准化 org_id 为 UUID
    if isinstance(org_id, str):
        org_uuid: uuid.UUID | None
        try:
            org_uuid = uuid.UUID(org_id)
        except ValueError as exc:
            raise ValidationError("orgId 不是合法 UUID") from exc
    else:
        org_uuid = org_id

    # 1. 优先查 org 凭据
    org_cred: AICredential | None = None
    if org_uuid is not None:
        q = (
            select(AICredential)
            .where(
                and_(
                    AICredential.scope == "org",
                    AICredential.scope_id == org_uuid,
                    AICredential.provider == provider,
                    AICredential.is_default.is_(True),
                    AICredential.is_disabled.is_(False),
                )
            )
            .limit(1)
        )
        org_cred = (await db.execute(q)).scalar_one_or_none()

    # 2. fallback 到 platform
    chosen: AICredential | None = org_cred
    if chosen is None:
        q = (
            select(AICredential)
            .where(
                and_(
                    AICredential.scope == "platform",
                    AICredential.scope_id.is_(None),
                    AICredential.provider == provider,
                    AICredential.is_default.is_(True),
                    AICredential.is_disabled.is_(False),
                )
            )
            .limit(1)
        )
        chosen = (await db.execute(q)).scalar_one_or_none()

    # 3. 都没找到 → ConfigurationError (复用 ValidationError 400 表达"配置缺失")
    if chosen is None:
        raise ValidationError(
            f"AI provider '{provider}' is not configured for org={org_uuid} and "
            f"no platform fallback exists. Please configure ai_credentials."
        )

    # 4. PHI 出境合规拦截 (仅 org scope 才校验 — platform 调用通常不带 PHI 上下文)
    # platform 凭据被某 org 用时, 合规仍需校验 — 用调用方传入的 org_uuid 取 org settings
    if org_uuid is not None:
        org_settings = await _load_org_settings(db, org_uuid)
        _check_phi_residency(chosen.data_residency, org_settings)

    # 5. 解密 api_key (AAD 绑死 scope + scope_id)
    scope_id_for_aad = str(chosen.scope_id) if chosen.scope_id is not None else None
    api_key = decrypt(
        bytes(chosen.encrypted_key),
        bytes(chosen.encryption_iv),
        bytes(chosen.encryption_tag),
        chosen.scope,
        scope_id_for_aad,
    )

    return ResolvedCredential(
        api_key=api_key,
        base_url=chosen.base_url,
        model=chosen.model,
        data_residency=chosen.data_residency,
        credential_id=chosen.id,
        scope=chosen.scope,
    )


__all__ = [
    "DEFAULT_PROVIDER",
    "ResolvedCredential",
    "resolve_ai_credential",
]
