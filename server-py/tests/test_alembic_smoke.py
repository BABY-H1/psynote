"""
Phase 2.6 — Alembic 框架 smoke test。

验证:
  - alembic.ini 存在
  - env.py 能 import 不报错 (含 75+1 模型 import)
  - 0000_baseline + 0001_phase2_additions revision 文件 valid Python
  - revision 链顺序正确 (0001 down_revision = 0000_baseline)
"""

from __future__ import annotations

from pathlib import Path

import pytest

_SERVER_PY_ROOT = Path(__file__).resolve().parent.parent


def test_alembic_ini_exists() -> None:
    assert (_SERVER_PY_ROOT / "alembic.ini").is_file()


def test_alembic_versions_dir_exists() -> None:
    assert (_SERVER_PY_ROOT / "alembic" / "versions").is_dir()


def test_baseline_revision_imports(base_env: pytest.MonkeyPatch) -> None:
    """0000_baseline 是 valid Python module"""
    import importlib.util

    path = _SERVER_PY_ROOT / "alembic" / "versions" / "0000_baseline.py"
    spec = importlib.util.spec_from_file_location("baseline", path)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)

    assert module.revision == "0000_baseline"
    assert module.down_revision is None  # baseline 是起点


def test_phase2_revision_chains_to_baseline(base_env: pytest.MonkeyPatch) -> None:
    """0001 的 down_revision 必须是 0000_baseline (链表正确)"""
    import importlib.util

    path = _SERVER_PY_ROOT / "alembic" / "versions" / "0001_phase2_additions.py"
    spec = importlib.util.spec_from_file_location("phase2", path)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)

    assert module.revision == "0001_phase2_additions"
    assert module.down_revision == "0000_baseline"


def test_alembic_env_imports_all_75_plus_models(base_env: pytest.MonkeyPatch) -> None:
    """env.py side-effect import 应让 Base.metadata 知道全部 75+1 张表"""
    import app.db.models  # noqa: F401 — trigger registration
    from app.core.database import Base

    table_names = set(Base.metadata.tables.keys())

    # Phase 2 决策新加: ai_credentials
    assert "ai_credentials" in table_names

    # 抽样 5 个核心表 (review checkpoint 3)
    for t in ("users", "organizations", "org_members", "courses", "group_enrollments"):
        assert t in table_names, f"{t} 应在 Base.metadata"

    # 总数 75 (Drizzle) + 1 (ai_credentials) = 76
    assert len(table_names) == 76, f"期望 76 张表, 实际 {len(table_names)}"
