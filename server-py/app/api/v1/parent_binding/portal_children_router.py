"""Portal "我的孩子" (家长视角) router.

镜像 ``server/src/modules/parent-binding/portal-children.routes.ts``:

  GET    /         我持有的活跃关系 (孩子列表)
  DELETE /{rel_id} 解除一个关系 (status='revoked', revoked_at = now)

挂载: ``/api/orgs/{org_id}/client/children``

Guards: get_current_user + get_org_context (无 require_role — client 可用).
self_only: ``holder_user_id == caller_uuid`` 强校验; 不通过当 NotFound (防 enum).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.db.models.client_relationships import ClientRelationship
from app.db.models.users import User
from app.lib.errors import NotFoundError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


def _relationship_to_dict(r: ClientRelationship, child_name: str | None = None) -> dict[str, Any]:
    return {
        "id": str(r.id),
        "orgId": str(r.org_id),
        "holderUserId": str(r.holder_user_id),
        "relatedClientUserId": str(r.related_client_user_id),
        "relation": r.relation,
        "status": r.status,
        "boundViaTokenId": str(r.bound_via_token_id) if r.bound_via_token_id else None,
        "acceptedAt": r.accepted_at.isoformat() if r.accepted_at else None,
        "revokedAt": r.revoked_at.isoformat() if r.revoked_at else None,
        "childName": child_name,
    }


# ─── GET / ─────────────────────────────────────────────────────


@router.get("/")
async def list_my_children(
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict[str, Any]]:
    """列我持有的 active 关系 (按 acceptedAt asc)."""
    assert org is not None
    holder_uuid = parse_uuid_or_raise(user.id, field="userId")
    org_uuid = parse_uuid_or_raise(org.org_id, field="orgId")

    q = (
        select(
            ClientRelationship.id,
            ClientRelationship.related_client_user_id,
            User.name,
            ClientRelationship.relation,
            ClientRelationship.status,
            ClientRelationship.accepted_at,
        )
        .join(User, User.id == ClientRelationship.related_client_user_id)
        .where(
            and_(
                ClientRelationship.holder_user_id == holder_uuid,
                ClientRelationship.org_id == org_uuid,
                ClientRelationship.status == "active",
            )
        )
        .order_by(ClientRelationship.accepted_at)
    )
    rows = (await db.execute(q)).all()

    return [
        {
            "relationshipId": str(rel_id),
            "childUserId": str(child_id),
            "childName": child_name,
            "relation": relation,
            "status": "active",
            "acceptedAt": accepted_at.isoformat() if accepted_at else None,
        }
        for rel_id, child_id, child_name, relation, _status, accepted_at in rows
    ]


# ─── DELETE /{rel_id} ──────────────────────────────────────────


@router.delete("/{rel_id}")
async def revoke_relationship(
    rel_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """解除关系. 不是我持有则当 NotFound (防 enum). 已 revoked 走 idempotent."""
    assert org is not None
    holder_uuid = parse_uuid_or_raise(user.id, field="userId")
    rid_uuid = parse_uuid_or_raise(rel_id, field="relId")

    q = select(ClientRelationship).where(ClientRelationship.id == rid_uuid).limit(1)
    rel = (await db.execute(q)).scalar_one_or_none()
    if rel is None:
        raise NotFoundError("ClientRelationship", rel_id)
    if rel.holder_user_id != holder_uuid:
        # 防枚举 — 当成不存在
        raise NotFoundError("ClientRelationship", rel_id)
    if rel.status != "active":
        # idempotent — 已 revoked 直接返回当前状态
        return _relationship_to_dict(rel)

    rel.status = "revoked"
    rel.revoked_at = datetime.now(UTC)
    await db.commit()

    await record_audit(
        db=db,
        org_id=org.org_id,
        user_id=user.id,
        action="update",
        resource="client_relationships",
        resource_id=rel_id,
        ip_address=request.client.host if request.client else None,
    )
    return _relationship_to_dict(rel)


__all__ = ["router"]
