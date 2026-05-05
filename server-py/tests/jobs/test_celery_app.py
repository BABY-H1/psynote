"""
Tests for app/jobs/celery_app.py — Celery 实例 + Beat schedule 配置。
"""

from __future__ import annotations

import pytest


def test_celery_app_has_3_queues_routed() -> None:
    """task_routes 配置: compliance / reminders / followup 各自路由到对应 queue。"""
    from app.jobs.celery_app import celery_app

    routes = celery_app.conf.task_routes
    assert routes is not None
    # 用 *.* 匹配模块下所有任务
    assert routes["app.jobs.compliance.*"] == {"queue": "compliance"}
    assert routes["app.jobs.reminders.*"] == {"queue": "reminders"}
    assert routes["app.jobs.followup.*"] == {"queue": "follow-up"}


def test_celery_app_includes_3_modules() -> None:
    """include 列表要含 3 个 job module — 让 worker 启动时自动 register tasks。"""
    from app.jobs.celery_app import celery_app

    includes = celery_app.conf.include
    assert "app.jobs.compliance" in includes
    assert "app.jobs.reminders" in includes
    assert "app.jobs.followup" in includes


def test_celery_app_uses_redis_broker_from_settings(base_env: pytest.MonkeyPatch) -> None:
    """broker URL 取自 settings.effective_celery_broker (REDIS_URL fallback)。"""
    from app.jobs.celery_app import celery_app

    # base_env 默认 REDIS_URL=redis://localhost:6379 (或我们没显式 set; 验有非空)
    assert celery_app.conf.broker_url is not None
    assert "redis" in celery_app.conf.broker_url


def test_celery_app_timezone_asia_shanghai() -> None:
    """与 Node toLocaleString('zh-CN') 1:1 — 时区配置不能漂。"""
    from app.jobs.celery_app import celery_app

    assert celery_app.conf.timezone == "Asia/Shanghai"


def test_celery_app_json_serializer() -> None:
    """JSON 序列化 — 安全考虑禁 pickle (避免 RCE 风险, 默认 OK)。"""
    from app.jobs.celery_app import celery_app

    assert celery_app.conf.task_serializer == "json"
    assert "json" in celery_app.conf.accept_content
    assert celery_app.conf.result_serializer == "json"


def test_beat_schedule_has_3_periodic_tasks() -> None:
    """Beat schedule 必须包含 compliance / reminders / followup 3 个定时任务。"""
    from app.jobs.beat_schedule import beat_schedule

    assert "compliance-daily-check" in beat_schedule
    assert "reminders-hourly" in beat_schedule
    assert "followup-daily" in beat_schedule

    # 任务名指向正确的 module
    assert beat_schedule["compliance-daily-check"]["task"] == "app.jobs.compliance.daily_check"
    assert beat_schedule["reminders-hourly"]["task"] == "app.jobs.reminders.dispatch_due_reminders"
    assert beat_schedule["followup-daily"]["task"] == "app.jobs.followup.dispatch_due_followups"


def test_configure_test_mode_enables_eager() -> None:
    """``configure_test_mode`` 让 ``task_always_eager=True`` (单测无 worker 也跑)。"""
    from app.jobs.celery_app import celery_app, configure_test_mode

    configure_test_mode()
    assert celery_app.conf.task_always_eager is True
    assert celery_app.conf.task_eager_propagates is True
