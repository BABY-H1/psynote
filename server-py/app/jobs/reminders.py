"""
Reminders queue tasks — 镜像 Node ``server/src/jobs/reminder.worker.ts``。

Node 端用 BullMQ delayed jobs (``schedule-reminders.ts:scheduleReminders`` 在创建预约时
入队, delay = startTime - reminderMinutes). Python 端走另一种模式: Beat 每整点扫一次
"该出未发" 的提醒, 不依赖 delayed job (更鲁棒, worker 重启不会丢延迟任务).

两种模式行为等价 (前 24h / 前 1h 两批提醒), trade-off:
  - BullMQ delayed: 入队即定时, 但 broker 重启 / job 丢失风险
  - Celery Beat hourly scan: O(N×24) 查询/天 (N=未来 24 小时内预约数), 简单可靠

Phase 4 实装范围:
  - ``dispatch_due_reminders`` Beat 任务签名 + 扫描查询
  - 通知 / 邮件副作用是 stub (logger.info), Phase 5+ 接 notification_sender / mailer
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import and_, select

from app.core.database import async_session_maker
from app.db.models.appointments import Appointment
from app.jobs.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.jobs.reminders.dispatch_due_reminders")
def dispatch_due_reminders() -> dict[str, Any]:
    """每整点 Beat 跑 — 扫 1h / 24h 即将开始的预约, 调发提醒。

    返回 ``{"sent_24h": N, "sent_1h": M}``。
    """
    import asyncio

    return asyncio.run(_dispatch_due_reminders_async())


@celery_app.task(name="app.jobs.reminders.send_reminder")
def send_reminder(appointment_id: str, kind: str) -> dict[str, Any]:
    """单预约 fan-out 任务 — Beat 扫到的每个预约 enqueue 一次 (允许并发 retry)。

    Args:
        appointment_id: UUID 字符串
        kind: '24h' 或 '1h'
    """
    import asyncio

    return asyncio.run(_send_reminder_async(appointment_id, kind))


# ─── async 实现 ─────────────────────────────────────────────────


_REMINDER_24H_WINDOW_MINUTES = 24 * 60  # 24h
_REMINDER_1H_WINDOW_MINUTES = 60  # 1h
_SCAN_BUFFER_MINUTES = 60  # 容忍每整点扫描 + 1 小时窗口


async def _dispatch_due_reminders_async() -> dict[str, Any]:
    """扫 next 24 小时内有预约 + 还没发过对应提醒的, fan-out 单 reminder 任务。"""
    now = datetime.now(UTC)
    # 24h 窗口: 接下来 24h~25h 起的预约 (再 ±1h buffer); 1h 窗口: 接下来 1h~2h 起的
    upper_24h = now + timedelta(minutes=_REMINDER_24H_WINDOW_MINUTES + _SCAN_BUFFER_MINUTES)
    lower_24h = now + timedelta(minutes=_REMINDER_24H_WINDOW_MINUTES - _SCAN_BUFFER_MINUTES)
    upper_1h = now + timedelta(minutes=_REMINDER_1H_WINDOW_MINUTES + _SCAN_BUFFER_MINUTES)
    lower_1h = now + timedelta(minutes=_REMINDER_1H_WINDOW_MINUTES - _SCAN_BUFFER_MINUTES)

    sent_24h = 0
    sent_1h = 0

    async with async_session_maker() as db:
        # 24h 提醒
        q24 = select(Appointment).where(
            and_(
                Appointment.start_time >= lower_24h,
                Appointment.start_time <= upper_24h,
                Appointment.reminder_sent_24h.is_(False),
                Appointment.status.in_(("pending", "confirmed")),
            )
        )
        for appt in (await db.execute(q24)).scalars().all():
            sent_24h += 1
            logger.info(
                "[reminders] would send 24h reminder appointment_id=%s client=%s start=%s",
                appt.id,
                appt.client_id,
                appt.start_time,
            )
            # Phase 5+: send_reminder.delay(str(appt.id), "24h") fan-out + 真发邮件

        # 1h 提醒
        q1 = select(Appointment).where(
            and_(
                Appointment.start_time >= lower_1h,
                Appointment.start_time <= upper_1h,
                Appointment.reminder_sent_1h.is_(False),
                Appointment.status.in_(("pending", "confirmed")),
            )
        )
        for appt in (await db.execute(q1)).scalars().all():
            sent_1h += 1
            logger.info(
                "[reminders] would send 1h reminder appointment_id=%s client=%s start=%s",
                appt.id,
                appt.client_id,
                appt.start_time,
            )

    logger.info(
        "[reminders] dispatch_due_reminders complete sent_24h=%s sent_1h=%s",
        sent_24h,
        sent_1h,
    )
    return {"sent_24h": sent_24h, "sent_1h": sent_1h}


async def _send_reminder_async(appointment_id: str, kind: str) -> dict[str, Any]:
    """单预约提醒发送. UUID 容错: 非法 id 返 skipped。"""
    import uuid as _uuid

    if kind not in ("24h", "1h"):
        return {"sent": False, "reason": "invalid_kind"}
    try:
        aid = _uuid.UUID(appointment_id)
    except (ValueError, TypeError):
        return {"sent": False, "reason": "invalid_appointment_id"}

    async with async_session_maker() as db:
        q = select(Appointment).where(Appointment.id == aid).limit(1)
        appt = (await db.execute(q)).scalar_one_or_none()
        if appt is None:
            return {"sent": False, "reason": "not_found"}
        if appt.status in ("cancelled", "completed"):
            return {"sent": False, "reason": f"appointment_status_{appt.status}"}
        if kind == "24h" and appt.reminder_sent_24h:
            return {"sent": False, "reason": "already_sent"}
        if kind == "1h" and appt.reminder_sent_1h:
            return {"sent": False, "reason": "already_sent"}

        # Phase 4 stub: 仅 logger + 标记 sent. Phase 5+ 真接 notification_sender.sendEmail
        # + create_notification.
        logger.info(
            "[reminders] sending %s reminder appointment_id=%s",
            kind,
            appointment_id,
        )
        if kind == "24h":
            appt.reminder_sent_24h = True
        else:
            appt.reminder_sent_1h = True
        await db.commit()

    return {"sent": True, "kind": kind}


__all__ = ["dispatch_due_reminders", "send_reminder"]
