"""
``ai_credentials`` shared services — encrypt + persist + key hint helper.

权限矩阵在路由层 enforce, 这里只做"已通过权限的请求要做什么"的纯逻辑层。
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai_credentials.schemas import (
    AICredentialCreateRequest,
    AICredentialPublic,
    AICredentialUpdateRequest,
)
from app.db.models.ai_credentials import AICredential
from app.lib.crypto import encrypt
from app.lib.errors import NotFoundError, ValidationError
from app.lib.uuid_utils import parse_uuid_or_raise


def make_api_key_hint(api_key: str) -> str:
    """返回 'sk-...XYZW (32 chars)' 让 admin 视图识别 key 但不暴露明文。"""
    n = len(api_key)
    if n == 0:
        return "(empty)"
    if n <= 8:
        return f"({n} chars)"
    return f"{api_key[:3]}...{api_key[-4:]} ({n} chars)"


def to_public(c: AICredential, *, expose_hint: bool = True) -> AICredentialPublic:
    """ORM → public schema. ``expose_hint=False`` 用于 counselor 视图。

    注: 我们不能从加密 bytes 还原明文 — hint 需要在 create / rotate 时记下来或重新解密。
    这里 hint 总是空 (仅 create 时同步返回 hint, list/get 不含)。
    如果必须显示 hint, 让 admin 显式触发 decrypt+hint, 这是 deliberate UX。
    ``expose_hint`` 标志保留是为了 Phase 5+ 接入 admin "显示明文" 模式时不改 caller。
    """
    _ = expose_hint  # Phase 5+ 接入 decrypt-on-demand hint 时启用
    return AICredentialPublic(
        id=str(c.id),
        scope=c.scope,
        scope_id=str(c.scope_id) if c.scope_id else None,
        provider=c.provider,
        base_url=c.base_url,
        model=c.model,
        data_residency=c.data_residency,
        is_default=c.is_default,
        is_disabled=c.is_disabled,
        label=c.label,
        api_key_hint=None,
        created_at=getattr(c, "created_at", None),
        rotated_at=c.rotated_at,
        last_used_at=c.last_used_at,
        last_error_at=c.last_error_at,
    )


async def create_credential(
    db: AsyncSession,
    *,
    scope: str,
    scope_id: uuid.UUID | None,
    body: AICredentialCreateRequest,
    created_by: uuid.UUID,
) -> AICredential:
    """加密 api_key + INSERT ai_credentials. 如果 ``is_default=True`` 自动把同 (scope, scope_id, provider)
    其他行 ``is_default`` 置 False (维持 partial unique 索引不冲突)."""
    if scope not in ("platform", "org"):
        raise ValidationError(f"scope must be 'platform' or 'org', got {scope!r}")
    if scope == "org" and scope_id is None:
        raise ValidationError("scope_id is required when scope='org'")
    if scope == "platform" and scope_id is not None:
        raise ValidationError("scope_id must be NULL when scope='platform'")

    # 同 (scope, scope_id, provider) 已有 default → 把它降级
    if body.is_default:
        await _demote_existing_defaults(db, scope=scope, scope_id=scope_id, provider=body.provider)

    encrypted_key, iv, tag = encrypt(
        body.api_key,
        scope,
        str(scope_id) if scope_id else None,
    )
    record = AICredential(
        scope=scope,
        scope_id=scope_id,
        provider=body.provider,
        base_url=body.base_url,
        model=body.model,
        encrypted_key=encrypted_key,
        encryption_iv=iv,
        encryption_tag=tag,
        data_residency=body.data_residency,
        is_default=body.is_default,
        is_disabled=False,
        label=body.label,
        created_by=created_by,
    )
    db.add(record)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return record


async def update_credential(
    db: AsyncSession,
    *,
    credential_id: str,
    body: AICredentialUpdateRequest,
    expected_scope: str | None = None,
    expected_scope_id: uuid.UUID | None = None,
) -> AICredential:
    """部分更新. 路由层用 ``expected_scope`` 防 org admin 越权改 platform。

    ``api_key`` 提供 = 轮换 (重新加密 + 更新 ``rotated_at``)。
    ``is_default=True`` 提供 = 把同 (scope, scope_id, provider) 其他行 default 置 False。
    """
    cid = parse_uuid_or_raise(credential_id, field="credentialId")
    q = select(AICredential).where(AICredential.id == cid).limit(1)
    record = (await db.execute(q)).scalar_one_or_none()
    if record is None:
        raise NotFoundError("AICredential", credential_id)

    # 越权检查 (org admin 改 platform 行)
    if expected_scope is not None and record.scope != expected_scope:
        raise NotFoundError("AICredential", credential_id)  # 故意 404 防探测
    if expected_scope_id is not None and record.scope_id != expected_scope_id:
        raise NotFoundError("AICredential", credential_id)

    updates = body.model_dump(exclude_unset=True, by_alias=False)

    # api_key 轮换
    if updates.get("api_key"):
        new_key = updates.pop("api_key")
        encrypted_key, iv, tag = encrypt(
            new_key,
            record.scope,
            str(record.scope_id) if record.scope_id else None,
        )
        record.encrypted_key = encrypted_key
        record.encryption_iv = iv
        record.encryption_tag = tag
        record.rotated_at = datetime.now(UTC)
    else:
        updates.pop("api_key", None)

    # is_default=True → 降其他同 scope+provider 的 default
    if updates.get("is_default") is True:
        await _demote_existing_defaults(
            db,
            scope=record.scope,
            scope_id=record.scope_id,
            provider=record.provider,
            except_id=record.id,
        )

    for field_name, value in updates.items():
        setattr(record, field_name, value)

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return record


async def soft_delete_credential(
    db: AsyncSession,
    *,
    credential_id: str,
    expected_scope: str | None = None,
    expected_scope_id: uuid.UUID | None = None,
) -> None:
    """软删 — ``is_disabled=True`` (不直接 DELETE; 历史 ai_call_logs 仍能 join 上来)."""
    cid = parse_uuid_or_raise(credential_id, field="credentialId")
    q = select(AICredential).where(AICredential.id == cid).limit(1)
    record = (await db.execute(q)).scalar_one_or_none()
    if record is None:
        raise NotFoundError("AICredential", credential_id)
    if expected_scope is not None and record.scope != expected_scope:
        raise NotFoundError("AICredential", credential_id)
    if expected_scope_id is not None and record.scope_id != expected_scope_id:
        raise NotFoundError("AICredential", credential_id)
    record.is_disabled = True
    record.is_default = False  # disabled 不能是 default
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise


async def _demote_existing_defaults(
    db: AsyncSession,
    *,
    scope: str,
    scope_id: uuid.UUID | None,
    provider: str,
    except_id: uuid.UUID | None = None,
) -> None:
    """把同 (scope, scope_id, provider) 其他行 ``is_default`` 置 False."""
    conds: list[Any] = [
        AICredential.scope == scope,
        AICredential.provider == provider,
        AICredential.is_default.is_(True),
    ]
    if scope_id is None:
        conds.append(AICredential.scope_id.is_(None))
    else:
        conds.append(AICredential.scope_id == scope_id)
    if except_id is not None:
        conds.append(AICredential.id != except_id)

    stmt = update(AICredential).where(and_(*conds)).values(is_default=False)
    await db.execute(stmt)


__all__ = [
    "create_credential",
    "make_api_key_hint",
    "soft_delete_credential",
    "to_public",
    "update_credential",
]
