"""
Note template router — 镜像 ``server/src/modules/counseling/note-template.routes.ts`` (74 行)。

挂在 ``/api/orgs/{org_id}/note-templates`` prefix。

4 个 endpoint:

  GET    /                       — 列表 (含内置 SOAP/DAP/BIRP + 自定义 personal/org/public)
  POST   /                       — 创建 custom (admin/counselor)
  PATCH  /{template_id}          — 更新 (admin/counselor; ownership 检查)
  DELETE /{template_id}          — 删除 (admin/counselor; ownership 检查)

RBAC 守门:
  - 全 router rejectClient
  - POST/PATCH/DELETE require ``org_admin`` or ``counselor``
  - PATCH/DELETE 走 ``assertLibraryItemOwnedByOrg`` (note_templates.org_id == 当前 org
    或 NULL = 平台级)

内置模板 (BUILT_IN_FORMATS) — 不存 DB, 列表时直接拼:
  __soap__ / __dap__ / __birp__ (Phase 1 知识库决策, 与 Node 一致)
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import and_, delete, desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.counseling.schemas import (
    NoteTemplateCreateRequest,
    NoteTemplateOutput,
    NoteTemplateUpdateRequest,
    OkResponse,
)
from app.core.database import get_db
from app.db.models.note_templates import NoteTemplate
from app.lib.errors import ForbiddenError, NotFoundError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.role_guards import reject_client, require_admin_or_counselor

router = APIRouter()


# ─── 内置模板 (Node note-template.service.ts:7-46) ────────────


_BUILT_IN_FORMATS: list[NoteTemplateOutput] = [
    NoteTemplateOutput(
        id="__soap__",
        title="SOAP 笔记",
        format="soap",
        field_definitions=[
            {
                "key": "subjective",
                "label": "S - 主观资料",
                "placeholder": "来访者自述的感受、想法、问题...",
                "required": True,
                "order": 1,
            },
            {
                "key": "objective",
                "label": "O - 客观资料",
                "placeholder": "咨询师观察到的行为、表情、非语言信息...",
                "required": True,
                "order": 2,
            },
            {
                "key": "assessment",
                "label": "A - 评估分析",
                "placeholder": "临床评估、诊断印象、问题分析...",
                "required": True,
                "order": 3,
            },
            {
                "key": "plan",
                "label": "P - 计划",
                "placeholder": "下一步治疗计划、作业、随访安排...",
                "required": True,
                "order": 4,
            },
        ],
        is_default=True,
        visibility="public",
    ),
    NoteTemplateOutput(
        id="__dap__",
        title="DAP 笔记",
        format="dap",
        field_definitions=[
            {
                "key": "data",
                "label": "D - 资料",
                "placeholder": "主客观信息合并：来访者陈述 + 咨询师观察...",
                "required": True,
                "order": 1,
            },
            {
                "key": "assessment",
                "label": "A - 评估",
                "placeholder": "临床评估与分析...",
                "required": True,
                "order": 2,
            },
            {
                "key": "plan",
                "label": "P - 计划",
                "placeholder": "治疗计划与下一步安排...",
                "required": True,
                "order": 3,
            },
        ],
        is_default=False,
        visibility="public",
    ),
    NoteTemplateOutput(
        id="__birp__",
        title="BIRP 笔记",
        format="birp",
        field_definitions=[
            {
                "key": "behavior",
                "label": "B - 行为",
                "placeholder": "来访者在会谈中的行为表现...",
                "required": True,
                "order": 1,
            },
            {
                "key": "intervention",
                "label": "I - 干预",
                "placeholder": "咨询师使用的干预技术和方法...",
                "required": True,
                "order": 2,
            },
            {
                "key": "response",
                "label": "R - 反应",
                "placeholder": "来访者对干预的反应和回应...",
                "required": True,
                "order": 3,
            },
            {
                "key": "plan",
                "label": "P - 计划",
                "placeholder": "后续计划和安排...",
                "required": True,
                "order": 4,
            },
        ],
        is_default=False,
        visibility="public",
    ),
]


# ─── 工具 ─────────────────────────────────────────────────────────


def _reject_client(org: OrgContext | None) -> OrgContext:
    return reject_client(org, client_message="来访者请通过客户端门户访问")


def _require_admin_or_counselor(org: OrgContext | None) -> OrgContext:
    return require_admin_or_counselor(org)


def _template_to_output(t: NoteTemplate) -> NoteTemplateOutput:
    return NoteTemplateOutput(
        id=str(t.id),
        title=t.title,
        format=t.format,
        field_definitions=list(t.field_definitions) if t.field_definitions else [],
        is_default=bool(t.is_default),
        visibility=t.visibility or "personal",
        org_id=str(t.org_id) if t.org_id else None,
        created_by=str(t.created_by) if t.created_by else None,
        created_at=getattr(t, "created_at", None),
        updated_at=getattr(t, "updated_at", None),
    )


async def _assert_template_owned_by_org(
    db: AsyncSession, template_id: uuid.UUID, org_id: str
) -> None:
    """``assertLibraryItemOwnedByOrg`` 等价 — 只允许操作本机构的模板 (或平台级)。"""
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    q = select(NoteTemplate.org_id).where(NoteTemplate.id == template_id).limit(1)
    row = (await db.execute(q)).first()
    if row is None:
        raise NotFoundError("NoteTemplate", str(template_id))
    template_org_id = row[0]
    if template_org_id is not None and template_org_id != org_uuid:
        raise ForbiddenError("模板不属于当前机构")


# ─── GET / 列表 ──────────────────────────────────────────────────


@router.get("/", response_model=list[NoteTemplateOutput])
async def list_templates(
    org_id: str,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[NoteTemplateOutput]:
    """``GET /`` 列表 (镜像 routes.ts:18-20 + service.ts:48-63).

    返回: 内置 (SOAP/DAP/BIRP) + 自定义 (personal/organization/public 三种 visibility)。
    """
    _reject_client(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    q = (
        select(NoteTemplate)
        .where(
            or_(
                and_(
                    NoteTemplate.visibility == "personal",
                    NoteTemplate.created_by == user_uuid,
                ),
                and_(
                    NoteTemplate.visibility == "organization",
                    NoteTemplate.org_id == org_uuid,
                ),
                NoteTemplate.visibility == "public",
            )
        )
        .order_by(desc(NoteTemplate.updated_at))
    )
    custom = list((await db.execute(q)).scalars().all())
    return _BUILT_IN_FORMATS + [_template_to_output(t) for t in custom]


# ─── POST / 创建 ────────────────────────────────────────────────


@router.post("/", response_model=NoteTemplateOutput, status_code=status.HTTP_201_CREATED)
async def create_template(
    org_id: str,
    body: NoteTemplateCreateRequest,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> NoteTemplateOutput:
    """``POST /`` (admin/counselor). 镜像 routes.ts:23-44 + service.ts:65-87."""
    _reject_client(org)
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    template = NoteTemplate(
        org_id=org_uuid,
        title=body.title,
        format=body.format,
        field_definitions=body.field_definitions,
        is_default=bool(body.is_default),
        visibility=body.visibility or "personal",
        created_by=user_uuid,
    )
    db.add(template)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="create",
        resource="note_templates",
        resource_id=str(template.id),
    )
    return _template_to_output(template)


# ─── PATCH /{template_id} ──────────────────────────────────────


@router.patch("/{template_id}", response_model=NoteTemplateOutput)
async def update_template(
    org_id: str,
    template_id: str,
    body: NoteTemplateUpdateRequest,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> NoteTemplateOutput:
    """``PATCH /{template_id}`` (admin/counselor). 镜像 routes.ts:47-58 + service.ts:89-100."""
    _reject_client(org)
    _require_admin_or_counselor(org)
    template_uuid = parse_uuid_or_raise(template_id, field="templateId")
    await _assert_template_owned_by_org(db, template_uuid, org_id)

    q = select(NoteTemplate).where(NoteTemplate.id == template_uuid).limit(1)
    template = (await db.execute(q)).scalar_one_or_none()
    if template is None:
        raise NotFoundError("NoteTemplate", template_id)

    updates = body.model_dump(exclude_unset=True, by_alias=False)
    for field_name, value in updates.items():
        setattr(template, field_name, value)
    template.updated_at = datetime.now(UTC)
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="note_templates",
        resource_id=template_id,
    )
    return _template_to_output(template)


# ─── DELETE /{template_id} ─────────────────────────────────────


@router.delete("/{template_id}", response_model=OkResponse)
async def delete_template(
    org_id: str,
    template_id: str,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OkResponse:
    """``DELETE /{template_id}`` (admin/counselor). 镜像 routes.ts:61-72 + service.ts:102-109."""
    _reject_client(org)
    _require_admin_or_counselor(org)
    template_uuid = parse_uuid_or_raise(template_id, field="templateId")
    await _assert_template_owned_by_org(db, template_uuid, org_id)

    q = select(NoteTemplate).where(NoteTemplate.id == template_uuid).limit(1)
    template = (await db.execute(q)).scalar_one_or_none()
    if template is None:
        raise NotFoundError("NoteTemplate", template_id)

    await db.execute(delete(NoteTemplate).where(NoteTemplate.id == template_uuid))
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="delete",
        resource="note_templates",
        resource_id=template_id,
    )
    return OkResponse()


__all__ = ["router"]
