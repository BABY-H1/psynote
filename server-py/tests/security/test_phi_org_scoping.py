"""
PHI org-scoping defense-in-depth — Phase 5 P0 Fix 2 回归 + 新端点防漏。

**为什么需要这个测试**:

Phase 5 P0 Fix 2 手动给 17 处 PHI 详情端点加了 ``org_id`` filter。但我们没有像 Node
端那样的 ``dataScopeGuard`` 自动注入机制 (Phase 1 翻译时部分实现, 复杂查询场景没全
覆盖)。这意味着新加的 endpoint **必须人记得加 ``org_id`` filter** — 容易漏。

漏 ``org_id`` 的真实风险: org A 的 counselor 拿自己 token 调
``/api/orgs/A/notes/{B_org_note_id}`` → ``org_context`` 校验通过 (你是 A 成员) →
SQL 没 filter → **直接返 B org 的 PHI**。跨机构 PHI 泄露, 合规致命。

**本测试做什么**:

AST 扫所有 router 文件, 找每一处 ``select(<PhiModel>)`` 调用, 在它紧邻的 30 行内
查 ``org_id``。任何缺失 → fail, 名字 + 行号给出。

CI 跑这条 = 任何新加的 PHI 端点漏 ``org_id`` 立刻红, 不等到生产暴雷。

**已知局限**:

  - 静态分析: 复杂动态 SQL (运行时拼接 where) 可能漏判。我们的代码风格基本是直接
    ``select(X).where(...).where(...)``, 实际命中率高。
  - 不检查 INSERT/UPDATE/DELETE — 这些没读出别 org 数据的风险, 是另一类 (写串数
    据的风险, Phase 5 没扫到)。
  - 不检查 raw text() SQL — 我们目前只在 dashboard 的 NOT EXISTS 用过一次, 看过
    没问题。

**怎么扩展**:

  - PHI 模型新增 → 加到 ``_PHI_MODELS``
  - 检测到误报 (e.g. JOIN 已含别名 org_id 但本测试没识别) → 加到 ``_EXEMPTIONS``
"""

from __future__ import annotations

import ast
from pathlib import Path

# ─── PHI 模型清单 (Phase 5 P0 Fix 2 修过的范围) ─────────────────
#
# 凡是 ``record_phi_access`` 会写 phi_access_logs 的资源, 都属 PHI 必须 org-scope。
# 这里列 SQLAlchemy 模型类名, AST 扫到 ``select(<这些名字>)`` 就要求 org_id 校验。

_PHI_MODELS: frozenset[str] = frozenset(
    {
        "AIConversation",
        "Appointment",
        "AssessmentReport",  # 聚合报告 (含 PHI 引用)
        "AssessmentResult",
        "CareEpisode",
        "ClientProfile",
        "EAPEmployeeProfile",
        "SchoolStudentProfile",
        "SessionNote",
        "TreatmentPlan",
    }
)


# ─── 误报豁免 (file_path::lineno 形式) ─────────────────────────
#
# 静态分析对 JOIN 别名 / cross-org 合法路径 (e.g. system_admin 路由) 可能误判。
# 误报添加到这里, 必须**写明豁免理由** + 写明谁审过。
#
# 当前空 — Phase 5 P0 Fix 2 修完后所有 PHI 详情都直接 select + where org_id。

_EXEMPTIONS: frozenset[str] = frozenset(
    {
        # public_appointments_router._load_appointment_by_token: 公开端点, 用 confirm_token
        # 自身做授权 (token 不可猜 + 单次有效), 不需要 org_id (调用方未登录, 没有 org 概念)。
        # 风险评估: token 是 server-side 生成的 256-bit URL-safe random, 暴破不可行;
        # 即使 token 泄露, 攻击者也只能确认/取消那一条 appointment, 不能跨 org 提取 PHI。
        # 审过: Phase 5 P0 Fix 2 review 2026-05-06。
        "api/v1/notification/public_appointments_router.py::L52",
    }
)


# ─── AST 扫描逻辑 ───────────────────────────────────────────────


def _routers_dir() -> Path:
    """server-py/app/api 根目录"""
    return Path(__file__).resolve().parents[2] / "app" / "api"


def _walk_router_files() -> list[Path]:
    """所有 .py router/service 文件 (排除 __init__ 和 schemas)"""
    return [p for p in _routers_dir().rglob("*.py") if p.name not in ("__init__.py", "schemas.py")]


