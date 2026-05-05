"""
``app/lib/safety_scanner.py`` 单元测试 — 关键词扫描 / 严重度 / snippet 提取。

镜像 Node 端 ``server/src/modules/safety/keyword-scanner.ts`` 的语义校验:
  - critical 命中 (覆盖 KEYWORDS["critical"] 全部字面量样例)
  - warning 命中
  - 同 keyword 不在 critical 后再 warning 重复加 (Node 行为, Phase 5 审计)
  - 非 str / falsy → 空 list
  - scan_response 递归 dict / list / 嵌套
  - top_severity critical > warning > info > None 优先级
  - extract_snippet 边界 (开头 / 结尾 / 中间, 截断 ellipsis)
"""

from __future__ import annotations

from app.lib.safety_scanner import (
    DEFAULT_CRISIS_RESOURCES,
    KEYWORDS,
    SEVERITY_MAP,
    extract_snippet,
    scan_response,
    scan_text,
    top_severity,
)

# ─── KEYWORDS 完整性 ──────────────────────────────────────────────


def test_keywords_critical_covers_node_set() -> None:
    """与 keyword-scanner.ts:27-33 critical 词集 1:1 (Phase 5 审计严格比对)。"""
    expected = {
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
    }
    assert set(KEYWORDS["critical"]) == expected


def test_keywords_warning_covers_node_set() -> None:
    """与 keyword-scanner.ts:34-37 warning 词集 1:1。"""
    expected = {
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
    }
    assert set(KEYWORDS["warning"]) == expected


def test_severity_map_inverse_consistent() -> None:
    """SEVERITY_MAP 是 KEYWORDS 反向映射 (调试 / 审计 diff 用)。"""
    for kw in KEYWORDS["critical"]:
        assert SEVERITY_MAP[kw] == "critical"
    for kw in KEYWORDS["warning"]:
        assert SEVERITY_MAP[kw] == "warning"


def test_default_crisis_resources_three_items() -> None:
    """与 keyword-scanner.ts:123-141 默认资源 3 条 + 各字段。"""
    assert len(DEFAULT_CRISIS_RESOURCES) == 3
    names = [r["name"] for r in DEFAULT_CRISIS_RESOURCES]
    assert "希望 24 热线" in names


# ─── scan_text ────────────────────────────────────────────────────


def test_scan_text_critical_hit() -> None:
    flags = scan_text("我有时候想死...")
    assert any(f["keyword"] == "想死" and f["severity"] == "critical" for f in flags)


def test_scan_text_warning_hit() -> None:
    flags = scan_text("我感到很绝望")
    sev = {f["severity"] for f in flags}
    assert "warning" in sev
    assert "critical" not in sev


def test_scan_text_no_hit_returns_empty() -> None:
    assert scan_text("今天天气真好") == []


def test_scan_text_falsy_returns_empty() -> None:
    """``""`` / ``None`` / 非 str 都返空 list (镜像 keyword-scanner.ts:60)。"""
    assert scan_text("") == []
    assert scan_text(None) == []  # type: ignore[arg-type]
    assert scan_text(123) == []  # type: ignore[arg-type]


def test_scan_text_critical_blocks_warning_dup() -> None:
    """同关键词 critical + warning 列表都有时, 不重复加入 (镜像 ts:73-75)。

    本身 KEYWORDS 设计已确保两边无交集 — 这条 test 仅是防 regression 编辑误把 critical
    词搬到 warning 时, 老逻辑本应去重。
    """
    text_with_keyword = "我快撑不住了"
    flags = scan_text(text_with_keyword)
    # 撑不住了 仅在 warning 集; 本测试核心: 命中后只产 1 条 (不双计)
    matches = [f for f in flags if f["keyword"] == "撑不住了"]
    assert len(matches) == 1
    assert matches[0]["severity"] == "warning"


def test_scan_text_multiple_keywords() -> None:
    """同一段命中多个关键词时, 每条 flag 都有 snippet。"""
    flags = scan_text("我想死也很绝望")
    # 想死 是 critical, 绝望 是 warning, 应都命中
    keywords = {f["keyword"] for f in flags}
    assert "想死" in keywords
    assert "绝望" in keywords


# ─── scan_response (递归) ──────────────────────────────────────


def test_scan_response_dict() -> None:
    payload = {"text": "我想死了"}
    flags = scan_response(payload)
    assert any(f["keyword"] == "想死" for f in flags)


def test_scan_response_nested_list() -> None:
    payload = [{"answer": "正常"}, {"answer": "我活不下去"}, "感觉绝望"]
    flags = scan_response(payload)
    keywords = {f["keyword"] for f in flags}
    assert "活不下去" in keywords
    assert "绝望" in keywords


def test_scan_response_non_string_ignored() -> None:
    """int / bool / None 在 walk 中应静默忽略 (镜像 ts:99-101)。"""
    payload = {"score": 5, "active": True, "note": None}
    assert scan_response(payload) == []


def test_scan_response_empty_dict() -> None:
    assert scan_response({}) == []


def test_scan_response_string_payload_directly() -> None:
    """payload 直接是 str (check_in 类型) 也能扫。"""
    flags = scan_response("我寻死的念头")
    assert any(f["keyword"] == "寻死" for f in flags)


# ─── top_severity ────────────────────────────────────────────────


def test_top_severity_critical_wins() -> None:
    flags = scan_text("我想死")
    assert top_severity(flags) == "critical"


def test_top_severity_warning_when_no_critical() -> None:
    flags = scan_text("感到崩溃")
    assert top_severity(flags) == "warning"


def test_top_severity_none_when_empty() -> None:
    assert top_severity([]) is None


def test_top_severity_critical_over_mixed() -> None:
    """混合 critical + warning 时返 critical (优先级)。"""
    flags = scan_text("我想死也很绝望")
    assert top_severity(flags) == "critical"


# ─── extract_snippet ─────────────────────────────────────────────


def test_extract_snippet_at_start() -> None:
    """关键词在文本开头时 prefix 不加 ellipsis (start <= 0)."""
    s = extract_snippet("自杀念头突然出现", "自杀", window=5)
    assert s.startswith("自杀")
    assert s.endswith("…")  # 后面有截断


def test_extract_snippet_at_end() -> None:
    """关键词在文本结尾时 suffix 不加 ellipsis (end >= len)."""
    s = extract_snippet("最近一直在想自杀", "自杀", window=5)
    assert s.endswith("自杀")
    assert s.startswith("…")


def test_extract_snippet_short_text_no_ellipsis() -> None:
    """短文本 + 大窗口时, prefix / suffix 都不加 ellipsis."""
    s = extract_snippet("自杀", "自杀", window=20)
    assert s == "自杀"


def test_extract_snippet_keyword_not_found() -> None:
    """关键词不在文本里时返空字符串 (ts:46-47)."""
    assert extract_snippet("hello world", "想死") == ""


def test_extract_snippet_ellipsis_both_sides() -> None:
    """关键词在中间时两侧都有 ellipsis."""
    text = "abcde" * 10 + "想死" + "fghij" * 10
    s = extract_snippet(text, "想死", window=5)
    assert s.startswith("…") and s.endswith("…")
    assert "想死" in s
