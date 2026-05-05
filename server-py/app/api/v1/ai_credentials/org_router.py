"""
``ai_credentials`` org-scoped router — ``/api/orgs/{org_id}/ai-credentials``.

权限矩阵 enforce:
  - org_admin: list / get / create / patch / delete (本 org 凭据)
  - counselor: 仅 GET /status (查"已配置/未配置"), 不返回明文 hint
  - client: 完全不可见 (403)
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
    AICredentialStatus,
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
from app.lib.errors import ForbiddenError, NotFoundError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.role_guards import require_admin, require_admin_or_counselor

router = APIRouter()


def _require_org_admin(org: OrgContext | None) -> OrgContext:
    return require_admin(org, insufficient_message="org_admin only")


def _require_admin_or_counselor(org: OrgContext | None) -> OrgContext:
    # client → 'client cannot view credentials'; 其他 non-admin/non-counselor → 'insufficient_role'.
    # 因为不同 role 需要不同 message, 这里保留两段判断.
    if org is not None and org.role == "client":
        raise ForbiddenError("client cannot view credentials")
    return require_admin_or_counselor(org)


@router.get("/status", response_model=AICredentialStatus)
async def get_status(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    provider: Annotated[str, Query()] = "openai-compatible",
) -> AICredentialStatus:
    """counselor / admin 都能看 — 仅返"已配置/未配置" 2-state."""
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")

    # org-level
    q_org = (
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
    org_cred = (await db.execute(q_org)).scalar_one_or_none()

    # platform-level fallback
    q_plat = (
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
    plat_cred = (await db.execute(q_plat)).scalar_one_or_none()

    chosen = org_cred or plat_cred
    return AICredentialStatus(
        org_id=org_id,
        has_org_credential=org_cred is not None,
        has_platform_fallback=plat_cred is not None,
        provider=chosen.provider if chosen else None,
        data_residency=chosen.data_residency if chosen else None,
        model=chosen.model if chosen else None,
    )


@router.get("/", response_model=list[AICredentialPublic])
async def list_credentials(
    org_id: str,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    include_disabled: Annotated[bool, Query(alias="includeDisabled")] = False,
) -> list[AICredentialPublic]:
    """org_admin 列出本 org 凭据."""
    _require_org_admin(org)
    _ = user
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")

    conds: list = [AICredential.scope == "org", AICredential.scope_id == org_uuid]
    if not include_disabled:
        conds.append(AICredential.is_disabled.is_(False))

    q = select(AICredential).where(and_(*conds))
    rows = (await db.execute(q)).scalars().all()
    return [to_public(c) for c in rows]


@router.post("/", response_model=AICredentialPublic, status_code=status.HTTP_201_CREATED)
async def create_credential_endpoint(
    org_id: str,
    body: AICredentialCreateRequest,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AICredentialPublic:
    """org_admin 创建本 org 凭据."""
    _require_org_admin(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    record = await create_credential(
        db, scope="org", scope_id=org_uuid, body=body, created_by=user_uuid
    )
    return to_public(record)


@router.patch("/{credential_id}", response_model=AICredentialPublic)
async def update_credential_endpoint(
    org_id: str,
    credential_id: str,
    body: AICredentialUpdateRequest,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AICredentialPublic:
    """org_admin 改本 org 凭据 (轮换 / 改 model / 改 default)."""
    _require_org_admin(org)
    _ = user
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    record = await update_credential(
        db,
        credential_id=credential_id,
        body=body,
        expected_scope="org",
        expected_scope_id=org_uuid,
    )
    return to_public(record)


@router.delete("/{credential_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_credential_endpoint(
    org_id: str,
    credential_id: str,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    _require_org_admin(org)
    _ = user
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    await soft_delete_credential(
        db, credential_id=credential_id, expected_scope="org", expected_scope_id=org_uuid
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{credential_id}/test", response_model=AICredentialTestResult)
async def test_credential_endpoint(
    org_id: str,
    credential_id: str,
    body: AICredentialTestRequest,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AICredentialTestResult:
    """org_admin 测试本 org 凭据."""
    _require_org_admin(org)
    _ = user
    cid = parse_uuid_or_raise(credential_id, field="credentialId")
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")

    q = select(AICredential).where(AICredential.id == cid).limit(1)
    record = (await db.execute(q)).scalar_one_or_none()
    if record is None:
        raise NotFoundError("AICredential", credential_id)
    # 越权: 不是本 org 的
    if record.scope != "org" or record.scope_id != org_uuid:
        raise NotFoundError("AICredential", credential_id)

    try:
        await resolve_ai_credential(db, org_id=org_uuid, provider=record.provider)
        _ = body.test_prompt
        return AICredentialTestResult(
            success=True, message="Credential resolved + decrypted OK (Phase 3 stub)", latency_ms=0
        )
    except Exception as exc:
        return AICredentialTestResult(success=False, message=str(exc), latency_ms=None)


def _validate_uuid_for_scope_id(scope_id: str | None) -> uuid.UUID | None:
    if scope_id is None:
        return None
    return parse_uuid_or_raise(scope_id)


__all__ = ["router"]
