"""
Celery Beat schedule — 替代 Node BullMQ 的 repeatable jobs。

镜像 Node ``server/src/jobs/follow-up.worker.ts:scheduleDailyFollowUpScan`` 的
``cron='0 8 * * *'`` 与 reminder.worker.ts 的 BullMQ delayed jobs 行为, 但用
Celery Beat 的 crontab 调度一次性配置.

启动 Beat:
    celery -A app.jobs.celery_app beat --loglevel=info

Schedule:
  - compliance-daily-check  — 每天凌晨 03:00 (业务低峰), 扫描未签字 session_notes
  - reminders-hourly        — 每整点 :00, 扫近 1 小时 / 24 小时内待提醒的预约
  - followup-daily          — 每天 09:00, 扫到期 follow_up_plans (Node 用 08:00,
                              Python 改 09:00 让两边并跑时不冲突 — 实际生产 cutover
                              后改回 08:00 即可)
"""

from __future__ import annotations

from typing import Any

from celery.schedules import crontab

beat_schedule: dict[str, dict[str, Any]] = {
    "compliance-daily-check": {
        "task": "app.jobs.compliance.daily_check",
        "schedule": crontab(hour="3", minute="0"),
    },
    "reminders-hourly": {
        "task": "app.jobs.reminders.dispatch_due_reminders",
        "schedule": crontab(minute="0"),  # 每整点
    },
    "followup-daily": {
        "task": "app.jobs.followup.dispatch_due_followups",
        "schedule": crontab(hour="9", minute="0"),
    },
}


__all__ = ["beat_schedule"]
