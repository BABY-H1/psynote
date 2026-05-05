"""
``ai_credentials`` system_admin router — ``/api/ai-credentials``.

只有 ``user.is_system_admin`` 才能调用。可以管理 platform scope + 任意 org scope 凭据。
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.credential_resolver import resolve_ai_credential
from app.api.v1.ai_credentials.schemas import (
    AICredentialCreateRequest,
    AICredentialPublic,
    AICredentialTestRequest,
    AICredentialTestResult,
    AICredentialUpdateRequest,
)
from app.api.v1.ai_credentials.services import (
    create_credential,
    soft_delete_credential,
    to_public,
    update_credential,
)
from app.core.database import get_db
from app.db.models.ai_credentials import AICredential
from app.lib.errors import ForbiddenError, NotFoundError, ValidationError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.auth import AuthUser, get_current_user

router = APIRouter()


def _require_system_admin(user: AuthUser) -> None:
    """仅 sysadmin."""
    if not user.is_system_admin:
        raise ForbiddenError("system_admin only")


@router.get("/", response_model=list[AICredentialPublic])
async def list_credentials(
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    scope: Annotated[str | None, Query()] = None,
    org_id: Annotated[str | None, Query(alias="orgId")] = None,
    provider: Annotated[str | None, Query()] = None,
    include_disabled: Annotated[bool, Query(alias="includeDisabled")] = False,
) -> list[AICredentialPublic]:
    """列出全部凭据 (可按 scope/orgId/provider 过滤)."""
    _require_system_admin(user)
    conds: list = []
    if scope:
        conds.append(AICredential.scope == scope)
    if org_id:
        conds.append(AICredential.scope_id == parse_uuid_or_raise(org_id, field="orgId"))
    if provider:
        conds.append(AICredential.provider == provider)
    if not include_disabled:
        conds.append(AICredential.is_disabled.is_(False))

    q = select(AICredential)
    if conds:
        q = q.where(and_(*conds))
    rows = (await db.execute(q)).scalars().all()
    return [to_public(c) for c in rows]


@router.post("/", response_model=AICredentialPublic, status_code=status.HTTP_201_CREATED)
async def create_credential_endpoint(
    body: AICredentialCreateRequest,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    scope: Annotated[str, Query()] = "platform",
    org_id: Annotated[str | None, Query(alias="orgId")] = None,
) -> AICredentialPublic:
    """sysadmin 创建凭据 — ``?scope=platform`` 或 ``?scope=org&orgId=...``."""
    _require_system_admin(user)
    scope_id_uuid: uuid.UUID | None = None
    if scope == "org":
        if not org_id:
            raise ValidationError("orgId is required when scope=org")
        scope_id_uuid = parse_uuid_or_raise(org_id, field="orgId")

    user_uuid = parse_uuid_or_raise(user.id, field="userId")
    record = await create_credential(
        db, scope=scope, scope_id=scope_id_uuid, body=body, created_by=user_uuid
    )
    return to_public(record)


@router.patch("/{credential_id}", response_model=AICredentialPublic)
async def update_credential_endpoint(
    credential_id: str,
    body: AICredentialUpdateRequest,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AICredentialPublic:
    _require_system_admin(user)
    record = await update_credential(db, credential_id=credential_id, body=body)
    return to_public(record)


@router.delete("/{credential_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_credential_endpoint(
    credential_id: str,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    _require_system_admin(user)
    await soft_delete_credential(db, credential_id=credential_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{credential_id}/test", response_model=AICredentialTestResult)
async def test_credential_endpoint(
    credential_id: str,
    body: AICredentialTestRequest,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AICredentialTestResult:
    """sysadmin 测试凭据连通 — Phase 3 stub: resolve + decrypt 成功就算 ok."""
    _require_system_admin(user)
    cid = parse_uuid_or_raise(credential_id, field="credentialId")
    q = select(AICredential).where(AICredential.id == cid).limit(1)
    record = (await db.execute(q)).scalar_one_or_none()
    if record is None:
        raise NotFoundError("AICredential", credential_id)
    # 用 resolver 走真实 fallback chain (验证整条链)
    try:
        await resolve_ai_credential(
            db,
            org_id=record.scope_id if record.scope == "org" else None,
            provider=record.provider,
        )
        _ = body.test_prompt  # Phase 5 真打 ping
        return AICredentialTestResult(
            success=True, message="Credential resolved + decrypted OK (Phase 3 stub)", latency_ms=0
        )
    except Exception as exc:
        return AICredentialTestResult(success=False, message=str(exc), latency_ms=None)


__all__ = ["router"]
