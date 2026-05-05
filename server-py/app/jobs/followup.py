"""
Follow-up queue tasks — 镜像 Node ``server/src/jobs/follow-up.worker.ts``。

业务: 扫 ``follow_up_plans``, 找 ``status='active'`` 且 ``next_due <= now`` 的计划,
通知咨询师 (in-app) + 可选邮件给客户. Node 端策略: 一日一扫 (08:00 UTC), Python
端用 09:00 (Beat schedule 中改) 让两端并跑时不冲突。

Phase 4 实装范围:
  - ``dispatch_due_followups`` Beat 任务签名 + 扫描查询
  - 通知 / 邮件副作用是 stub (logger.info), Phase 5+ 接 notification_service / mailer
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import and_, select

from app.core.database import async_session_maker
from app.db.models.follow_up_plans import FollowUpPlan
from app.jobs.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.jobs.followup.dispatch_due_followups")
def dispatch_due_followups() -> dict[str, Any]:
    """每天 09:00 跑 — 扫所有 active follow_up_plans 已到期, 通知咨询师。

    返回 ``{"due_count": N, "notified_counselors": N, "notified_clients": M}``。
    """
    import asyncio

    return asyncio.run(_dispatch_due_followups_async())


@celery_app.task(name="app.jobs.followup.notify_followup")
def notify_followup(plan_id: str) -> dict[str, Any]:
    """单 plan fan-out 任务 — 允许手动 trigger / Beat 扫到时 enqueue。"""
    import asyncio

    return asyncio.run(_notify_followup_async(plan_id))


# ─── async 实现 ─────────────────────────────────────────────────


async def _dispatch_due_followups_async() -> dict[str, Any]:
    """扫 active 且到期的 follow_up_plans, 一行通知一次。"""
    now = datetime.now(UTC)
    notified_counselors = 0
    notified_clients = 0

    async with async_session_maker() as db:
        q = select(FollowUpPlan).where(
            and_(
                FollowUpPlan.status == "active",
                FollowUpPlan.next_due.is_not(None),
                FollowUpPlan.next_due <= now,
            )
        )
        rows = (await db.execute(q)).scalars().all()
        due_count = len(rows)

        for plan in rows:
            # Phase 4 stub: 仅 logger; Phase 5+ 接 create_notification + sendEmail.
            logger.info(
                "[followup] due plan id=%s org=%s counselor=%s next_due=%s — would notify counselor",
                plan.id,
                plan.org_id,
                plan.counselor_id,
                plan.next_due,
            )
            notified_counselors += 1
            # Node 端检查 client.email 后发邮件; 这里 stub 假设都能发
            notified_clients += 1

    logger.info(
        "[followup] dispatch_due_followups complete due=%s counselors=%s clients=%s",
        due_count,
        notified_counselors,
        notified_clients,
    )
    return {
        "due_count": due_count,
        "notified_counselors": notified_counselors,
        "notified_clients": notified_clients,
    }


async def _notify_followup_async(plan_id: str) -> dict[str, Any]:
    """单 plan 通知. UUID 容错 + status 检查 (与 active 冲突时 skip)。"""
    import uuid as _uuid

    try:
        pid = _uuid.UUID(plan_id)
    except (ValueError, TypeError):
        return {"notified": False, "reason": "invalid_plan_id"}

    async with async_session_maker() as db:
        q = select(FollowUpPlan).where(FollowUpPlan.id == pid).limit(1)
        plan = (await db.execute(q)).scalar_one_or_none()
        if plan is None:
            return {"notified": False, "reason": "not_found"}
        if plan.status != "active":
            return {"notified": False, "reason": f"plan_status_{plan.status}"}

        logger.info(
            "[followup] notifying for plan id=%s counselor=%s",
            plan_id,
            plan.counselor_id,
        )

    return {"notified": True, "plan_id": plan_id}


__all__ = ["dispatch_due_followups", "notify_followup"]
