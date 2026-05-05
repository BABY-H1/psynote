"""
Celery job queues — Phase 4 替代 Node BullMQ (server/src/jobs/*.ts) 的 Python 等价。

3 个 queue:
  - ``compliance`` — 合规审核 (e.g. session_notes 没及时签字超 30 天 → 通知督导)
  - ``reminders`` — 预约提醒 (前 1 天 / 前 1 小时, 镜像 Node reminder.worker.ts)
  - ``follow-up`` — 随访推送 (镜像 Node follow-up.worker.ts)

启动方式 (production):
    celery -A app.jobs.celery_app worker --loglevel=info --queues=compliance,reminders,follow-up
    celery -A app.jobs.celery_app beat --loglevel=info  # 定时调度

启动方式 (dev/test):
    任务 ALWAYS_EAGER=True (test mode) 同步执行, 无 Redis/worker 依赖.

详细设计见 ``celery_app.py`` 和各 queue 的 ``compliance.py`` / ``reminders.py`` /
``followup.py``.
"""

from __future__ import annotations

from app.jobs.celery_app import celery_app

__all__ = ["celery_app"]
