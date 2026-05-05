"""
Email 发送 utility — 镜像 server/src/lib/mailer.ts (Phase 4 真实装)。

Phase 4 替换 Phase 3 的 logger stub 为 aiosmtplib 真发邮件:

  - SMTP_DEV_MODE=True (默认)  → 仅 logger.info, 不真连 SMTP (单元测试 / 本地 dev 默认)
  - SMTP_DEV_MODE=False        → aiosmtplib.send 经 SMTP_HOST/PORT/USER/PASS 实发

设计:
  - HTML 邮件 + 纯文本 fallback (Jinja2 模板 inline, 不外置文件 — 邮件简单, 一份模板足够)
  - 失败 raise (caller 在 BackgroundTasks 里 catch — 与 Node fire-and-forget 行为一致)
  - 测试: monkeypatch ``aiosmtplib.send`` mock 调用; DEV_MODE=True 时 logger 输出无副作用

签名稳定 (与 Phase 3 stub 一致): ``async def send_password_reset_email(to, reset_link) -> None``
"""

from __future__ import annotations

import logging
from email.message import EmailMessage
from typing import Final

import aiosmtplib
from jinja2 import Environment, select_autoescape

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Jinja2 env (autoescape on for HTML — XSS 防御; 纯文本不通过 Jinja, 直接 f-string)。
# 邮件模板内联 — 邮件场景固定文案 + 一两个变量, 不值得外置 templates 目录。
_jinja_env: Final[Environment] = Environment(
    autoescape=select_autoescape(("html", "htm")),
    trim_blocks=True,
    lstrip_blocks=True,
)

_PASSWORD_RESET_HTML_TEMPLATE: Final[str] = """\
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>密码重置</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 24px auto; color: #1f2937;">
  <h2 style="color: #111827;">重置 Psynote 密码</h2>
  <p>您好,</p>
  <p>我们收到了重置您 Psynote 账户密码的请求。点击下方按钮设置新密码 (链接 15 分钟内有效):</p>
  <p style="text-align: center; margin: 24px 0;">
    <a href="{{ reset_link }}" style="display: inline-block; padding: 12px 24px; background: #4f46e5; color: #fff; text-decoration: none; border-radius: 6px;">重置密码</a>
  </p>
  <p style="color: #6b7280; font-size: 14px;">如果按钮无法点击, 请复制以下链接到浏览器地址栏:</p>
  <p style="word-break: break-all; color: #4f46e5; font-size: 14px;">{{ reset_link }}</p>
  <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;">
  <p style="color: #6b7280; font-size: 12px;">如果您没有发起此请求, 请忽略此邮件 — 您的密码不会被改动。</p>
</body>
</html>
"""

_PASSWORD_RESET_TEXT_TEMPLATE: Final[str] = """\
重置 Psynote 密码

您好,

我们收到了重置您 Psynote 账户密码的请求。请打开下方链接设置新密码 (15 分钟内有效):

{reset_link}

如果您没有发起此请求, 请忽略此邮件 — 您的密码不会被改动。
"""


def _render_password_reset_html(reset_link: str) -> str:
    """渲染 HTML 邮件正文 (Jinja2 autoescape 防 XSS)。"""
    template = _jinja_env.from_string(_PASSWORD_RESET_HTML_TEMPLATE)
    return template.render(reset_link=reset_link)


def _render_password_reset_text(reset_link: str) -> str:
    """渲染纯文本 fallback (不通过 Jinja, 链接是 url-safe hex token, 无 XSS 风险)。"""
    return _PASSWORD_RESET_TEXT_TEMPLATE.format(reset_link=reset_link)


def _build_password_reset_message(*, to: str, sender: str, reset_link: str) -> EmailMessage:
    """构造 multipart/alternative 邮件 (HTML + text fallback)。

    分离构造逻辑便于测试: 测试可 mock ``aiosmtplib.send`` 后断言 ``EmailMessage`` 内容。
    """
    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = to
    msg["Subject"] = "Psynote 密码重置"
    # text first, html second → 兼容只支持纯文本的客户端 (老邮件读器)
    msg.set_content(_render_password_reset_text(reset_link))
    msg.add_alternative(_render_password_reset_html(reset_link), subtype="html")
    return msg


async def send_password_reset_email(to: str, reset_link: str) -> None:
    """
    发送密码重置邮件。Phase 4 真实装: aiosmtplib + Jinja2 HTML/text。

    Args:
        to:         收件邮箱 (已校验在 caller — Pydantic EmailStr)
        reset_link: 含明文 token 的完整 URL (e.g. ``https://app.psynote.com/reset-password?token=...``)

    Raises:
        SMTPException: 真发模式下 SMTP 连接 / auth / send 失败 — caller (auth router 在
            BackgroundTasks) 已 catch, 用户仍得到 200 (防邮件枚举 + 不暴露 SMTP 故障)。

    DEV_MODE=True (默认) 时仅 logger.info 不真连; production 部署 ``SMTP_DEV_MODE=false``
    + ``SMTP_HOST`` 后真发。
    """
    settings = get_settings()

    if settings.SMTP_DEV_MODE:
        logger.info(
            "password reset email (DEV_MODE — not sent): to=%s link=%s from=%s",
            to,
            reset_link,
            settings.SMTP_FROM,
        )
        return

    if not settings.SMTP_HOST:
        # production 模式但 SMTP_HOST 为空 → 配置事故, 主动暴露而非静默吞
        raise RuntimeError(
            "SMTP_DEV_MODE is False but SMTP_HOST is not configured; "
            "set SMTP_HOST or enable SMTP_DEV_MODE=true for stub mode"
        )

    msg = _build_password_reset_message(
        to=to,
        sender=settings.SMTP_FROM,
        reset_link=reset_link,
    )

    # aiosmtplib.send 一次性 connect + auth + send + close, 不复用连接 — 我们邮件量小,
    # 不需要持久 SMTP pool. 与 Node nodemailer createTransport.sendMail 行为对齐。
    await aiosmtplib.send(
        msg,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER,
        password=settings.SMTP_PASS,
        start_tls=settings.SMTP_USE_TLS,
    )
    logger.info("password reset email sent: to=%s host=%s", to, settings.SMTP_HOST)


__all__ = [
    "send_password_reset_email",
]
