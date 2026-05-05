"""
Delivery 路由 — 镜像 ``server/src/modules/delivery/delivery.routes.ts`` (97 行)。

挂在 ``/api/orgs/{org_id}/services`` prefix 下:

  GET   /             — Phase 5b 跨模块服务实例聚合 (UNION ALL)
  POST  /launch       — Phase 9β 统一 launch verb (一键启动 6 类服务)

RBAC:
  - 所有端点要 OrgContext (rejectClient 由路由层自检)
  - ``POST /launch`` 要 ``org_admin`` or ``counselor`` (与 Node ``requireRole`` 一致)
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.delivery.launch_service import launch
from app.api.v1.delivery.schemas import (
    LaunchRequest,
    LaunchResult,
    ListServicesResponse,
)
from app.api.v1.delivery.service import list_service_instances
from app.core.database import get_db
from app.lib.errors import ForbiddenError, ValidationError
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.role_guards import reject_client, require_admin_or_counselor

router = APIRouter()


# ─── Guards (与 Node Fastify hook 等价) ──────────────────────


def _require_org(org: OrgContext | None) -> OrgContext:
    """``orgContextGuard`` 等价 — 没 OrgContext 直接 403。"""
    if org is None:
        raise ForbiddenError("org_context_required")
    return org


def _reject_client(org: OrgContext) -> None:
    """``rejectClient`` 等价 — client 角色禁止访问机构端 delivery 路由。"""
    reject_client(org, client_message="client_role_not_allowed")


def _require_admin_or_counselor(org: OrgContext) -> None:
    """``requireRole('org_admin', 'counselor')`` 等价 — POST /launch 守门。"""
    require_admin_or_counselor(
        org,
        insufficient_message="This action requires one of the following roles: org_admin, counselor",
    )


def _split_csv(v: str | None) -> list[str] | None:
    """``"a,b,c"`` → ``['a','b','c']``; 空字符串过滤 (Node ``parseList`` 等价)。"""
    if not v:
        return None
    arr = [s.strip() for s in v.split(",") if s.strip()]
    return arr or None


# ─── GET /services ──────────────────────────────────────────────


@router.get("/", response_model=ListServicesResponse)
async def list_services(
    org_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    kind: Annotated[str | None, Query(alias="kind")] = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    limit: Annotated[int | None, Query(alias="limit", ge=1, le=500)] = None,
    offset: Annotated[int | None, Query(alias="offset", ge=0)] = None,
) -> ListServicesResponse:
    """``GET /api/orgs/{org_id}/services`` — 镜像 routes.ts:36-51。

    Query params (全部可选):
      kind     csv (counseling / group / course / assessment), e.g. "counseling,group"
      status   csv ServiceStatus 值, 过滤 mapped 后的 status
      limit    1..500, 默认 60
      offset   默认 0
    """
    org_ctx = _require_org(org)
    _reject_client(org_ctx)

    return await list_service_instances(
        db,
        org_id=org_id,
        kinds=_split_csv(kind),
        statuses=_split_csv(status_filter),
        limit=limit,
        offset=offset,
    )


# ─── POST /services/launch ─────────────────────────────────────


@router.post("/launch", response_model=LaunchResult, status_code=status.HTTP_201_CREATED)
async def launch_service(
    org_id: str,
    body: LaunchRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
) -> LaunchResult:
    """``POST /api/orgs/{org_id}/services/launch`` — 镜像 routes.ts:63-79。

    Transactional: launch_service 把所有 db.add 流到同一 session, 这里统一 commit。
    audit log: ``action='launch'``, ``resource='service:{kind}'`` (与 Node 一致)。
    """
    org_ctx = _require_org(org)
    _reject_client(org_ctx)
    _require_admin_or_counselor(org_ctx)

    if not body.action_type:
        raise ValidationError("actionType is required")
    if body.payload is None:
        raise ValidationError("payload is required")

    try:
        result = await launch(
            db,
            org_id=org_id,
            user_id=user.id,
            action_type=body.action_type,
            payload=body.payload,
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="launch",
        resource=f"service:{result.kind}",
        resource_id=result.instance_id,
        ip_address=request.client.host if request.client else None,
    )
    return result


__all__ = ["router"]
