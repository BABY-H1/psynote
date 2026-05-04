"""
Email 发送 utility — 镜像 server/src/lib/mailer.ts。

Phase 3 阶段: ``send_password_reset_email`` 是 stub (logger 打印 link, 不真发邮件)。
Phase 4 真实装 (aiosmtplib + SMTP_HOST/PORT/USER/PASS env vars), 函数签名稳定。

设计:
  - 失败不阻塞主请求 — 邮件发不出去时 logger.exception, 返回 None (与 Node
    auth/password-reset.routes.ts 的 fire-and-forget catch 行为一致)
  - 单元测试用 ``monkeypatch.setattr`` mock ``send_password_reset_email`` 捕获调用
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


async def send_password_reset_email(to: str, reset_link: str) -> None:
    """
    发送密码重置邮件。

    Args:
        to:         收件邮箱 (已校验在 caller)
        reset_link: 含明文 token 的完整 URL (e.g. ``https://app.psynote.com/reset-password?token=...``)

    Phase 3 stub 行为: 仅 log; Phase 4 接 aiosmtplib 真发。
    """
    # Phase 3 stub — Phase 4 替换为 aiosmtplib.send 实装
    logger.info("password reset email (stub): to=%s link=%s", to, reset_link)
