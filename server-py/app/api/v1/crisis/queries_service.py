"""
Crisis read-only queries — 镜像 ``server/src/modules/crisis/crisis-case.queries.ts`` (52 行).

只读查询从 workflow service 拆出来, 让分析/读多写少的 caller 不需要拉整个状态机
依赖。
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.crisis.helpers import crisis_case_to_output
from app.api.v1.crisis.schemas import CrisisCaseOutput
from app.db.models.crisis_cases import CrisisCase
from app.lib.errors import NotFoundError


async def get_case_by_id(
    db: AsyncSession, org_id: uuid.UUID, case_id: uuid.UUID
) -> CrisisCaseOutput:
    """按 id + org 查单个案件 — 不存在抛 404 (镜像 queries.ts:15-22)."""
    q = (
        select(CrisisCase)
        .where(and_(CrisisCase.id == case_id, CrisisCase.org_id == org_id))
        .limit(1)
    )
    row = (await db.execute(q)).scalar_one_or_none()
    if row is None:
        raise NotFoundError("CrisisCase", str(case_id))
    return crisis_case_to_output(row)


async def get_case_by_id_row(db: AsyncSession, org_id: uuid.UUID, case_id: uuid.UUID) -> CrisisCase:
    """同 ``get_case_by_id`` 但返回 ORM 行 (workflow_service 内部 update 用)."""
    q = (
        select(CrisisCase)
        .where(and_(CrisisCase.id == case_id, CrisisCase.org_id == org_id))
        .limit(1)
    )
    row = (await db.execute(q)).scalar_one_or_none()
    if row is None:
        raise NotFoundError("CrisisCase", str(case_id))
    return row


async def get_case_by_episode(
    db: AsyncSession, org_id: uuid.UUID, episode_id: uuid.UUID
) -> CrisisCaseOutput | None:
    """按 episode 查关联案件 — 不存在返 None (镜像 queries.ts:26-35).

    ⚠ EpisodeDetail UI 主入口: 进个案详情页时第一时间问"这个 episode 是不是
    危机案件", 没有就不渲染危机模块。所以是 None 不是 404。
    """
    q = (
        select(CrisisCase)
        .where(and_(CrisisCase.episode_id == episode_id, CrisisCase.org_id == org_id))
        .limit(1)
    )
    row = (await db.execute(q)).scalar_one_or_none()
    return crisis_case_to_output(row) if row else None


async def list_cases(
    db: AsyncSession, org_id: uuid.UUID, *, stage: str | None = None
) -> list[CrisisCaseOutput]:
    """列出本机构所有案件, 可按 stage 过滤 (镜像 queries.ts:39-52).

    督导面板默认走 ``stage='pending_sign_off'`` 拿待审清单。
    """
    conds: list[Any] = [CrisisCase.org_id == org_id]
    if stage:
        conds.append(CrisisCase.stage == stage)
    q = select(CrisisCase).where(and_(*conds)).order_by(desc(CrisisCase.updated_at))
    rows = list((await db.execute(q)).scalars().all())
    return [crisis_case_to_output(r) for r in rows]


__all__ = [
    "get_case_by_episode",
    "get_case_by_id",
    "get_case_by_id_row",
    "list_cases",
]
