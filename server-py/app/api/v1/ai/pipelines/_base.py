"""
Pipeline 共享底座 — BYOK 调用点 + usage tracking 通用 helper。

所有 33 pipelines 的"调用 LLM"路径统一走 ``call_llm_for_pipeline`` (Phase 3 阶段
是 stub, Phase 5 接入真 prompt 时换真调用 + 删 mock 分支)。

Stub 行为 (Phase 3):
  1. ``await resolve_ai_credential(db, org_id=org_id)`` — **真**走 resolver,
     验证 BYOK 端到端, fallback / PHI / decrypt 都跑过
  2. ``AIClient(api_key=cred.api_key, base_url=cred.base_url, model=cred.model)`` — **真**构造
  3. ``await log_ai_usage(...)`` — **真** insert ``ai_call_logs`` (mock token 数)
  4. 返回 ``stub_result`` (业务 mock dict / str), Phase 5 替换为真 ``await client.generate_json(...)``

为什么不直接 raise NotImplementedError:
  - 测试需要验证 BYOK plumbing 是真的接通, 不是占位符
  - 路由层的 e2e snapshot 测试 (Node 端 ai.routes.test.ts 同款) 需要 200 响应

切换到真实调用时 (Phase 5):
  把 ``stub_result`` 参数改成 ``prompt_factory: callable`` (system + user prompt 生成函数),
  内部调 ``await client.generate_json(system, user, opts)``。
"""

from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.credential_resolver import resolve_ai_credential
from app.api.v1.ai.providers.openai_compatible import (
    AIClient,
    AIClientCallOptions,
    ChatMessage,
)
from app.api.v1.ai.usage_tracker import AiCallContext, log_ai_usage


async def call_llm_for_pipeline(
    db: AsyncSession,
    *,
    org_id: str | UUID | None,
    user_id: str | UUID | None,
    pipeline: str,
    stub_result: Any,
    stub_kind: Literal["json", "string"] = "json",
) -> Any:
    """
    BYOK 调用点 — 真 resolve credential + 真 construct AIClient + 真 log usage,
    业务结果走 stub。

    Args:
        db: SQLAlchemy AsyncSession
        org_id: 当前 org (用于 fallback chain + PHI 拦截 + usage log)
        user_id: 操作人 (写到 ai_call_logs.user_id)
        pipeline: pipeline 名 ('triage' / 'risk-detection' / ...) — 写到 ai_call_logs.pipeline
        stub_result: Phase 3 阶段的 mock 业务结果 (Phase 5 替换为真 LLM 输出)
        stub_kind: 'json' (返 dict) / 'string' (返字符串) — 验证调用点

    Returns:
        ``stub_result`` 原值 (Phase 5 改成 LLM 真输出)。

    Raises:
        ValidationError: 凭据未配置 (resolver 内部, 真错误暴露给 caller)
        PHIComplianceError: org 未声明 PHI 出境同意 + 凭据是 global
        CryptoError: 凭据加密 / 主密钥配置错
    """
    cred = await resolve_ai_credential(db, org_id=org_id, provider="openai-compatible")

    # 真造 AIClient (Phase 5 这条不变, stub 阶段也要构造 — 验证 cred → client 装配)
    client = AIClient(
        api_key=cred.api_key,
        base_url=cred.base_url,
        model=cred.model,
    )

    # Phase 5: 此处替换为
    #   result = await client.generate_json(SYSTEM_PROMPT, USER_PROMPT, opts)
    # 现在仅验证 client 配置成功 (有 api_key 就算 ready)
    _ = client.is_configured  # 用一下 (silence linter unused warning)

    # 真写 ai_call_logs (mock token 数, 真 row)
    if org_id is not None:
        ctx = AiCallContext(
            org_id=str(org_id),
            user_id=str(user_id) if user_id else None,
            pipeline=pipeline,
        )
        await log_ai_usage(
            db,
            ctx,
            prompt_tokens=0,
            completion_tokens=0,
            total_tokens=0,
            model=cred.model,
        )

    _ = stub_kind  # 暂未使用, Phase 5 区分用
    return stub_result


__all__ = [
    "AIClient",
    "AIClientCallOptions",
    "AiCallContext",
    "ChatMessage",
    "call_llm_for_pipeline",
]
