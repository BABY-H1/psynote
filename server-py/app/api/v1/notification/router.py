"""
Notification API router — 镜像
``server/src/modules/notification/notification.routes.ts`` (33 行) +
``notification.service.ts`` (60 行)。

挂在 ``/api/orgs/{org_id}/notifications`` 前缀下。

3 个 endpoint (注: client role 被 Node 端 ``rejectClient`` hook 排除, 这里
通过 ``_reject_client`` 在每个 endpoint 顶部判断):

  GET   /                         — 列出我的通知 (50 条/页, ?isRead 过滤)
  GET   /unread-count             — 未读数 (用于头部红点)
  PATCH /{notification_id}/read   — 标记已读

业务逻辑 inline (Node service.ts 也只 60 行, 4 个简单查询)。
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.notification.schemas import NotificationResponse, UnreadCountResponse
from app.core.database import get_db
from app.db.models.notifications import Notification
from app.lib.errors import NotFoundError, ValidationError
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.role_guards import reject_client

router = APIRouter()


def _reject_client(org: OrgContext | None, user: AuthUser) -> OrgContext:
    """
    与 Node ``rejectClient`` middleware 一致: client role 不允许调用本模块 (走门户)。

    sysadm 跳过 (但仍需 org context). 非 sysadm 必须有 org context 且 role != 'client'.
    """
    return reject_client(org, user=user, client_message="来访者请通过客户端门户访问")


def _notification_to_response(n: Notification) -> NotificationResponse:
    return NotificationResponse(
        id=str(n.id),
        org_id=str(n.org_id),
        user_id=str(n.user_id),
        type=n.type,
        title=n.title,
        body=n.body,
        ref_type=n.ref_type,
        ref_id=str(n.ref_id) if n.ref_id else None,
        is_read=n.is_read,
        created_at=n.created_at.isoformat() if getattr(n, "created_at", None) else None,
    )


# ─── GET / 列表 (镜像 routes.ts:13-20 + service.ts:18-37) ─────────


@router.get("/", response_model=list[NotificationResponse])
async def list_notifications(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    is_read: Annotated[str | None, Query(alias="isRead")] = None,
) -> list[NotificationResponse]:
    """
    列出当前用户在当前 org 的通知, 按 created_at 倒序, 最多 50 条。

    is_read 走 string 而非 bool — 与 Node ``isRead === 'true'`` 一致 (query
    字符串比较). undefined / "" → 不过滤。
    """
    org_ctx = _reject_client(org, user)

    try:
        org_uuid = uuid.UUID(org_ctx.org_id)
        user_uuid = uuid.UUID(user.id)
    except (ValueError, TypeError) as exc:
        raise ValidationError("Invalid org_id or user_id") from exc

    conditions = [
        Notification.org_id == org_uuid,
        Notification.user_id == user_uuid,
    ]
    if is_read is not None:
        conditions.append(Notification.is_read == (is_read == "true"))

    q = (
        select(Notification)
        .where(and_(*conditions))
        .order_by(desc(Notification.created_at))
        .limit(50)
    )
    rows = (await db.execute(q)).scalars().all()
    return [_notification_to_response(n) for n in rows]


# ─── GET /unread-count (镜像 routes.ts:22-26 + service.ts:48-59) ──


@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
) -> UnreadCountResponse:
    """未读通知数 (用于前端 navbar 红点)。"""
    org_ctx = _reject_client(org, user)

    try:
        org_uuid = uuid.UUID(org_ctx.org_id)
        user_uuid = uuid.UUID(user.id)
    except (ValueError, TypeError) as exc:
        raise ValidationError("Invalid org_id or user_id") from exc

    # 用 SQL COUNT(*) 而非 .select().all() (Node 是 result.length, 行多的话浪费):
    # 与 Node 行为等价但更省 DB roundtrip。
    cq = (
        select(func.count())
        .select_from(Notification)
        .where(
            and_(
                Notification.org_id == org_uuid,
                Notification.user_id == user_uuid,
                Notification.is_read.is_(False),
            )
        )
    )
    count_val = (await db.execute(cq)).scalar_one()
    return UnreadCountResponse(count=int(count_val))


# ─── PATCH /{notification_id}/read 标记已读 (镜像 routes.ts:28-32) ───


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def mark_as_read(
    notification_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
) -> NotificationResponse:
    """标记某条通知已读, 返回更新后的整行。"""
    _reject_client(org, user)

    try:
        notif_uuid = uuid.UUID(notification_id)
    except (ValueError, TypeError) as exc:
        raise NotFoundError("Notification", notification_id) from exc

    q = select(Notification).where(Notification.id == notif_uuid).limit(1)
    notif = (await db.execute(q)).scalar_one_or_none()
    if notif is None:
        raise NotFoundError("Notification", notification_id)

    notif.is_read = True
    await db.commit()
    await db.refresh(notif)
    return _notification_to_response(notif)
