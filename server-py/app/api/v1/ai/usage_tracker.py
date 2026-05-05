"""
AI 用量记录 — 镜像 ``server/src/modules/ai/usage-tracker.ts``.

每次 AI pipeline 成功响应后 fire-and-forget 写一行 ``ai_call_logs``,
SubscriptionTab 按月汇总对照 ``organizations.settings.aiConfig.monthlyTokenLimit``。

设计原则 (与 Node 一致):
  - **fire-and-forget**: 任何 DB 异常 swallow + warn log, 不阻塞主请求
  - **空 org_id 跳过**: 系统级任务 (no-org context) 不应写 org-scoped log
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.ai_call_logs import AICallLog

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AiCallContext:
    """AI 调用上下文, 路由层注入 → AIClient 透传 → log_ai_usage 写库。"""

    org_id: str | uuid.UUID  # 必填 — 没 org 不写日志
    pipeline: str  # 'triage' / 'risk-detection' / 'soap-analysis' / ...
    user_id: str | uuid.UUID | None = None  # 可空 — system task 没 user


async def log_ai_usage(
    db: AsyncSession,
    ctx: AiCallContext,
    *,
    prompt_tokens: int,
    completion_tokens: int,
    total_tokens: int,
    model: str | None = None,
) -> None:
    """记一行 ``ai_call_logs``。错误 swallow + log 给运维。

    Args:
        db: SQLAlchemy AsyncSession
        ctx: AiCallContext (org_id / pipeline / user_id)
        prompt_tokens: provider 返回的 usage.prompt_tokens
        completion_tokens: provider 返回的 usage.completion_tokens
        total_tokens: provider 返回的 usage.total_tokens
        model: 实际使用的 model 名 (e.g. 'gpt-4o', 'qwen-plus')
    """
    if not ctx.org_id:
        return
    try:
        org_uuid = (
            uuid.UUID(str(ctx.org_id)) if not isinstance(ctx.org_id, uuid.UUID) else ctx.org_id
        )
        user_uuid: uuid.UUID | None = None
        if ctx.user_id is not None:
            user_uuid = (
                uuid.UUID(str(ctx.user_id))
                if not isinstance(ctx.user_id, uuid.UUID)
                else ctx.user_id
            )
        record = AICallLog(
            org_id=org_uuid,
            user_id=user_uuid,
            pipeline=ctx.pipeline,
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
        )
        db.add(record)
        # flush 而非 commit — 让外层 transaction 决定边界 (镜像 record_audit / record_phi_access 风格)
        await db.flush()
    except Exception as exc:  # broad on purpose — Node 端 .catch 同语义
        logger.warning("[ai-usage-tracker] failed to log: %s", exc)


__all__ = [
    "AiCallContext",
    "log_ai_usage",
]
