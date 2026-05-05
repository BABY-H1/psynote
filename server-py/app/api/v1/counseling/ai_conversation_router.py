"""
AI conversation router — 镜像 ``server/src/modules/counseling/ai-conversation.routes.ts`` (95 行)。

挂在 ``/api/orgs/{org_id}/ai-conversations`` prefix。

5 个 endpoint:

  GET    /              — 列表 (filters: careEpisodeId / mode; counselor 仅自己)
  GET    /{id}          — 详情 (PHI access — 含逐字稿)
  POST   /              — 创建 (admin/counselor)
  PATCH  /{id}          — 部分更新 (append messages / 改 title / 关联 sessionNoteId)
  DELETE /{id}          — 删除 (admin/counselor)

PHI 接通点位:
  - GET /{id} → ``record_phi_access(action='view', data_class='phi_full')``
    AI conversations 含逐字稿, phi_full。owner 取自关联的 careEpisode.client_id。

mode 4 类:
  note (笔记草稿) / plan (治疗计划) / simulate (模拟来访) / supervise (督导对话)
  Phase 5 接 BYOK 后才有真模型调用 — 现在仅 CRUD。

Phase I Issue 1: messages PATCH 时支持 sessionNoteId (note 模式 → 关联 saved note)。
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy import and_, delete, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.counseling.schemas import (
    AIConversationCreateRequest,
    AIConversationOutput,
    AIConversationUpdateRequest,
)
from app.core.database import get_db
from app.db.models.ai_conversations import AIConversation
from app.db.models.care_episodes import CareEpisode
from app.lib.errors import ForbiddenError, NotFoundError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.phi_access import record_phi_access
from app.middleware.role_guards import require_admin_or_counselor as _require_admin_or_counselor

router = APIRouter()


# ─── 工具 ─────────────────────────────────────────────────────────


def _require_org(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    return org


def _conv_to_output(c: AIConversation) -> AIConversationOutput:
    return AIConversationOutput(
        id=str(c.id),
        org_id=str(c.org_id),
        care_episode_id=str(c.care_episode_id),
        counselor_id=str(c.counselor_id),
        mode=c.mode,
        title=c.title,
        messages=list(c.messages) if c.messages else [],
        summary=c.summary,
        session_note_id=str(c.session_note_id) if c.session_note_id else None,
        created_at=getattr(c, "created_at", None),
        updated_at=getattr(c, "updated_at", None),
    )


# ─── GET / 列表 ──────────────────────────────────────────────────


@router.get("/", response_model=list[AIConversationOutput])
async def list_conversations(
    org_id: str,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    care_episode_id: Annotated[str | None, Query(alias="careEpisodeId")] = None,
    mode: Annotated[str | None, Query()] = None,
) -> list[AIConversationOutput]:
    """``GET /`` 列表 (镜像 routes.ts:18-25 + service.ts:7-46).

    counselor 仅看自己的 (counselorId == 当前 user); admin 看本 org 全部。
    """
    _require_org(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")

    conds: list[Any] = [AIConversation.org_id == org_uuid]
    if org and org.role != "org_admin":
        user_uuid = parse_uuid_or_raise(user.id, field="userId")
        conds.append(AIConversation.counselor_id == user_uuid)
    if care_episode_id:
        conds.append(
            AIConversation.care_episode_id
            == parse_uuid_or_raise(care_episode_id, field="careEpisodeId")
        )
    if mode:
        conds.append(AIConversation.mode == mode)

    q = select(AIConversation).where(and_(*conds)).order_by(desc(AIConversation.updated_at))
    rows = list((await db.execute(q)).scalars().all())
    return [_conv_to_output(c) for c in rows]


# ─── GET /{id} (PHI) ──────────────────────────────────────────


@router.get("/{conversation_id}", response_model=AIConversationOutput)
async def get_conversation(
    org_id: str,
    conversation_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AIConversationOutput:
    """``GET /{id}`` 详情 — PHI access log (镜像 routes.ts:28-50 + service.ts:48-52).

    ⚠ AI conversations 含逐字稿, phi_full。owner 从 careEpisode.client_id 取。
    """
    _require_org(org)
    conv_uuid = parse_uuid_or_raise(conversation_id, field="conversationId")

    q = select(AIConversation).where(AIConversation.id == conv_uuid).limit(1)
    conv = (await db.execute(q)).scalar_one_or_none()
    if conv is None:
        raise NotFoundError("AiConversation", conversation_id)

    # owner_user_id 从 care_episode 取 (镜像 routes.ts:34-43)
    owner_user_id: str | None = None
    if conv.care_episode_id:
        epq = select(CareEpisode.client_id).where(CareEpisode.id == conv.care_episode_id).limit(1)
        owner_row = (await db.execute(epq)).first()
        if owner_row is not None:
            owner_user_id = str(owner_row[0])

    # PHI access log (Node 端 assertAuthorized + 不显式 logPhiAccess; 这里手动 log 一次)
    if owner_user_id:
        await record_phi_access(
            db=db,
            org_id=org_id if org else "",
            user_id=user.id,
            client_id=owner_user_id,
            resource="ai_conversations",
            action="view",
            resource_id=conversation_id,
            data_class="phi_full",
            actor_role_snapshot=org.role_v2 if org else None,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    return _conv_to_output(conv)


# ─── POST / 创建 ────────────────────────────────────────────────


@router.post("/", response_model=AIConversationOutput, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    org_id: str,
    body: AIConversationCreateRequest,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AIConversationOutput:
    """``POST /`` (admin/counselor). 镜像 routes.ts:53-70 + service.ts:54-71."""
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")
    care_uuid = parse_uuid_or_raise(body.care_episode_id, field="careEpisodeId")

    conv = AIConversation(
        org_id=org_uuid,
        care_episode_id=care_uuid,
        counselor_id=user_uuid,
        mode=body.mode,
        title=body.title,
        messages=[],
    )
    db.add(conv)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return _conv_to_output(conv)


# ─── PATCH /{id} 部分更新 ──────────────────────────────────────


@router.patch("/{conversation_id}", response_model=AIConversationOutput)
async def update_conversation(
    org_id: str,
    conversation_id: str,
    body: AIConversationUpdateRequest,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AIConversationOutput:
    """``PATCH /{id}`` (admin/counselor). 镜像 routes.ts:73-85 + service.ts:73-96.

    Phase I Issue 1: sessionNoteId 可被 PATCH (note 模式 → 关联 saved note)。
    传 None 解绑。
    """
    _require_admin_or_counselor(org)
    conv_uuid = parse_uuid_or_raise(conversation_id, field="conversationId")

    q = select(AIConversation).where(AIConversation.id == conv_uuid).limit(1)
    conv = (await db.execute(q)).scalar_one_or_none()
    if conv is None:
        raise NotFoundError("AiConversation", conversation_id)

    updates = body.model_dump(exclude_unset=True, by_alias=False)
    if "session_note_id" in updates:
        sid = updates.pop("session_note_id")
        conv.session_note_id = parse_uuid_or_raise(sid, field="sessionNoteId") if sid else None
    for field_name, value in updates.items():
        setattr(conv, field_name, value)
    conv.updated_at = datetime.now(UTC)
    await db.commit()

    return _conv_to_output(conv)


# ─── DELETE /{id} ──────────────────────────────────────────────


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    org_id: str,
    conversation_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """``DELETE /{id}`` (admin/counselor). 镜像 routes.ts:88-93 + service.ts:98-104."""
    _require_admin_or_counselor(org)
    conv_uuid = parse_uuid_or_raise(conversation_id, field="conversationId")

    q = select(AIConversation).where(AIConversation.id == conv_uuid).limit(1)
    conv = (await db.execute(q)).scalar_one_or_none()
    if conv is None:
        raise NotFoundError("AiConversation", conversation_id)

    await db.execute(delete(AIConversation).where(AIConversation.id == conv_uuid))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


__all__ = ["router"]
