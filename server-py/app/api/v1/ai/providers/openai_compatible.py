"""
OpenAI-compatible API client — 镜像 ``server/src/modules/ai/providers/openai-compatible.ts`` (267 行)。

工作 with any provider that implements the OpenAI ``/v1/chat/completions`` API
(OpenAI 官方 / Azure OpenAI / DeepSeek / Qwen / 阿里百炼 / 智谱 etc.)。

Phase 3 Tier 4 BYOK 改造:
  - **不再读 env** 的 api_key/base_url/model — 由 ``credential_resolver`` 注入
  - 路由层先 ``resolve_ai_credential(db, org_id=...)``, 拿 ``ResolvedCredential`` 后构造 ``AIClient``
  - usage_tracker 在 chat 成功响应后 fire-and-forget 写 ``ai_call_logs``

Node 端单例 ``aiClient`` (267 行末尾 ``export const aiClient = new AIClient()``) 在 Python
端不复用 — 每次请求 resolve 凭据后构造新 ``AIClient`` 实例。这是必须的, 因为 BYOK 下每个 org
凭据可能不同, 单例会污染。

超时:
  - Node: 9 分钟 (FETCH_TIMEOUT_MS = 540_000) — 思考模型 (qwen3.5-plus 等) 生成大 JSON 经常 3-6 分钟
  - Python: 与 Node 等同 540 秒

JSON 修复 (``try_repair_json``):
  - 大模型超 token 限制截断时, JSON 尾部缺 "}" / "]" — 我们扫栈尝试补全
  - generateJSON 第一次失败时自动重试 (token 翻倍)
"""

from __future__ import annotations

import contextlib
import json
import time
from dataclasses import dataclass, field
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.usage_tracker import AiCallContext, log_ai_usage

# 超时 (秒) — 与 Node 端 9 min 一致
FETCH_TIMEOUT_S = 540.0


# ── 数据结构 ─────────────────────────────────────────────────────


@dataclass
class ChatMessage:
    """OpenAI chat message — role + content。"""

    role: str  # 'system' | 'user' | 'assistant'
    content: str


@dataclass
class AIClientCallOptions:
    """单次调用参数 — temperature / max_tokens / model 覆盖 + 用量追踪上下文。

    `track` 是 fire-and-forget 用量追踪上下文; 路由层注入 (org_id / user_id /
    pipeline 名) 后, 成功响应时自动调 ``log_ai_usage`` 写 ``ai_call_logs``。
    """

    temperature: float | None = None
    max_tokens: int | None = None
    model: str | None = None  # 覆盖 client.default_model
    track: AiCallContext | None = None
    # 用量追踪需要 db (异步 INSERT)
    db: AsyncSession | None = field(default=None, repr=False)


# ── AIClient ────────────────────────────────────────────────────


