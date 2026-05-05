"""
Public appointment confirm/cancel router — 镜像
``server/src/modules/notification/reminder-settings.routes.ts`` 的
``publicAppointmentRoutes`` (44-90 行)。

挂在 ``/api/public/appointments`` 前缀下, **无 auth** —— 邮件链接直接点开:

  GET /confirm/{token}  — 标记 client_confirmed_at = now
  GET /cancel/{token}   — 标记 status='cancelled' + cancel pending reminder jobs

返回 HTML 页面 (text/html), 不是 JSON. 与 Node 一致 (用户从邮件点链接,
端到端就一个浏览器 tab, 不该让用户看 JSON)。

注: Node ``cancelReminders(appt.id)`` 的 Python 端等价实现 (``app.jobs.
schedule_reminders.cancel_reminders``) 在 Phase X TBD 阶段才接, 这里调用占位
helper 并 swallow 异常 (与 Node 一样不让 cancellation 失败阻塞 UI)。
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.db.models.appointments import Appointment

logger = logging.getLogger(__name__)

router = APIRouter()


def _not_found_html() -> HTMLResponse:
    """Token 无效或已过期 — 与 Node 端 status 404 ``{error: '...'}`` 一致 wire shape。"""
    return HTMLResponse(
        status_code=404,
        content="""<html><head><meta charset="utf-8"><title>无效</title></head>
        <body style="font-family:sans-serif;text-align:center;padding:60px">
        <h1>链接无效或已过期</h1>
        </body></html>""",
    )


async def _load_appointment_by_token(db: AsyncSession, token: str) -> Appointment | None:
    """按 confirm_token 找 appointment row。token 不存在 / 不匹配 → None。"""
    q = select(Appointment).where(Appointment.confirm_token == token).limit(1)
    return (await db.execute(q)).scalar_one_or_none()


# ─── GET /confirm/{token} (镜像 reminder-settings.routes.ts:46-65) ─


@router.get("/confirm/{token}", response_class=HTMLResponse)
async def confirm_appointment(
    token: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> HTMLResponse:
    """点击邮件确认链接 → 标记 client_confirmed_at = now, 返回成功 HTML。"""
    appt = await _load_appointment_by_token(db, token)
    if appt is None:
        return _not_found_html()

    appt.client_confirmed_at = datetime.now(UTC)
    await db.commit()

    start_iso = appt.start_time.isoformat() if appt.start_time else ""
    return HTMLResponse(
        content=f"""<html><head><meta charset="utf-8"><title>预约已确认</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:60px">
        <h1 style="color:#16a34a">预约已确认</h1>
        <p>您的预约已成功确认。</p>
        <p>时间：{start_iso}</p>
      </body></html>"""
    )


# ─── GET /cancel/{token} (镜像 reminder-settings.routes.ts:67-89) ──


@router.get("/cancel/{token}", response_class=HTMLResponse)
async def cancel_appointment(
    token: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> HTMLResponse:
    """点击邮件取消链接 → 标记 status='cancelled' + 取消 pending reminders。"""
    appt = await _load_appointment_by_token(db, token)
    if appt is None:
        return _not_found_html()

    appt.status = "cancelled"
    await db.commit()

    # 取消 pending reminder jobs — 与 Node 端 cancelReminders(appt.id) 一致.
    # Phase X TBD: app.jobs.schedule_reminders 模块 port 完成后改实调用。
    # 此处 swallow exception 防取消 job 失败阻塞用户看到 UI (Node 也未 try/catch
    # 但 dynamic import 失败抛 unhandled, 我们这里更保守 fail-safe)。
    try:
        await _cancel_pending_reminders(appt.id)
    except Exception:
        logger.exception("Failed to cancel pending reminders for appointment %s", appt.id)

    return HTMLResponse(
        content="""<html><head><meta charset="utf-8"><title>预约已取消</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:60px">
        <h1 style="color:#dc2626">预约已取消</h1>
        <p>您的预约已取消。如需重新预约，请联系咨询师。</p>
      </body></html>"""
    )


async def _cancel_pending_reminders(appointment_id: uuid.UUID) -> None:
    """
    取消 pending reminder jobs — Phase X TBD。

    Node 端::

        const { cancelReminders } = await import('../../jobs/schedule-reminders.js');
        await cancelReminders(appt.id);

    Python 端 ``app.jobs.schedule_reminders`` 还没 port (cron job 系统在
    Phase X TBD), 当前 no-op。占位函数让 router 调用稳定, 后期切 import 即可。
    """
    _ = appointment_id
    return None
