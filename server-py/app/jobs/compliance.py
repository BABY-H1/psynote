"""
Compliance queue tasks — Phase 4 框架。

Node 端 BullMQ 仅声明了 ``complianceQueue`` (server/src/jobs/queue.ts:13) 但没真
worker; 业务逻辑 inline 在 ``server/src/modules/compliance/compliance-review.service.ts``.
这里我们把"扫未签字 session_notes 超 30 天"的合规巡检搬进 Celery 周期任务, 一周
跑 7 次 (每天凌晨 03:00) 通知督导 + 写 audit log.

Phase 4 实装范围:
  - ``daily_check`` 任务签名 + 数据库会话获取 + 扫描查询逻辑
  - 通知 / audit 副作用是 stub (logger.info), Phase 5+ 接 notification_service 真发

Tasks:
  - ``daily_check``                  — Beat 定时调 (每天 03:00 全 org 扫一次)
  - ``check_org_session_notes(org_id)`` — fan-out 任务: 单 org 扫一次 (允许手动触发)
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import and_, select

from app.core.database import async_session_maker
from app.db.models.session_notes import SessionNote
from app.jobs.celery_app import celery_app

logger = logging.getLogger(__name__)


# 30 天未签字 (status != 'finalized' & status != 'reviewed') 视为合规风险
_OVERDUE_THRESHOLD_DAYS = 30


@celery_app.task(name="app.jobs.compliance.daily_check")
def daily_check() -> dict[str, Any]:
    """每天 03:00 跑 — 扫所有 org 未签字 session_notes 超 30 天, 通知督导。

    返回 ``{"overdue_count": N}`` 给 Celery result backend, 方便监控告警接 prometheus
    / grafana 看每天合规风险数量趋势.

    注: Celery 任务体不支持 async (sync only). 我们用同步 SQLAlchemy session 走查询;
    数据库 driver 是 asyncpg (async-only) — 因此用 ``async_session_maker`` 起 async
    session 后通过 ``asyncio.run`` 调真 async 函数. Celery worker 自身已经是同步进程,
    asyncio.run 不会冲突.
    """
    import asyncio

    return asyncio.run(_daily_check_async())


@celery_app.task(name="app.jobs.compliance.check_org_session_notes")
def check_org_session_notes(org_id: str) -> dict[str, Any]:
    """单 org fan-out 任务 — 允许手动 ``celery_app.send_task('...check_org_session_notes', args=[...])``
    触发 (e.g. 督导 dashboard "立即检查" 按钮).
    """
    import asyncio

    return asyncio.run(_check_org_session_notes_async(org_id))


# ─── async 实现 (Celery sync task 通过 asyncio.run 调) ─────────


async def _daily_check_async() -> dict[str, Any]:
    """扫描全 org 未签字 session_notes 超 30 天 → 通知督导 + 计数。"""
    threshold = datetime.now(UTC) - timedelta(days=_OVERDUE_THRESHOLD_DAYS)

    async with async_session_maker() as db:
        q = select(SessionNote).where(
            and_(
                SessionNote.status.in_(("draft", "submitted_for_review")),
                # mypy 不识别 hybrid timestamp; 用 created_at 阈值 (TimestampMixin 注入)
                SessionNote.created_at < threshold,
            )
        )
        rows = (await db.execute(q)).scalars().all()
        overdue_count = len(rows)

        # Phase 4 stub: 仅 logger; Phase 5+ 真接 notification_service.create_notification
        # + audit_log 写入. 业务上每张未签字记录通知对应督导 (counselor 自身的 supervisor).
        for note in rows:
            logger.info(
                "[compliance] overdue session_note id=%s org=%s counselor=%s status=%s "
                "created=%s — would notify supervisor",
                note.id,
                note.org_id,
                note.counselor_id,
                note.status,
                note.created_at,
            )

    logger.info("[compliance] daily_check complete — %s overdue notes", overdue_count)
    return {"overdue_count": overdue_count}


async def _check_org_session_notes_async(org_id: str) -> dict[str, Any]:
    """单 org 扫描. UUID 容错: 非法 org_id 返 ``{'overdue_count': 0, 'error': ...}``,
    不 raise (任务调用方多是 trigger button, 失败退 0 比 retry 风暴更优雅)。
    """
    import uuid as _uuid

    try:
        oid = _uuid.UUID(org_id)
    except (ValueError, TypeError):
        logger.warning("[compliance] invalid org_id=%s", org_id)
        return {"overdue_count": 0, "error": "invalid_org_id"}

    threshold = datetime.now(UTC) - timedelta(days=_OVERDUE_THRESHOLD_DAYS)

    async with async_session_maker() as db:
        q = select(SessionNote).where(
            and_(
                SessionNote.org_id == oid,
                SessionNote.status.in_(("draft", "submitted_for_review")),
                SessionNote.created_at < threshold,
            )
        )
        rows = (await db.execute(q)).scalars().all()
        overdue_count = len(rows)
        for note in rows:
            logger.info(
                "[compliance][org=%s] overdue session_note id=%s — would notify supervisor",
                org_id,
                note.id,
            )

    return {"overdue_count": overdue_count}


__all__ = ["check_org_session_notes", "daily_check"]
