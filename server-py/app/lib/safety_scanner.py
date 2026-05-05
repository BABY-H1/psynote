"""
Phase 9α — Keyword-based safety scanner for learner-submitted text。

镜像 ``server/src/modules/safety/keyword-scanner.ts`` (141 行)。

业务用途:
  学员提交 ``reflection`` / ``worksheet`` / ``check_in(text)`` / 评估表单等
  自由文本时, 扫毒中文危机关键词 (自杀 / 自残 / 想死 / ...). 命中则:

    1. ``safety_flags`` 标记响应行, 咨询师 pending-safety 列表能看到
    2. 学员 portal 触发 ``crisis`` payload (危机热线 + 干预资源)

Phase 9α MVP 实装是静态关键词列表 + severity tag, 后续 Phase 9ε 改成 ML
分类器时调用方不必变 (函数签名稳定)。

公开 API (与 Node 同名 wraps):
  - ``scan_text(text)            -> list[SafetyFlag]``      单段扫毒
  - ``scan_response(payload)     -> list[SafetyFlag]``      递归扫整个 JSON 对象
  - ``top_severity(flags)        -> SafetySeverity | None`` 取最高等级
  - ``extract_snippet(text, kw)  -> str``                   关键词周围预览片段

⚠ KEYWORDS / SEVERITY 字典与 Node ``keyword-scanner.ts:26-39`` 完全一致
(字符级别 1:1), Phase 5 安全审计会自动比对; 任何修改必须双端同步。

注: 旧代码 ``app/api/v1/enrollment_response/router.py`` 内嵌了一份完全相同的
关键词扫描实现 (Tier 2 baseline, 不动); 新代码请一律 ``from
app.lib.safety_scanner import ...``。
"""

from __future__ import annotations

from typing import Literal, TypedDict

# ─── 类型定义 (镜像 packages/shared/src/types/SafetyFlag.ts) ────


SafetySeverity = Literal["critical", "warning", "info"]
"""flag 严重度等级 — 与 Node ``KEYWORDS`` Record key 一致。"""


class SafetyFlag(TypedDict):
    """``scan_text`` / ``scan_response`` 单条 flag。

    与 Node ``SafetyFlag`` 结构对齐 (TypedDict 是 wire-stable, mypy strict OK)。
    """

    keyword: str
    severity: SafetySeverity
    snippet: str


class CrisisResource(TypedDict, total=False):
    """``DEFAULT_CRISIS_RESOURCES`` 单条危机干预资源。

    ``hours`` / ``description`` 可选 — 与 Node ``CrisisResource`` 一致。
    """

    name: str
    phone: str
    hours: str
    description: str


# ─── 关键词词典 (与 keyword-scanner.ts:26-39 完全一致, 不轻易修改) ──


KEYWORDS: dict[SafetySeverity, tuple[str, ...]] = {
    "critical": (
        "自杀",
        "自殺",
        "自残",
        "自殘",
        "自伤",
        "自傷",
        "想死",
        "不想活",
        "活不下去",
        "结束生命",
        "結束生命",
        "了结自己",
        "了結自己",
        "轻生",
        "輕生",
        "寻死",
        "尋死",
        "割腕",
        "跳楼",
        "跳樓",
        "上吊",
        "我要死了",
        "我该死",
        "我該死",
    ),
    "warning": (
        "绝望",
        "絕望",
        "毫无希望",
        "毫無希望",
        "没意思",
        "沒意思",
        "活着没意义",
        "活著沒意義",
        "没人在乎",
        "沒人在乎",
        "撑不住了",
        "撐不住了",
        "崩溃",
        "崩潰",
    ),
    # 'info' 级别留空 (Node 同样未配); Phase 9ε 业务侧再扩
    "info": (),
}
"""中文危机词分级 — Phase 5 审计会比对 Node 端关键词集。"""


SEVERITY_MAP: dict[str, SafetySeverity] = {kw: sev for sev, kws in KEYWORDS.items() for kw in kws}
"""``keyword -> severity`` 反向映射 — 调试 / Phase 5 审计 diff 用。"""


