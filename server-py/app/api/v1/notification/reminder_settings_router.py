"""
Reminder settings router — 镜像 ``server/src/modules/notification/reminder-settings.routes.ts``
的 ``reminderSettingsRoutes`` (1-42 行)。

挂在 ``/api/orgs/{org_id}/reminder-settings`` 前缀下。

2 个 endpoint:
  GET /  — 取当前 org 的提醒配置 (无配置时返默认 dict)
  PUT /  — upsert (org_admin / system_admin)

设计:
  - reminder_settings 表 unique on (org_id), 至多 1 行/org
  - GET 命中: 返该行; 未命中: 返默认 ``{enabled, channels=['email'], remind_before=[1440,60]}``
    (与 Node reminder-settings.routes.ts:18 一致)
  - PUT: 命中 update + audit; 未命中 insert + audit
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.notification.schemas import (
    ReminderSettingsRequest,
    ReminderSettingsResponse,
)
from app.core.database import get_db
from app.db.models.reminder_settings import ReminderSettings
from app.lib.errors import ForbiddenError, ValidationError
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


def _require_org_admin(user: AuthUser, org: OrgContext | None) -> OrgContext:
    """PUT 走 ``requireRole('org_admin')`` (Node)。sysadm 跳, 其他人 403。"""
    if user.is_system_admin:
        if org is None:
            raise ForbiddenError("org_context_required")
        return org
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.role != "org_admin":
        raise ForbiddenError("This action requires one of the following roles: org_admin")
    return org


def _row_to_response(row: ReminderSettings) -> ReminderSettingsResponse:
    return ReminderSettingsResponse(
        id=str(row.id),
        org_id=str(row.org_id),
        enabled=row.enabled,
        channels=list(row.channels) if row.channels else ["email"],
        remind_before=list(row.remind_before) if row.remind_before else [1440, 60],
        email_config=row.email_config,
        sms_config=row.sms_config,
        message_template=row.message_template,
        created_at=row.created_at.isoformat() if getattr(row, "created_at", None) else None,
        updated_at=row.updated_at.isoformat() if getattr(row, "updated_at", None) else None,
    )


# ─── GET / (镜像 reminder-settings.routes.ts:14-19) ──────────────


@router.get("/", response_model=ReminderSettingsResponse)
async def get_reminder_settings(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
) -> ReminderSettingsResponse:
    """取当前 org 的 reminder_settings; 不存在则返默认 shape。"""
    if org is None and not user.is_system_admin:
        raise ForbiddenError("org_context_required")
    if org is None:
        raise ForbiddenError("org_context_required")

    try:
        org_uuid = uuid.UUID(org.org_id)
    except (ValueError, TypeError) as exc:
        raise ValidationError("Invalid org_id") from exc

    q = select(ReminderSettings).where(ReminderSettings.org_id == org_uuid).limit(1)
    row = (await db.execute(q)).scalar_one_or_none()
    if row is None:
        # 默认 shape — 镜像 Node ``settings || { enabled: true, channels: ['email'],
        # remindBefore: [1440, 60] }``
        return ReminderSettingsResponse(
            org_id=org.org_id,
            enabled=True,
            channels=["email"],
            remind_before=[1440, 60],
        )
    return _row_to_response(row)


# ─── PUT / upsert (镜像 reminder-settings.routes.ts:22-41) ───────


@router.put("/", response_model=ReminderSettingsResponse)
async def upsert_reminder_settings(
    body: ReminderSettingsRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
) -> ReminderSettingsResponse:
    """upsert reminder_settings (1 行/org). org_admin / sysadm only。"""
    org_ctx = _require_org_admin(user, org)

    try:
        org_uuid = uuid.UUID(org_ctx.org_id)
    except (ValueError, TypeError) as exc:
        raise ValidationError("Invalid org_id") from exc

    existing_q = select(ReminderSettings).where(ReminderSettings.org_id == org_uuid).limit(1)
    existing = (await db.execute(existing_q)).scalar_one_or_none()

    # 仅更新显式提供的字段 (与 Node ``...body`` 透传一致, 但明确字段名防误打)
    if existing is not None:
        if body.enabled is not None:
            existing.enabled = body.enabled
        if body.channels is not None:
            existing.channels = body.channels
        if body.remind_before is not None:
            existing.remind_before = body.remind_before
        if body.email_config is not None:
            existing.email_config = body.email_config
        if body.sms_config is not None:
            existing.sms_config = body.sms_config
        if body.message_template is not None:
            existing.message_template = body.message_template
        existing.updated_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(existing)
        await record_audit(
            db=db,
            org_id=org_ctx.org_id,
            user_id=user.id,
            action="update",
            resource="reminder_settings",
            resource_id=str(existing.id),
            ip_address=request.client.host if request.client else None,
        )
        return _row_to_response(existing)

    # insert path
    new_row = ReminderSettings(
        org_id=org_uuid,
        enabled=body.enabled if body.enabled is not None else True,
        channels=body.channels if body.channels is not None else ["email"],
        remind_before=body.remind_before if body.remind_before is not None else [1440, 60],
        email_config=body.email_config,
        sms_config=body.sms_config,
        message_template=body.message_template,
    )
    db.add(new_row)
    await db.commit()
    await db.refresh(new_row)
    await record_audit(
        db=db,
        org_id=org_ctx.org_id,
        user_id=user.id,
        action="create",
        resource="reminder_settings",
        resource_id=str(new_row.id),
        ip_address=request.client.host if request.client else None,
    )
    return _row_to_response(new_row)
