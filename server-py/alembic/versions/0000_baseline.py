"""Phase 2 baseline — Drizzle 26 migrations 跑完后的 schema 状态。

Revision ID: 0000_baseline
Revises:
Create Date: 2026-05-04

部署流程:
  - 切流时 (从 Node 切 Python), 一次性跑::

        cd server-py && alembic stamp 0000_baseline

    这告诉 dev DB: 当前 schema 已经等于"Drizzle 跑完 005~030 共 26 个 migration"
    的状态, 不重做。

  - 之后任何 schema 变更走 Alembic::

        alembic revision --autogenerate -m "..."
        alembic upgrade head

设计原因:
  - 不重做 Drizzle 26 个 migration 的 SQL — 那是 Node 端 5+ 月的工作量, 重写
    SQLAlchemy 版本风险高, 无价值
  - alembic 把这条 revision 当起点, 从这里往后 (0001+) 累加新 migration
"""

from __future__ import annotations

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "0000_baseline"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """No-op — 这一步代表 Drizzle 26 migrations 已应用后的状态。

    部署时用 ``alembic stamp 0000_baseline`` 标记 dev DB 已到达此状态,
    不会跑此 upgrade 函数。
    """
    pass


def downgrade() -> None:
    """No-op — 不能从 baseline 回退 (回退就是回到 Drizzle migrations 之前的空 DB)。"""
    pass
