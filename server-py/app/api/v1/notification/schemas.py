"""
Notification API 请求 / 响应 schemas (Pydantic v2)。

镜像 server/src/modules/notification/{notification,reminder-settings}.routes.ts
与 notification.service.ts 的 JSON shape — wire camelCase, Python snake_case。
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    """所有 notification schema 的基类 — wire camelCase, Python snake_case。"""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
    )


# ─── Notification 主表 ──────────────────────────────────────────


class NotificationResponse(_CamelModel):
    """
    单条通知 — list / mark-as-read 都返这个 shape。

    ref_type / ref_id 是 polymorphic 引用 (notifications 表故意不加 FK), 指向
    触发本通知的源对象 (e.g. ref_type='appointment', ref_id=<appointment.id>)。
    """

    id: str
    org_id: str
    user_id: str
    type: str
    title: str
    body: str | None = None
    ref_type: str | None = None
    ref_id: str | None = None
    is_read: bool
    created_at: str | None = None


class UnreadCountResponse(_CamelModel):
    """``GET /unread-count`` 响应 — 仅一个 count 字段。"""

    count: int


# ─── Reminder settings (PUT 请求 + GET/PUT 响应) ───────────────


class ReminderSettingsRequest(_CamelModel):
    """
    PUT /reminder-settings 请求体 — 全字段可选, 服务端 upsert (有则 update, 无则 insert)。

    Node 端 ``request.body as Record<string, unknown>`` 自由透传, 这里 typed 一下,
    防 wire 端意外字段。channels 默认 ``['email']``, remind_before 默认 ``[1440, 60]``。
    """

    enabled: bool | None = None
    channels: list[str] | None = None
    remind_before: list[int] | None = None
    email_config: dict[str, Any] | None = None
    sms_config: dict[str, Any] | None = None
    message_template: dict[str, Any] | None = None


class ReminderSettingsResponse(_CamelModel):
    """
    GET / PUT 响应 — 当 GET 命中行时返该行; GET 未命中时 router 返默认 shape
    ``{enabled: True, channels: ['email'], remind_before: [1440, 60]}``
    (镜像 reminder-settings.routes.ts:18)。
    """

    id: str | None = None
    org_id: str | None = None
    enabled: bool = True
    channels: list[str] = Field(default_factory=lambda: ["email"])
    remind_before: list[int] = Field(default_factory=lambda: [1440, 60])
    email_config: dict[str, Any] | None = None
    sms_config: dict[str, Any] | None = None
    message_template: dict[str, Any] | None = None
    created_at: str | None = None
    updated_at: str | None = None
