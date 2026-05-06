"""Phase 5 P0 fix (Fix 8): 公开端点 rate limit 防灌水 / 暴破 / 短信滥用。

实现选型:
  启动期用 ``slowapi`` (基于 IP, 内存 storage) — 单 worker 内有效。
  Phase 7+ 切 Redis backend (跨 worker 共享 + 持久) 通过 ``Limiter(storage_uri=…)``。

关键端点防护 (按 Fix 8 spec):
  - POST /api/auth/login                                     5/minute
  - POST /api/auth/forgot-password                           3/minute
  - POST /api/auth/reset-password                            5/minute
  - POST /api/public/counseling/{slug}/register              5/minute
  - POST /api/public/eap/{slug}/register                     5/minute
  - POST /api/public/parent-bind/{token}                    10/minute

生产环境:
  Caddy / Cloudflare 做第一道连接级 rate-limit (covers DDoS)。
  本中间件做应用级 (针对特定路径 + IP)。装饰器方式让保护与端点逻辑共置。

测试 (TDD):
  跑 N+1 次同一端点, 第 N+1 次必须返 429 (RateLimitExceeded → 429).

  注: pytest 测试时若不想触发限流, 可用 ``limiter.reset()`` 或 fixture 重置 storage.
"""

from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address

# Phase 5: 不设 default_limits 全局兜底 — 跨测试 storage reset 不彻底时会导致
# 1500+ 测试积累的请求触发误 429。生产用 Caddy / Cloudflare 做连接级第一道兜底,
# 本中间件只装饰具体敏感端点 (login / forgot / register / parent-bind etc).
limiter: Limiter = Limiter(key_func=get_remote_address)

__all__ = ["limiter"]
