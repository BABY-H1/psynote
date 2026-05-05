"""
Celery app instance — 替代 Node BullMQ 的 ``server/src/jobs/queue.ts``。

设计:
  - 一个全局 ``celery_app`` 实例, broker / backend 都走 Redis (与 BullMQ 保持架构对齐)
  - 3 个 queue 通过 ``task_routes`` 路由 (``app.jobs.compliance.*`` →
    ``compliance`` queue; reminders / follow-up 同理)
  - Beat schedule 集中在 ``beat_schedule.py``, 工作日 cron 表达式与 Node BullMQ
    repeatable jobs 对齐 (08:00 daily for follow-up 等)
  - timezone Asia/Shanghai — Node 端代码也用 toLocaleString('zh-CN'), 1:1 对齐

测试模式 (CELERY_TASK_ALWAYS_EAGER=True via env):
  - 任务同步执行 (无需 Redis worker)
  - ``celery_app.conf.task_always_eager`` 在 ``configure_test_mode()`` 中显式设
"""

from __future__ import annotations

from celery import Celery

from app.core.config import get_settings


def _build_celery_app() -> Celery:
    """构造 Celery 实例 — 延迟到 import 时调一次, 不在 module 加载时立刻读 settings.

    ``get_settings()`` 启动期硬约束 (env 不合法 sys.exit 1), 所以 Celery worker
    启动时 (``celery -A app.jobs.celery_app worker``) 会按预期早失败而非神秘 crash。
    """
    settings = get_settings()
    app = Celery(
        "psynote",
        broker=settings.effective_celery_broker,
        backend=settings.effective_celery_backend,
        # include 列表 — Celery 启动时 import 这些 module, 否则 task 注册不到 broker
        include=[
            "app.jobs.compliance",
            "app.jobs.reminders",
            "app.jobs.followup",
        ],
    )

    app.conf.update(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        timezone="Asia/Shanghai",
        enable_utc=True,
        # task_routes — 把不同 module 路由到对应 queue, 与 Node BullMQ 3 个独立 Queue 实例
        # 行为对齐. worker 启动时 ``--queues=compliance,reminders,follow-up`` 即可消费全部.
        task_routes={
            "app.jobs.compliance.*": {"queue": "compliance"},
            "app.jobs.reminders.*": {"queue": "reminders"},
            "app.jobs.followup.*": {"queue": "follow-up"},
        },
        # broker_connection_retry_on_startup — Celery 6 默认 False 会 deprecation 警告;
        # 这里显式设 True 与 Celery 5 兼容, production 启动时 Redis 暂未起也不挂 (重试 10 秒).
        broker_connection_retry_on_startup=True,
    )

    # Beat schedule (lazy import 避免循环依赖)
    from app.jobs.beat_schedule import beat_schedule

    app.conf.beat_schedule = beat_schedule

    return app


celery_app: Celery = _build_celery_app()


def configure_test_mode() -> None:
    """让单元测试同步跑任务, 无需 Redis broker。

    测试 fixture 在 setup 调一次. 与 ``CELERY_TASK_ALWAYS_EAGER=True`` env var 行为
    等价, 但显式配置避免依赖 env 状态.
    """
    celery_app.conf.update(
        task_always_eager=True,
        task_eager_propagates=True,  # eager 模式下任务异常直接 raise, 不静默
    )


__all__ = ["celery_app", "configure_test_mode"]
