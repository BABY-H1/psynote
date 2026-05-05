"""
Person archive 路由 — 镜像 ``server/src/modules/delivery/person-archive.routes.ts`` (43 行)。

挂在 ``/api/orgs/{org_id}/people`` prefix 下:

  GET   /                        — 列出该 org 内所有有 touchpoint OR 仅成员的人
  GET   /{user_id}/archive       — 单人完整跨模块档案

RBAC:
  - 所有端点要 OrgContext + 不允许 ``role='client'`` (rejectClient 等价)
  - 不做 per-counselor data scope filtering — 与 Node 注释一致 (Phase 5b 一致)
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.delivery.person_archive_service import (
    get_person_archive,
    list_people,
)
from app.api.v1.delivery.schemas import ListPeopleResponse, PersonArchive
from app.core.database import get_db
from app.lib.errors import ForbiddenError
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.role_guards import reject_client

router = APIRouter()


def _require_org(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    return org


def _reject_client(org: OrgContext) -> None:
    reject_client(org, client_message="client_role_not_allowed")


@router.get("/", response_model=ListPeopleResponse)
async def list_people_route(
    org_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    limit: Annotated[int | None, Query(alias="limit", ge=1, le=1000)] = None,
) -> ListPeopleResponse:
    """``GET /api/orgs/{org_id}/people`` — 列表 (镜像 routes.ts:30-36)。"""
    org_ctx = _require_org(org)
    _reject_client(org_ctx)
    _ = user  # 保留 dep 注入 (auth 链), 后续 9γ 加 phi_access
    return await list_people(db, org_id, limit)


@router.get("/{user_id}/archive", response_model=PersonArchive)
async def get_person_archive_route(
    org_id: str,
    user_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
) -> PersonArchive:
    """``GET /api/orgs/{org_id}/people/{user_id}/archive`` — 镜像 routes.ts:38-42。"""
    org_ctx = _require_org(org)
    _reject_client(org_ctx)
    _ = user
    return await get_person_archive(db, org_id, user_id)


__all__ = ["router"]
