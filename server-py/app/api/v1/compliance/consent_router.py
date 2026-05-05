"""
Consent router — 镜像 ``server/src/modules/compliance/consent.routes.ts`` (111 行) +
``consent.service.ts`` (238 行).

挂在 ``/api/orgs/{org_id}`` (sub-paths /consent-templates 和 /consent-documents):

Templates (admin/counselor):
  GET    /consent-templates              列表
  POST   /consent-templates              创建
  PATCH  /consent-templates/{id}         更新 (org-ownership 校验)
  DELETE /consent-templates/{id}         删除

Documents (admin/counselor):
  POST   /consent-documents              发送给客户
  GET    /consent-documents              列表
  GET    /consent-documents/{id}         详情

业务逻辑 inline (与 Node 拆 service 对应; 简单 CRUD 不再额外抽 service.py)。
代签流程 (signer_on_behalf_of) 主要由 client_portal 调; 这里只导出 ``sign_document``
helper 给测试 / 复用。
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.compliance.schemas import (
    ConsentDocumentCreateInput,
    ConsentDocumentOutput,
    ConsentTemplateCreateInput,
    ConsentTemplateOutput,
    ConsentTemplateUpdateInput,
)
from app.core.database import get_db
from app.db.models.care_timeline import CareTimeline
from app.db.models.client_documents import ClientDocument
from app.db.models.consent_records import ConsentRecord
from app.db.models.consent_templates import ConsentTemplate
from app.lib.errors import ForbiddenError, NotFoundError, ValidationError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


# ─── 工具 ─────────────────────────────────────────────────────────


def _require_org(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    return org


def _require_admin_or_counselor(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.role not in ("org_admin", "counselor"):
        raise ForbiddenError("insufficient_role")
    return org


def _template_to_output(t: ConsentTemplate) -> ConsentTemplateOutput:
    return ConsentTemplateOutput(
        id=str(t.id),
        org_id=str(t.org_id) if t.org_id else None,
        title=t.title,
        consent_type=t.consent_type,
        content=t.content,
        visibility=t.visibility or "personal",
        allowed_org_ids=list(t.allowed_org_ids or []),
        created_by=str(t.created_by) if t.created_by else None,
        created_at=getattr(t, "created_at", None),
        updated_at=getattr(t, "updated_at", None),
    )


def _doc_to_output(d: ClientDocument) -> ConsentDocumentOutput:
    return ConsentDocumentOutput(
        id=str(d.id),
        org_id=str(d.org_id),
        client_id=str(d.client_id),
        care_episode_id=str(d.care_episode_id) if d.care_episode_id else None,
        template_id=str(d.template_id) if d.template_id else None,
        title=d.title,
        content=d.content,
        doc_type=d.doc_type,
        consent_type=d.consent_type,
        recipient_type=d.recipient_type or "client",
        recipient_name=d.recipient_name,
        status=d.status or "pending",
        signed_at=d.signed_at,
        signature_data=d.signature_data,
        file_path=d.file_path,
        created_by=str(d.created_by) if d.created_by else None,
        created_at=getattr(d, "created_at", None),
    )


async def _assert_template_owned_by_org(
    db: AsyncSession, template_id: uuid.UUID, org_id: uuid.UUID
) -> ConsentTemplate:
    """库项跨机构所有权校验 — 镜像 ``library-ownership.ts:assertLibraryItemOwnedByOrg``.

    防止恶意改/删别机构 template。匹配条件: id=template_id AND org_id=org_id。
    """
    q = (
        select(ConsentTemplate)
        .where(and_(ConsentTemplate.id == template_id, ConsentTemplate.org_id == org_id))
        .limit(1)
    )
    row = (await db.execute(q)).scalar_one_or_none()
    if row is None:
        raise NotFoundError("ConsentTemplate", str(template_id))
    return row


# ─── Templates ────────────────────────────────────────────────────


@router.get("/consent-templates", response_model=list[ConsentTemplateOutput])
async def list_templates_route(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ConsentTemplateOutput]:
    """``GET /consent-templates`` 列表 (镜像 routes.ts:19-21 + service.ts:10-16)."""
    _require_org(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    q = (
        select(ConsentTemplate)
        .where(ConsentTemplate.org_id == org_uuid)
        .order_by(desc(ConsentTemplate.updated_at))
    )
    rows = list((await db.execute(q)).scalars().all())
    return [_template_to_output(t) for t in rows]


@router.post(
    "/consent-templates",
    response_model=ConsentTemplateOutput,
    status_code=status.HTTP_201_CREATED,
)
async def create_template_route(
    org_id: str,
    body: ConsentTemplateCreateInput,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ConsentTemplateOutput:
    """``POST /consent-templates`` 创建 — admin/counselor (镜像 routes.ts:23-43)."""
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    template = ConsentTemplate(
        org_id=org_uuid,
        title=body.title,
        consent_type=body.consent_type,
        content=body.content,
        created_by=user_uuid,
    )
    db.add(template)
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="create",
        resource="consent_templates",
        resource_id=str(template.id),
        ip_address=request.client.host if request.client else None,
    )
    return _template_to_output(template)


@router.patch("/consent-templates/{template_id}", response_model=ConsentTemplateOutput)
async def update_template_route(
    org_id: str,
    template_id: str,
    body: ConsentTemplateUpdateInput,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ConsentTemplateOutput:
    """``PATCH /consent-templates/{id}`` 更新 (镜像 routes.ts:45-56)."""
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    tid = parse_uuid_or_raise(template_id, field="templateId")
    template = await _assert_template_owned_by_org(db, tid, org_uuid)

    updates = body.model_dump(exclude_unset=True, by_alias=False)
    for k, v in updates.items():
        if v is not None:
            setattr(template, k, v)
    template.updated_at = datetime.now(UTC)
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="consent_templates",
        resource_id=template_id,
        ip_address=request.client.host if request.client else None,
    )
    return _template_to_output(template)


@router.delete("/consent-templates/{template_id}")
async def delete_template_route(
    org_id: str,
    template_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, bool]:
    """``DELETE /consent-templates/{id}`` (镜像 routes.ts:58-68)."""
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    tid = parse_uuid_or_raise(template_id, field="templateId")
    template = await _assert_template_owned_by_org(db, tid, org_uuid)

    await db.delete(template)
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="delete",
        resource="consent_templates",
        resource_id=template_id,
        ip_address=request.client.host if request.client else None,
    )
    return {"success": True}


# ─── Documents ───────────────────────────────────────────────────


@router.post(
    "/consent-documents",
    response_model=ConsentDocumentOutput,
    status_code=status.HTTP_201_CREATED,
)
async def send_document_route(
    org_id: str,
    body: ConsentDocumentCreateInput,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ConsentDocumentOutput:
    """``POST /consent-documents`` 发送同意书 (镜像 routes.ts:72-100 + service.ts:56-102).

    关键校验:
      - recipient_type ∈ {'client', 'guardian'}
      - recipient_type='guardian' 时 recipient_name 必填
      - guardian-recipient: 状态直接 'issued' (无客户端签署流, 线下交付家长)
      - client-recipient (默认): 状态 'pending' (等客户端签)
    """
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    recipient_type = body.recipient_type or "client"
    if recipient_type not in ("client", "guardian"):
        raise ValidationError("recipientType 必须是 client 或 guardian")
    if recipient_type == "guardian" and not (body.recipient_name or "").strip():
        raise ValidationError("发给家长/监护人时,recipientName 必填")

    client_uuid = parse_uuid_or_raise(body.client_id, field="clientId")
    template_uuid = parse_uuid_or_raise(body.template_id, field="templateId")
    ep_uuid = (
        parse_uuid_or_raise(body.care_episode_id, field="careEpisodeId")
        if body.care_episode_id
        else None
    )

    # Load template
    tq = select(ConsentTemplate).where(ConsentTemplate.id == template_uuid).limit(1)
    template = (await db.execute(tq)).scalar_one_or_none()
    if template is None:
        raise NotFoundError("ConsentTemplate", str(template_uuid))

    doc_status = "issued" if recipient_type == "guardian" else "pending"
    doc = ClientDocument(
        org_id=org_uuid,
        client_id=client_uuid,
        care_episode_id=ep_uuid,
        template_id=template_uuid,
        title=template.title,
        content=template.content,
        doc_type="consent",
        consent_type=template.consent_type,
        recipient_type=recipient_type,
        recipient_name=body.recipient_name if recipient_type == "guardian" else None,
        status=doc_status,
        created_by=user_uuid,
    )
    db.add(doc)
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="create",
        resource="client_documents",
        resource_id=str(doc.id),
        ip_address=request.client.host if request.client else None,
    )
    return _doc_to_output(doc)


@router.get("/consent-documents", response_model=list[ConsentDocumentOutput])
async def list_documents_route(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    client_id: Annotated[str | None, Query(alias="clientId")] = None,
    status_q: Annotated[str | None, Query(alias="status")] = None,
    care_episode_id: Annotated[str | None, Query(alias="careEpisodeId")] = None,
) -> list[ConsentDocumentOutput]:
    """``GET /consent-documents`` 列表 (镜像 routes.ts:102-105 + service.ts:104-118)."""
    _require_org(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")

    conds: list[Any] = [ClientDocument.org_id == org_uuid]
    if client_id:
        conds.append(ClientDocument.client_id == parse_uuid_or_raise(client_id, field="clientId"))
    if status_q:
        conds.append(ClientDocument.status == status_q)
    if care_episode_id:
        conds.append(
            ClientDocument.care_episode_id
            == parse_uuid_or_raise(care_episode_id, field="careEpisodeId")
        )

    q = select(ClientDocument).where(and_(*conds)).order_by(desc(ClientDocument.created_at))
    rows = list((await db.execute(q)).scalars().all())
    return [_doc_to_output(d) for d in rows]


@router.get("/consent-documents/{doc_id}", response_model=ConsentDocumentOutput)
async def get_document_route(
    org_id: str,
    doc_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ConsentDocumentOutput:
    """``GET /consent-documents/{id}`` 详情 (镜像 routes.ts:107-110 + service.ts:120-128)."""
    _require_org(org)
    did = parse_uuid_or_raise(doc_id, field="docId")
    q = select(ClientDocument).where(ClientDocument.id == did).limit(1)
    doc = (await db.execute(q)).scalar_one_or_none()
    if doc is None:
        raise NotFoundError("ClientDocument", doc_id)
    return _doc_to_output(doc)


# ─── 共享 helper: sign_document ───────────────────────────────────
# 由 client_portal / 测试调用. 不暴露 router 端点 (consent.routes.ts 自身不暴露
# sign endpoint, signing 流走 client_portal.routes.ts)。但 service 层逻辑必须
# 在 compliance 域内, 与 Node 一致。


async def sign_document(
    db: AsyncSession,
    *,
    doc_id: uuid.UUID,
    client_id: uuid.UUID,
    name: str,
    ip: str | None = None,
    user_agent: str | None = None,
    signer_on_behalf_of: uuid.UUID | None = None,
) -> ConsentDocumentOutput:
    """文书签署 (镜像 service.ts:147-209).

    Phase 14 关键: ``signer_on_behalf_of`` 不为空时, 是家长代孩子签:
      - signature_data 含 ``signerOnBehalfOf``
      - consent_records.signer_on_behalf_of 记下家长 user.id (audit 链)
      - care_timeline 标题加 "(家长代签)" 后缀
      - timeline.created_by 用 ``signer_on_behalf_of`` (实际操作人是家长)

    校验:
      - doc 必须存在
      - doc.client_id == client_id (不能代别的来访者签)
      - doc.status='pending' (避免重复签)
    """
    q = select(ClientDocument).where(ClientDocument.id == doc_id).limit(1)
    doc = (await db.execute(q)).scalar_one_or_none()
    if doc is None:
        raise NotFoundError("ClientDocument", str(doc_id))
    if doc.client_id != client_id:
        raise ValidationError("Unauthorized")
    if doc.status != "pending":
        raise ValidationError("Document already processed")

    now = datetime.now(UTC)
    signature_data: dict[str, Any] = {
        "name": name,
        "ip": ip,
        "userAgent": user_agent,
        "timestamp": now.isoformat(),
    }
    if signer_on_behalf_of:
        signature_data["signerOnBehalfOf"] = str(signer_on_behalf_of)

    doc.status = "signed"
    doc.signed_at = now
    doc.signature_data = signature_data

    if doc.consent_type:
        record = ConsentRecord(
            org_id=doc.org_id,
            client_id=client_id,
            consent_type=doc.consent_type,
            scope={},
            granted_at=now,
            document_id=doc_id,
            status="active",
            signer_on_behalf_of=signer_on_behalf_of,
        )
        db.add(record)

    if doc.care_episode_id:
        title = "知情同意书已签署 (家长代签)" if signer_on_behalf_of else "知情同意书已签署"
        timeline = CareTimeline(
            care_episode_id=doc.care_episode_id,
            event_type="document",
            ref_id=doc_id,
            title=title,
            summary=doc.title,
            metadata_={
                "consentType": doc.consent_type,
                "signedAt": now.isoformat(),
                "signerOnBehalfOf": str(signer_on_behalf_of) if signer_on_behalf_of else None,
            },
            created_by=signer_on_behalf_of or client_id,
        )
        db.add(timeline)

    await db.commit()
    return _doc_to_output(doc)


__all__ = ["router", "sign_document"]
