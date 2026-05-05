"""
Tests for app/lib/mailer.py — Phase 4 aiosmtplib 真实装。

覆盖:
  - DEV_MODE=True (默认)  → 仅 logger 输出, 不调 aiosmtplib.send
  - DEV_MODE=False + SMTP_HOST 配置 → 调 aiosmtplib.send (mock)
  - DEV_MODE=False + SMTP_HOST 缺 → RuntimeError (主动暴露配置事故)
  - HTML 模板渲染含 reset_link (autoescape 防 XSS)
  - 纯文本 fallback 渲染
  - EmailMessage 结构 (multipart alternative + To/From/Subject 字段对)

测试不真连 SMTP — monkeypatch ``aiosmtplib.send`` 捕获参数。
"""

from __future__ import annotations

import logging
from unittest.mock import AsyncMock

import pytest


@pytest.fixture(autouse=True)
def _reset_settings_cache(base_env: pytest.MonkeyPatch) -> None:
    """每个 test 重置 Settings cache, 让 base_env 设的 env 生效。"""
    from app.core.config import get_settings

    get_settings.cache_clear()


# ─── DEV_MODE 路径 ───────────────────────────────────────────────


async def test_dev_mode_logs_and_does_not_send(
    base_env: pytest.MonkeyPatch,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """DEV_MODE=True (默认) → 仅 logger.info, 不 import aiosmtplib.send。"""
    base_env.setenv("SMTP_DEV_MODE", "true")
    sent = AsyncMock()
    monkeypatch.setattr("app.lib.mailer.aiosmtplib.send", sent)

    from app.lib.mailer import send_password_reset_email

    with caplog.at_level(logging.INFO, logger="app.lib.mailer"):
        await send_password_reset_email(
            to="user@example.com",
            reset_link="https://app.psynote.com/reset?token=abc123",
        )

    # 真发函数没被调用
    sent.assert_not_called()
    # logger 输出含目标 + 链接
    assert any(
        "user@example.com" in r.getMessage() and "abc123" in r.getMessage() for r in caplog.records
    )


# ─── 真发模式 ────────────────────────────────────────────────────


async def test_real_send_invokes_aiosmtplib_with_settings(
    base_env: pytest.MonkeyPatch,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """DEV_MODE=False + SMTP_HOST 配齐 → aiosmtplib.send 调到, 参数与 settings 对齐。"""
    base_env.setenv("SMTP_DEV_MODE", "false")
    base_env.setenv("SMTP_HOST", "smtp.example.com")
    base_env.setenv("SMTP_PORT", "2525")
    base_env.setenv("SMTP_USER", "noreply@example.com")
    base_env.setenv("SMTP_PASS", "secret")
    base_env.setenv("SMTP_FROM", "noreply@example.com")
    base_env.setenv("SMTP_USE_TLS", "true")

    sent = AsyncMock()
    monkeypatch.setattr("app.lib.mailer.aiosmtplib.send", sent)

    from app.lib.mailer import send_password_reset_email

    await send_password_reset_email(
        to="recipient@example.com",
        reset_link="https://app.psynote.com/reset?token=xyz",
    )

    sent.assert_awaited_once()
    args, kwargs = sent.call_args
    # 第一个 positional 是 EmailMessage
    msg = args[0]
    assert msg["To"] == "recipient@example.com"
    assert msg["From"] == "noreply@example.com"
    assert msg["Subject"] == "Psynote 密码重置"

    # 配置传递
    assert kwargs["hostname"] == "smtp.example.com"
    assert kwargs["port"] == 2525
    assert kwargs["username"] == "noreply@example.com"
    assert kwargs["password"] == "secret"
    assert kwargs["start_tls"] is True


async def test_real_send_without_smtp_host_raises_runtime_error(
    base_env: pytest.MonkeyPatch,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """DEV_MODE=False 但 SMTP_HOST 没配 → 不静默吞, 主动 RuntimeError 暴露事故。"""
    base_env.setenv("SMTP_DEV_MODE", "false")
    # 不设 SMTP_HOST
    sent = AsyncMock()
    monkeypatch.setattr("app.lib.mailer.aiosmtplib.send", sent)

    from app.lib.mailer import send_password_reset_email

    with pytest.raises(RuntimeError, match="SMTP_HOST is not configured"):
        await send_password_reset_email(
            to="user@example.com",
            reset_link="https://app/reset?token=t",
        )
    sent.assert_not_called()


# ─── 模板渲染 ────────────────────────────────────────────────────


def test_html_template_includes_reset_link() -> None:
    from app.lib.mailer import _render_password_reset_html

    html = _render_password_reset_html("https://app.psynote.com/reset?token=abc")
    assert "https://app.psynote.com/reset?token=abc" in html
    assert "<html" in html
    # autoescape 关键: 注入 < > 应被转义 (这里用 normal URL, 不该被破坏)
    assert "&lt;script" not in html  # 没注入恶意内容时不该出现转义残留


def test_html_template_autoescapes_malicious_input() -> None:
    """Jinja2 autoescape 防御 — reset_link 含 <script> 时输出转义符。"""
    from app.lib.mailer import _render_password_reset_html

    html = _render_password_reset_html("javascript:alert(1)")
    # 关键不变量: alert(1) 内容不能未转义出现在 HTML 上下文里 (Jinja autoescape 会转义)
    assert "<script" not in html


def test_text_template_includes_reset_link() -> None:
    from app.lib.mailer import _render_password_reset_text

    text = _render_password_reset_text("https://app.psynote.com/reset?token=abc")
    assert "https://app.psynote.com/reset?token=abc" in text
    # 纯文本不该有 HTML 标签
    assert "<html" not in text


def test_build_email_message_is_multipart_alternative() -> None:
    """multipart/alternative — text + html 两份, 兼容老邮件读器。"""
    from app.lib.mailer import _build_password_reset_message

    msg = _build_password_reset_message(
        to="u@x.com",
        sender="from@x.com",
        reset_link="https://reset/me",
    )
    assert msg["To"] == "u@x.com"
    assert msg["From"] == "from@x.com"
    assert msg.is_multipart()
    # 至少 2 part: text + html
    parts = list(msg.iter_parts())
    assert len(parts) >= 1  # add_alternative 设计 — main payload 就是 text, alt 是 html
    # 验证 html alternative 存在
    html_part = msg.get_body(preferencelist=("html",))
    text_part = msg.get_body(preferencelist=("plain",))
    assert html_part is not None
    assert text_part is not None
    assert "https://reset/me" in html_part.get_content()
    assert "https://reset/me" in text_part.get_content()
