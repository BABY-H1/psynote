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

from pydantic import Field, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    # production 启动期硬约束在 app/lib/crypto.py 的 _load_master_key (强制非默认 + 长度校验)。
    KEY_ENCRYPTION_KEY: str = "cHN5bm90ZS1kZXYtbWFzdGVyLWtleS0zMi1ieXRlcyE="

    # ─── SMTP (production 启动硬约束在 lib/mailer.py, 这里只做声明) ──
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASS: str | None = None
    SMTP_FROM: str | None = None


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
