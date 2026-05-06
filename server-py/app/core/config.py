"""
App 配置 — Pydantic Settings, 镜像 server/src/config/env.ts。

单一可信来源 (single source of truth) 用于环境变量驱动的配置。
所有字段名 / 默认值 / 校验规则必须与 Node 端 env.ts 1:1 对齐, 这样
docker-compose.yml 同一份 env section 既喂 Node 也喂 Python。

W0.3 安全审计 (2026-05-03) 重做:
  JWT_SECRET 必须 >=32 chars, 任何环境拒启。
  Node 端原修复见 commit 6fbdd41 + server/src/config/env.test.ts。

测试: tests/core/test_config.py 14 个用例覆盖必填项 / 默认值 / W0.3 / 类型强转。

注:
  - 生产代码用 get_settings() (lru_cache 单例)
  - 测试用 Settings(_env_file=None) 直接构造 (bypass .env 文件)
  - main.py 在启动时调用 get_settings() 触发 ValidationError 早失败
"""

from __future__ import annotations

import sys
from functools import lru_cache
from typing import Literal

from pydantic import Field, ValidationError, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Phase 5 P1 (2026-05-06): KEY_ENCRYPTION_KEY 的 dev 占位值,production 启动期必须
# 校验非此值,否则任何 BYOK 加密都用了"全员共享的开源默认密钥",安全完全失效。
# 此常量与下方字段 default 必须 1:1 同步。
_KEY_ENCRYPTION_KEY_DEV_DEFAULT = "cHN5bm90ZS1kZXYtbWFzdGVyLWtleS0zMi1ieXRlcyE="


class Settings(BaseSettings):
    """镜像 server/src/config/env.ts 的 zod schema。"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    # ─── Required (无默认值, 缺失会 ValidationError) ──────────────
    DATABASE_URL: str
    JWT_SECRET: str = Field(
        min_length=32,
        description=(
            "JWT 签名密钥, 必须 >=32 chars (W0.3 安全审计修复)。"
            "生产建议: crypto.randomBytes(32).toString('hex') 生成 64 chars 十六进制。"
        ),
    )

    # ─── Defaults (镜像 env.ts) ──────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379"
    AI_API_KEY: str | None = None
    AI_BASE_URL: str = "https://api.openai.com/v1"
    AI_MODEL: str = "gpt-4o"
    PORT: int = 4000
    HOST: str = "0.0.0.0"
    NODE_ENV: Literal["development", "production", "test"] = "development"
    CLIENT_URL: str = "http://localhost:5173"
    PUBLIC_BASE_URL: str | None = None

    # ─── BYOK (Bring-Your-Own-Key) AES-256-GCM 主密钥 ─────────────
    # Phase 3 Tier 4 引入 — ai_credentials 表存储的 API key 用此密钥加密。
    # 32 bytes base64 编码; production 必须改默认值 (运维生成):
    #   python -c "import secrets, base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"
    # dev 默认值 (32 bytes "psynote-dev-master-key-not-for-prod" base64) 仅供本地开发 / unit test。
    # production 启动期硬约束在下方 _validate_production_secrets (强制非默认值);
    # 长度 + base64 校验在 app/lib/crypto.py 的 _load_master_key。
    KEY_ENCRYPTION_KEY: str = _KEY_ENCRYPTION_KEY_DEV_DEFAULT

    # ─── SMTP (Phase 4 — aiosmtplib 真发邮件) ─────────────────────
    # Node 端 nodemailer 用同一组 env (SMTP_HOST/PORT/USER/PASS/FROM), Python
    # aiosmtplib 严格 1:1 兼容; SMTP_DEV_MODE=True 时仅 logger 不真连 SMTP
    # (default 适用于 unit test / local dev, production docker-compose 显式
    # SMTP_DEV_MODE=false + 提供 SMTP_HOST/USER/PASS)。
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASS: str | None = None
    SMTP_FROM: str = "noreply@psynote.com"
    SMTP_USE_TLS: bool = True  # STARTTLS upgrade (587 standard); False = 25 plain
    SMTP_DEV_MODE: bool = True  # True → logger.info only (skip real send)

    # ─── Celery / job queues (Phase 4 — 替代 Node BullMQ) ─────────
    # Worker / Beat 走独立 docker-compose service, FastAPI app 不启动 Celery
    # worker (避免 import-time Redis socket); 此处仅声明 broker/backend URL,
    # CELERY_BROKER_URL 留空时 fall back to REDIS_URL (与 Node 行为一致)。
    CELERY_BROKER_URL: str | None = None
    CELERY_RESULT_BACKEND: str | None = None

    @property
    def effective_celery_broker(self) -> str:
        """优先 CELERY_BROKER_URL, 否则 REDIS_URL — 与 Node app.ts 行为一致。"""
        return self.CELERY_BROKER_URL or self.REDIS_URL

    @property
    def effective_celery_backend(self) -> str:
        return self.CELERY_RESULT_BACKEND or self.effective_celery_broker

    # ─── Phase 5 P1: production 启动期硬约束 ──────────────────────
    @model_validator(mode="after")
    def _validate_production_secrets(self) -> Settings:
        """production 环境拒启用 dev 默认密钥。

        触发条件: ``NODE_ENV == "production"`` 且 ``KEY_ENCRYPTION_KEY`` 仍是
        仓库 commit 的 dev 占位值。生产用此默认值会让所有 org 的 BYOK API key
        加密退化成"对全网公开" — 任何能 git clone 仓库的人都能解密 DB 里的密文。

        与 W0.3 的 JWT_SECRET 校验同等级关键, 启动期硬失败比运行时偷偷继续更安全。
        """
        if (
            self.NODE_ENV == "production"
            and self.KEY_ENCRYPTION_KEY == _KEY_ENCRYPTION_KEY_DEV_DEFAULT
        ):
            raise ValueError(
                "KEY_ENCRYPTION_KEY 是 dev 默认值, production 必须改 — "
                '运维生成: python -c "import secrets, base64; '
                'print(base64.b64encode(secrets.token_bytes(32)).decode())"'
            )
        return self


@lru_cache
def get_settings() -> Settings:
    """缓存的 Settings 单例。

    生产代码统一通过此函数获取配置, 避免每次都重新读 env。
    测试用 Settings() 直接 construct + monkeypatch.setenv (bypass cache)。
    """
    try:
        return Settings()
    except ValidationError as exc:
        # 镜像 env.ts 行为: 配置错就 hard-fail, 不带任何默认 fallback。
        # 写到 stderr 而非 logger, 因为 logger 可能依赖 settings。
        print(
            f"Invalid environment variables:\n{exc}",
            file=sys.stderr,
        )
        sys.exit(1)