class AIClient:
    """OpenAI-compatible chat completions 客户端。

    BYOK 风格: 通过 constructor 显式注入 ``api_key`` / ``base_url`` / ``model``,
    不读 env (Node 端单例风格不再适用)。

    用法 (route handler)::

        cred = await resolve_ai_credential(db, org_id=org.org_id)
        client = AIClient(api_key=cred.api_key, base_url=cred.base_url, model=cred.model)
        result = await client.chat([
            ChatMessage(role="system", content=sys_prompt),
            ChatMessage(role="user", content=user_prompt),
        ], options=AIClientCallOptions(
            track=AiCallContext(org_id=org.org_id, user_id=user.id, pipeline="risk-detection"),
            db=db,
        ))
    """

    def __init__(self, *, api_key: str, base_url: str, model: str) -> None:
        self.api_key = api_key
        # 去尾斜杠 — Node 端 ``baseUrl.replace(/\/+$/, '')`` 等价
        self.base_url = base_url.rstrip("/")
        self.default_model = model

    @property
    def is_configured(self) -> bool:
        """是否配齐 api_key (BYOK 下永远 True, Node 单例兼容用)。"""
        return bool(self.api_key)

    # ── chat ────────────────────────────────────────────────────

    async def chat(
        self,
        messages: list[ChatMessage],
        options: AIClientCallOptions | None = None,
    ) -> str:
        """调用 chat completions, 返回 assistant message content。

        Raises:
            RuntimeError: api_key 未配 (路由层应已早判)
            httpx.HTTPError / TimeoutError: 网络层错
        """
        if not self.is_configured:
            raise RuntimeError("AI provider is not configured (api_key missing)")

        opts = options or AIClientCallOptions()
        model = opts.model or self.default_model
        temperature = opts.temperature if opts.temperature is not None else 0.7
        max_tokens = opts.max_tokens if opts.max_tokens is not None else 2048

        url = f"{self.base_url}/v1/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        payload = {
            "model": model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": temperature,
            "max_tokens": max_tokens,
            # 镜像 Node 端: 关闭思考模型的 thinking 输出 (省 token + 时间)
            "enable_thinking": False,
        }

        t0 = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=FETCH_TIMEOUT_S) as http:
                response = await http.post(url, headers=headers, json=payload)
        except (TimeoutError, httpx.TimeoutException) as exc:
            elapsed = time.monotonic() - t0
            raise RuntimeError(
                f"AI 调用超时 ({elapsed:.0f}s, 上限 {FETCH_TIMEOUT_S:.0f}s) — 请简化需求或重试"
            ) from exc
        except httpx.HTTPError as exc:
            raise RuntimeError(f"AI HTTP error: {exc}") from exc

        if response.status_code >= 400:
            try:
                err_body = response.text
            except Exception:
                err_body = "Unknown error"
            raise RuntimeError(f"AI API error ({response.status_code}): {err_body}")

        try:
            data = response.json()
        except (json.JSONDecodeError, ValueError) as exc:
            raise RuntimeError(f"AI provider returned non-JSON body: {exc}") from exc

        # fire-and-forget usage logging — log 不能 break caller, suppress any exception
        usage = data.get("usage")
        if opts.track and usage and opts.db is not None:
            with contextlib.suppress(Exception):
                await log_ai_usage(
                    opts.db,
                    opts.track,
                    prompt_tokens=int(usage.get("prompt_tokens", 0)),
                    completion_tokens=int(usage.get("completion_tokens", 0)),
                    total_tokens=int(usage.get("total_tokens", 0)),
                    model=model,
                )

        # extract content
        choices = data.get("choices") or []
        if not choices:
            return ""
        msg = choices[0].get("message") or {}
        return str(msg.get("content") or "")

    # ── generate (system + user shorthand) ───────────────────────

    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        options: AIClientCallOptions | None = None,
    ) -> str:
        """单 system + 单 user prompt → assistant content。"""
        return await self.chat(
            [
                ChatMessage(role="system", content=system_prompt),
                ChatMessage(role="user", content=user_prompt),
            ],
            options=options,
        )

    # ── generateJSON ─────────────────────────────────────────────

    async def generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        options: AIClientCallOptions | None = None,
    ) -> Any:
        """生成结构化 JSON, 自动重试 + 修复截断 JSON。

        与 Node 端 ``generateJSON`` 一致语义:
          - 第一次失败 (json.JSONDecodeError) 尝试 ``try_repair_json``
          - 仍失败则 max_tokens 翻倍重试 1 次
          - 最终失败 raise RuntimeError
        """
        opts = options or AIClientCallOptions()
        # 强制把 temperature 拉到 0.3 (JSON 输出更稳定)
        temp = opts.temperature if opts.temperature is not None else 0.3

        sys_msg = (
            f"{system_prompt}\n\n你必须以纯JSON格式返回结果，不要包含markdown代码块或任何其他文本。"
        )
        messages = [
            ChatMessage(role="system", content=sys_msg),
            ChatMessage(role="user", content=user_prompt),
        ]

        base_max = opts.max_tokens if opts.max_tokens is not None else 2048

        for attempt in range(2):
            this_max = base_max if attempt == 0 else base_max * 2
            this_opts = AIClientCallOptions(
                temperature=temp,
                max_tokens=this_max,
                model=opts.model,
                track=opts.track,
                db=opts.db,
            )
            raw = await self.chat(messages, this_opts)
            json_str = raw.strip()
            # 剥掉 markdown 代码块包裹
            if json_str.startswith("```"):
                # 去开头 ``` (含可选 json) 和结尾 ```
                # e.g. "```json\n{...}\n```"
                first_newline = json_str.find("\n")
                if first_newline > 0:
                    json_str = json_str[first_newline + 1 :]
                if json_str.endswith("```"):
                    json_str = json_str[:-3]
                json_str = json_str.strip()

            try:
                return json.loads(json_str)
            except json.JSONDecodeError as exc:
                repaired = self.try_repair_json(json_str)
                if repaired is not None:
                    return repaired
                if attempt == 0:
                    continue
                raise RuntimeError(
                    f"AI returned invalid JSON after retry: {json_str[:200]}..."
                ) from exc

        raise RuntimeError("generate_json exhausted retries")

    @staticmethod
    def try_repair_json(s: str) -> Any | None:
        """补全被截断的 JSON (扫栈匹配)。

        典型场景: 模型 max_tokens 限制下生成到一半就截断, 缺尾部 ``}`` / ``]``。
        我们维护 ``{`` ``[`` 栈, 末尾按反序补全。

        Returns:
            修复后能 parse 的 Python 对象, 修不了返 None。
        """
        try:
            return json.loads(s)
        except json.JSONDecodeError:
            pass

        stack: list[str] = []
        in_string = False
        escape = False

        for ch in s:
            if escape:
                escape = False
                continue
            if ch == "\\" and in_string:
                escape = True
                continue
            if ch == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch in ("{", "["):
                stack.append(ch)
            elif ch in ("}", "]") and stack:
                stack.pop()

        repaired = s
        if in_string:
            repaired += '"'

        while stack:
            opener = stack.pop()
            repaired += "}" if opener == "{" else "]"

        try:
            return json.loads(repaired)
        except json.JSONDecodeError:
            return None


__all__ = [
    "FETCH_TIMEOUT_S",
    "AIClient",
    "AIClientCallOptions",
    "ChatMessage",
]