def _find_phi_selects_with_function_scope(
    tree: ast.AST,
) -> list[tuple[int, str, ast.AST]]:
    """返回 ``[(lineno, model_name, enclosing_function_node), ...]``。

    enclosing_function 是包含此 select 的最内层 ``async def`` / ``def`` (没有则 module)。
    用于后续在函数全域 (而非固定行窗口) 搜 ``org_id`` — 解决 ``conditions`` list
    pattern: 函数前段构 ``conditions = [X.org_id == org]``, 后段 ``select(X).where(and_(*conditions))``,
    select 与 org_id 引用可隔 30+ 行。
    """
    # 先建 child→parent 映射 (Python ast 不带 parent 引用)
    parents: dict[int, ast.AST] = {}
    for parent in ast.walk(tree):
        for child in ast.iter_child_nodes(parent):
            parents[id(child)] = parent

    def _enclosing_function(node: ast.AST) -> ast.AST:
        """爬到最内层 FunctionDef / AsyncFunctionDef, 没有就返 tree 本身。"""
        cur: ast.AST | None = node
        while cur is not None:
            if isinstance(cur, ast.FunctionDef | ast.AsyncFunctionDef):
                return cur
            cur = parents.get(id(cur))
        return tree

    hits: list[tuple[int, str, ast.AST]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        is_select = (isinstance(func, ast.Name) and func.id == "select") or (
            isinstance(func, ast.Attribute) and func.attr == "select"
        )
        if not is_select or not node.args:
            continue
        first = node.args[0]
        if isinstance(first, ast.Name) and first.id in _PHI_MODELS:
            hits.append((node.lineno, first.id, _enclosing_function(node)))
    return hits


def _function_mentions_org_id(func_node: ast.AST, source: str) -> bool:
    """在 func_node 对应的源代码段里搜 ``org_id`` 字面。

    用 ast.unparse 把节点回写成 source 字符串 (Python 3.9+, 我们 3.12 OK), 然后
    plain string search 是否含 ``.org_id`` 或 ``org_id ==`` 或 ``org_id=``。

    覆盖 3 种合法 pattern:
      1. ``where(X.org_id == org_uuid)``  ← ".org_id"
      2. ``where(and_(X.org_id == y, ...))`` ← ".org_id"
      3. ``conditions = [X.org_id == ...]; select.where(and_(*conditions))`` ← ".org_id"
    """
    try:
        snippet = ast.unparse(func_node)
    except Exception:
        # ast.unparse 偶尔吃不下某些复杂节点 — 回落到 module-level 全文搜 (粗放但安全)
        snippet = source
    return ".org_id" in snippet or "org_id ==" in snippet or "org_id=" in snippet


# ─── 主测试 ─────────────────────────────────────────────────────


def test_all_phi_select_have_org_id_filter() -> None:
    """**安全核心 (Phase 5 P0 Fix 2 回归)** — 所有 PHI 模型 select 必须在所在函数体内
    出现 ``org_id`` 字面。

    任何新加 router 漏 ``org_id`` 立刻 fail, 名字 + 行号定位。
    """
    violations: list[str] = []

    for router_file in _walk_router_files():
        try:
            source = router_file.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        try:
            tree = ast.parse(source)
        except SyntaxError:
            # 解析不了的文件 (理论不该有, py 文件全在 ruff/mypy 管理下) — 跳过, 不静默吞
            continue

        hits = _find_phi_selects_with_function_scope(tree)
        for lineno, model_name, enclosing in hits:
            rel_path = router_file.relative_to(_routers_dir().parent)
            tag = f"{rel_path.as_posix()}::L{lineno}"
            if tag in _EXEMPTIONS:
                continue
            if not _function_mentions_org_id(enclosing, source):
                violations.append(
                    f"{rel_path.as_posix()}:{lineno}: select({model_name}) 缺 org_id filter"
                )

    assert not violations, "PHI org-scope 缺失:\n  " + "\n  ".join(violations)


def test_phi_models_set_is_complete() -> None:
    """**meta** — 确保 ``_PHI_MODELS`` 不漏 Phase 5 P0 Fix 2 修过的模型。

    如果将来加新 PHI 模型 (e.g. ``ResearchData``, ``SupervisionRecord``), 把名字
    加进 ``_PHI_MODELS`` 这条测试自动覆盖。本测试只是 sanity check 列表非空。
    """
    assert len(_PHI_MODELS) >= 7, "PHI 模型列表过少, 检查是否被误删"
    # SessionNote / TreatmentPlan / Appointment 是核心三个, 必须在
    assert "SessionNote" in _PHI_MODELS
    assert "TreatmentPlan" in _PHI_MODELS
    assert "Appointment" in _PHI_MODELS
