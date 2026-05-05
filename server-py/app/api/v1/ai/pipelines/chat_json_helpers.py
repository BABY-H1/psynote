"""
Chat JSON helpers — 镜像 ``server/src/modules/ai/pipelines/chat-json-helpers.ts``.

工具函数:
  - ``strip_markdown_fence``: 去掉 LLM 输出的 ```json ... ``` 代码块包装
  - ``safe_parse_json``: try/except json.loads + 报告原始内容前 200 字符
"""

from __future__ import annotations

import json
from typing import Any


def strip_markdown_fence(s: str) -> str:
    """剥掉 markdown 代码块包裹 (\\`\\`\\`json ... \\`\\`\\`)。"""
    out = s.strip()
    if out.startswith("```"):
        first_nl = out.find("\n")
        if first_nl > 0:
            out = out[first_nl + 1 :]
        if out.endswith("```"):
            out = out[:-3]
        out = out.strip()
    return out


def safe_parse_json(raw: str) -> Any:
    """安全 parse JSON, 失败抛 RuntimeError 含截断的原文。"""
    try:
        return json.loads(strip_markdown_fence(raw))
    except json.JSONDecodeError as exc:
        snippet = raw[:200] + ("..." if len(raw) > 200 else "")
        raise RuntimeError(f"Invalid JSON from LLM: {snippet}") from exc


__all__ = ["safe_parse_json", "strip_markdown_fence"]