# 默认危机干预资源 (镜像 keyword-scanner.ts:123-141, 后续 Phase 9ε 改成 org-level 配置)
DEFAULT_CRISIS_RESOURCES: tuple[CrisisResource, ...] = (
    {
        "name": "北京心理危机研究与干预中心",
        "phone": "010-82951332",
        "hours": "24 小时",
        "description": "全国范围心理援助热线",
    },
    {
        "name": "希望 24 热线",
        "phone": "400-161-9995",
        "hours": "24 小时",
        "description": "全国心理援助热线",
    },
    {
        "name": "北京心理援助热线",
        "phone": "010-82951332",
        "hours": "24 小时",
    },
)


# ─── 公开函数 ──────────────────────────────────────────────────


def extract_snippet(text: str, keyword: str, window: int = 20) -> str:
    """关键词周围 ±window 字符的预览片段 (镜像 keyword-scanner.ts:45-53)。

    业务用途: pending-safety 列表给咨询师 1 行 preview, 不必点开看全文就能
    决定是否优先处理。

    Args:
        text:    被扫源文本; 找不到 ``keyword`` 时返 ``""``。
        keyword: 关键词字面量 (KEYWORDS 中之一)。
        window:  关键词前后各取多少字符。默认 20 (经验值 — 中文短句 + 标点恰好)。

    Returns:
        前后加 ``…`` 表示截断的字符串 (e.g. ``"…我真的不想活下去了…"``)。
    """
    idx = text.find(keyword)
    if idx < 0:
        return ""
    start = max(0, idx - window)
    end = min(len(text), idx + len(keyword) + window)
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(text) else ""
    return prefix + text[start:end] + suffix


def scan_text(text: str) -> list[SafetyFlag]:
    """扫一段文字, 命中所有 critical / warning 关键词 (镜像 keyword-scanner.ts:59-85)。

    短路规则:
      - ``text`` 是 falsy 或非 str → 返空 list (防 None / int / 空字符串误调)
      - 同关键词若已在 critical 命中, 不再 warning 阶段重复加入

    Returns:
        SafetyFlag 列表 — 严重度顺序 (critical 在前, warning 在后), 同 severity
        内按 KEYWORDS 字典原始顺序。
    """
    if not text or not isinstance(text, str):
        return []
    flags: list[SafetyFlag] = []
    for kw in KEYWORDS["critical"]:
        if kw in text:
            flags.append(
                {"keyword": kw, "severity": "critical", "snippet": extract_snippet(text, kw)}
            )
    for kw in KEYWORDS["warning"]:
        if kw in text:
            # Skip warnings that were already caught as critical on the same keyword
            if any(f["keyword"] == kw for f in flags):
                continue
            flags.append(
                {"keyword": kw, "severity": "warning", "snippet": extract_snippet(text, kw)}
            )
    return flags


def scan_response(response: object) -> list[SafetyFlag]:
    """递归收集 ``response`` 里所有 string value 后扫毒 (镜像 keyword-scanner.ts:91-108)。

    支持 worksheet 多字段对象 / quiz 数组 / 嵌套 dict 等结构 — 文本扫毒不漏底层字段。

    Args:
        response: 任意 JSON-like 值 (str / list / dict / None / number / bool)。
                  string 直接扫, list / dict 递归 walk; 其它类型忽略。

    Returns:
        所有命中 flag 的扁平列表 (跨子文本累加)。
    """
    texts: list[str] = []

    def _walk(value: object) -> None:
        if isinstance(value, str):
            texts.append(value)
        elif isinstance(value, list):
            for v in value:
                _walk(v)
        elif isinstance(value, dict):
            for v in value.values():
                _walk(v)

    _walk(response)
    all_flags: list[SafetyFlag] = []
    for t in texts:
        all_flags.extend(scan_text(t))
    return all_flags


def top_severity(flags: list[SafetyFlag]) -> SafetySeverity | None:
    """flag 列表中最高等级 (镜像 keyword-scanner.ts:111-116)。

    优先级: critical > warning > info > None。

    业务用途: ``submitResponse`` 端点判断是否回 ``crisis`` payload。
    """
    if any(f.get("severity") == "critical" for f in flags):
        return "critical"
    if any(f.get("severity") == "warning" for f in flags):
        return "warning"
    if any(f.get("severity") == "info" for f in flags):
        return "info"
    return None


__all__ = [
    "DEFAULT_CRISIS_RESOURCES",
    "KEYWORDS",
    "SEVERITY_MAP",
    "CrisisResource",
    "SafetyFlag",
    "SafetySeverity",
    "extract_snippet",
    "scan_response",
    "scan_text",
    "top_severity",
]
