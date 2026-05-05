"""客户 portal 共享 helper — 镜像 ``server/src/modules/client-portal/client-portal-shared.ts``.

Phase 14 — ``?as=<userId>`` 监护人代查机制:

如果 query 含 ``?as=`` 且与 caller 自身不同, 必须验证 caller 在本 org 内有
**active** 的 parent-binding 关系 (``client_relationships``), 否则 403.

只有白名单端点接 ``resolve_target_user_id``:
  /dashboard, /appointments, /counselors,
  /documents, /documents/{doc_id}, /documents/{doc_id}/sign,
  /consents, /consents/{consent_id}/revoke

其它端点 (results / timeline / groups / courses / referrals / appointment-requests)
调 ``reject_as_param``, 任何 ``?as=`` 即 403。

镜像 Node 设计 (client-portal-shared.ts:17-35 / 41-48)。
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import Request
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.client_relationships import ClientRelationship
from app.lib.errors import ForbiddenError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.auth import AuthUser
from app.middleware.org_context import OrgContext


async def has_active_relationship(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    holder_user_id: uuid.UUID,
    related_client_user_id: uuid.UUID,
) -> bool:
    """检查 holder 在本 org 是否对 related 拥有 ``status='active'`` 的关系.

    与 parent_binding.shared 镜像同一函数 (Node parent-binding.service.ts:370-386). 这里
    复制小逻辑而非跨模块依赖 — client_portal 与 parent_binding 都使用此查询, 各自实现
    避免循环 import 风险, 保持模块边界清晰。
    """
    q = (
        select(ClientRelationship.id)
        .where(
            and_(
                ClientRelationship.org_id == org_id,
                ClientRelationship.holder_user_id == holder_user_id,
                ClientRelationship.related_client_user_id == related_client_user_id,
                ClientRelationship.status == "active",
            )
        )
        .limit(1)
    )
    row = (await db.execute(q)).scalar_one_or_none()
    return row is not None


async def resolve_target_user_id(
    request: Request,
    user: AuthUser,
    org: OrgContext,
    db: AsyncSession,
) -> uuid.UUID:
    """解析当前请求服务的目标 user_id.

    无 ``?as=`` 或 ``?as=自己`` → caller 自己;
    ``?as=<other>`` → 必须 caller 与 other 有 active parent-binding 关系, 返回 other.
    无关系直接 403.

    镜像 client-portal-shared.ts:22-35.
    """
    caller_uuid = parse_uuid_or_raise(user.id, field="userId")
    org_uuid = parse_uuid_or_raise(org.org_id, field="orgId")
    as_param: str | Any = request.query_params.get("as")
    if not as_param or as_param == user.id:
        return caller_uuid

    target_uuid = parse_uuid_or_raise(str(as_param), field="as")
    ok = await has_active_relationship(
        db,
        org_id=org_uuid,
        holder_user_id=caller_uuid,
        related_client_user_id=target_uuid,
    )
    if not ok:
        raise ForbiddenError("No active relationship with this user")
    return target_uuid


def reject_as_param(request: Request, user: AuthUser) -> None:
    """对必须服务 caller 自己 (从不代查) 的端点拒绝 ``?as=``.

    任何 ``?as=`` 与 caller 不同 → 403. 镜像 client-portal-shared.ts:41-47.
    """
    as_param: str | Any = request.query_params.get("as")
    if as_param and as_param != user.id:
        raise ForbiddenError("该数据不可代查")


__all__ = ["has_active_relationship", "reject_as_param", "resolve_target_user_id"]
