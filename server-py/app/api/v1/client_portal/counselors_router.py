"""Client portal counselors directory router.

镜像 ``server/src/modules/client-portal/client-counselors.routes.ts``:
  GET /counselors  — 列出 org 活跃咨询师 (guardian-readable). 我的主分配咨询师顶置.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.client_portal.shared import resolve_target_user_id
from app.core.database import get_db
from app.db.models.client_assignments import ClientAssignment
from app.db.models.org_members import OrgMember
from app.db.models.users import User
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


@router.get("/counselors")
async def list_counselors(
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict[str, Any]]:
    """guardian-readable. 排序: 我的主咨询师在最前.

    self_only: 主咨询师查询用 target_uuid (代查时也要看孩子的咨询师, 不是家长的).
    """
    assert org is not None
    target_uuid = await resolve_target_user_id(request, user, org, db)
    org_uuid = parse_uuid_or_raise(org.org_id, field="orgId")

    cou_q = (
        select(
            User.id,
            User.name,
            User.avatar_url,
            OrgMember.specialties,
            OrgMember.bio,
        )
        .join(User, User.id == OrgMember.user_id)
        .where(
            and_(
                OrgMember.org_id == org_uuid,
                OrgMember.role == "counselor",
                OrgMember.status == "active",
            )
        )
    )
    rows = (await db.execute(cou_q)).all()

    a_q = (
        select(ClientAssignment.counselor_id)
        .where(
            and_(
                ClientAssignment.org_id == org_uuid,
                ClientAssignment.client_id == target_uuid,
                ClientAssignment.is_primary.is_(True),
            )
        )
        .limit(1)
    )
    my_counselor_id = (await db.execute(a_q)).scalar_one_or_none()

    counselors = [
        {
            "id": str(cid),
            "name": name,
            "avatarUrl": avatar,
            "specialties": list(specialties or []),
            "bio": bio,
            "isMyCounselor": cid == my_counselor_id,
        }
        for cid, name, avatar, specialties, bio in rows
    ]
    # 排序: 我的咨询师顶置, 其余保持原序
    counselors.sort(key=lambda c: 0 if c["isMyCounselor"] else 1)
    return counselors


__all__ = ["router"]
