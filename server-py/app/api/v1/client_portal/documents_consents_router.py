"""Client portal documents + consents + referrals router.

镜像 ``server/src/modules/client-portal/client-documents-consents.routes.ts``:

  GET    /documents                       列我的文书
  GET    /documents/{doc_id}              文书详情
  POST   /documents/{doc_id}/sign         签字 (含 signer_on_behalf_of 监护人代签)
  GET    /consents                        列同意书状态
  POST   /consents/{consent_id}/revoke    撤销同意
  GET    /referrals                       列待我同意的转介
  POST   /referrals/{referral_id}/consent 转介客户同意 / 拒绝

监护人:
  /documents{,/{id},/sign} 与 /consents{,/{id}/revoke} 接受 ?as= (代签)
  /referrals + /referrals/{}/consent **拒绝** ?as= (跨 org 转介必须本人决定)

self_only: 文书 / 同意 / 转介 全部强 ``client_id == target/caller_uuid`` 过滤,
ownership 不通过则当成不存在 (与 Node ``Unauthorized`` 等价).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.client_portal.schemas import ReferralConsentBody, SignDocumentBody
from app.api.v1.client_portal.shared import reject_as_param, resolve_target_user_id
from app.core.database import get_db
from app.db.models.client_documents import ClientDocument
from app.db.models.consent_records import ConsentRecord
from app.db.models.referrals import Referral
from app.lib.errors import ValidationError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


def _doc_to_dict(d: ClientDocument) -> dict[str, Any]:
    return {
        "id": str(d.id),
        "orgId": str(d.org_id),
        "clientId": str(d.client_id),
        "careEpisodeId": str(d.care_episode_id) if d.care_episode_id else None,
        "templateId": str(d.template_id) if d.template_id else None,
        "title": d.title,
        "content": d.content,
        "docType": d.doc_type,
        "consentType": d.consent_type,
        "recipientType": d.recipient_type,
        "recipientName": d.recipient_name,
        "status": d.status,
        "signedAt": d.signed_at.isoformat() if d.signed_at else None,
        "signatureData": d.signature_data,
        "filePath": d.file_path,
    }


def _consent_to_dict(c: ConsentRecord) -> dict[str, Any]:
    return {
        "id": str(c.id),
        "orgId": str(c.org_id),
        "clientId": str(c.client_id),
        "consentType": c.consent_type,
        "scope": c.scope,
        "grantedAt": c.granted_at.isoformat() if c.granted_at else None,
        "revokedAt": c.revoked_at.isoformat() if c.revoked_at else None,
        "expiresAt": c.expires_at.isoformat() if c.expires_at else None,
        "documentId": str(c.document_id) if c.document_id else None,
        "signerOnBehalfOf": str(c.signer_on_behalf_of) if c.signer_on_behalf_of else None,
        "status": c.status,
    }


def _referral_to_dict(r: Referral) -> dict[str, Any]:
    return {
        "id": str(r.id),
        "orgId": str(r.org_id),
        "careEpisodeId": str(r.care_episode_id),
        "clientId": str(r.client_id),
        "referredBy": str(r.referred_by),
        "reason": r.reason,
        "riskSummary": r.risk_summary,
        "status": r.status,
        "mode": r.mode,
    }


# ─── GET /documents ────────────────────────────────────────────


@router.get("/documents")
async def list_documents(
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict[str, Any]]:
    """guardian-readable. self_only: client_id == target_uuid."""
    assert org is not None
    target_uuid = await resolve_target_user_id(request, user, org, db)
    org_uuid = parse_uuid_or_raise(org.org_id, field="orgId")

    q = select(ClientDocument).where(
        and_(
            ClientDocument.org_id == org_uuid,
            ClientDocument.client_id == target_uuid,
        )
    )
    rows = list((await db.execute(q)).scalars().all())
    return [_doc_to_dict(d) for d in rows]


# ─── GET /documents/{doc_id} ───────────────────────────────────


@router.get("/documents/{doc_id}")
async def get_document(
    doc_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """guardian-readable. ownership 不匹配抛 ValidationError (与 Node 一致)."""
    assert org is not None
    target_uuid = await resolve_target_user_id(request, user, org, db)
    doc_uuid = parse_uuid_or_raise(doc_id, field="docId")

    q = select(ClientDocument).where(ClientDocument.id == doc_uuid).limit(1)
    doc = (await db.execute(q)).scalar_one_or_none()
    if doc is None or doc.client_id != target_uuid:
        raise ValidationError("Unauthorized")
    return _doc_to_dict(doc)


# ─── POST /documents/{doc_id}/sign ─────────────────────────────


@router.post("/documents/{doc_id}/sign")
async def sign_document(
    doc_id: str,
    body: SignDocumentBody,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """guardian-readable + 代签. signer_on_behalf_of: 当代签时填 caller (家长) 的 user_id."""
    assert org is not None
    caller_uuid = parse_uuid_or_raise(user.id, field="userId")
    target_uuid = await resolve_target_user_id(request, user, org, db)
    doc_uuid = parse_uuid_or_raise(doc_id, field="docId")
    signer_on_behalf_of = caller_uuid if target_uuid != caller_uuid else None

    q = select(ClientDocument).where(ClientDocument.id == doc_uuid).limit(1)
    doc = (await db.execute(q)).scalar_one_or_none()
    if doc is None or doc.client_id != target_uuid:
        raise ValidationError("Unauthorized")

    now = datetime.now(UTC)
    doc.status = "signed"
    doc.signed_at = now
    doc.signature_data = {
        "name": body.name,
        "ip": request.client.host if request.client else None,
        "userAgent": request.headers.get("user-agent"),
        "timestamp": now.isoformat(),
        "signerOnBehalfOf": str(signer_on_behalf_of) if signer_on_behalf_of else None,
    }

    # 同时建一行 consent_records 留证 (与 Node consentService.signDocument 行为一致)
    consent = ConsentRecord(
        org_id=doc.org_id,
        client_id=doc.client_id,
        consent_type=doc.consent_type or "treatment",
        document_id=doc.id,
        granted_at=now,
        signer_on_behalf_of=signer_on_behalf_of,
        status="active",
    )
    db.add(consent)
    await db.flush()
    await db.commit()

    await record_audit(
        db=db,
        org_id=str(doc.org_id),
        user_id=user.id,
        action="create",
        resource="consent_records",
        resource_id=str(consent.id),
        ip_address=request.client.host if request.client else None,
    )
    return _doc_to_dict(doc)


# ─── GET /consents ─────────────────────────────────────────────


@router.get("/consents")
async def list_consents(
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict[str, Any]]:
    """guardian-readable."""
    assert org is not None
    target_uuid = await resolve_target_user_id(request, user, org, db)
    org_uuid = parse_uuid_or_raise(org.org_id, field="orgId")

    q = select(ConsentRecord).where(
        and_(
            ConsentRecord.org_id == org_uuid,
            ConsentRecord.client_id == target_uuid,
        )
    )
    rows = list((await db.execute(q)).scalars().all())
    return [_consent_to_dict(c) for c in rows]


# ─── POST /consents/{consent_id}/revoke ────────────────────────


@router.post("/consents/{consent_id}/revoke")
async def revoke_consent(
    consent_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """guardian-readable + 代撤. 强 ownership."""
    assert org is not None
    target_uuid = await resolve_target_user_id(request, user, org, db)
    consent_uuid = parse_uuid_or_raise(consent_id, field="consentId")

    q = select(ConsentRecord).where(ConsentRecord.id == consent_uuid).limit(1)
    rec = (await db.execute(q)).scalar_one_or_none()
    if rec is None or rec.client_id != target_uuid:
        raise ValidationError("Unauthorized")

    rec.status = "revoked"
    rec.revoked_at = datetime.now(UTC)
    await db.commit()

    await record_audit(
        db=db,
        org_id=str(rec.org_id),
        user_id=user.id,
        action="update",
        resource="consent_records",
        resource_id=str(rec.id),
        ip_address=request.client.host if request.client else None,
    )
    return _consent_to_dict(rec)


# ─── GET /referrals ────────────────────────────────────────────


@router.get("/referrals")
async def list_referrals(
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict[str, Any]]:
    """guardian-blocked. self_only: client_id == caller_uuid + status='pending'."""
    reject_as_param(request, user)
    assert org is not None
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    q = select(Referral).where(
        and_(
            Referral.client_id == user_uuid,
            Referral.status == "pending",
        )
    )
    rows = list((await db.execute(q)).scalars().all())
    return [_referral_to_dict(r) for r in rows]


# ─── POST /referrals/{referral_id}/consent ─────────────────────


@router.post("/referrals/{referral_id}/consent")
async def consent_referral(
    referral_id: str,
    body: ReferralConsentBody,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """guardian-blocked. 客户同意: status → 'consented', consented_at = now;
    拒绝: 'rejected'. self_only: ownership 强校验.
    """
    reject_as_param(request, user)
    assert org is not None
    user_uuid = parse_uuid_or_raise(user.id, field="userId")
    ref_uuid = parse_uuid_or_raise(referral_id, field="referralId")

    q = select(Referral).where(Referral.id == ref_uuid).limit(1)
    ref = (await db.execute(q)).scalar_one_or_none()
    if ref is None or ref.client_id != user_uuid:
        raise ValidationError("Unauthorized")

    now = datetime.now(UTC)
    if body.consent:
        ref.status = "consented"
        ref.consented_at = now
    else:
        ref.status = "rejected"
        ref.rejected_at = now
        ref.rejection_reason = "客户拒绝同意"
    await db.commit()

    await record_audit(
        db=db,
        org_id=str(ref.org_id),
        user_id=user.id,
        action="update",
        resource="referrals",
        resource_id=str(ref.id),
        changes={"status": {"old": "pending", "new": ref.status}},
        ip_address=request.client.host if request.client else None,
    )
    _ = status  # ensure status import not flagged unused
    return _referral_to_dict(ref)


__all__ = ["router"]
