"""
Dashboard router — 镜像 ``server/src/modules/org/dashboard.routes.ts`` (246 行).

挂在 ``/api/orgs/{org_id}/dashboard`` prefix. 2 个 endpoint:

  GET /stats        — 7 个 KPI 快照 (org_admin only)
  GET /kpi-delta    — 5 KPI current vs previous-window (org_admin only, ?window=month|week)

RBAC:
  - ``orgContextGuard`` (Python: get_org_context Dependency 自动跑)
  - ``rejectClient`` (Python: 调 _reject_client(org))
  - ``requireRole('org_admin')`` (Python: _require_org_admin)

Node 端用 drizzle ``sql.raw()`` + ``date_trunc`` 直接拼 Postgres SQL. Python 这里用
SQLAlchemy ``text()`` 等价表达, 让 dev 部署 Postgres / 测试 mock 都能走通.

Phase 3 单 SQL 优化 (review P0 fix #3):
  Node 实装跑 ``Promise.all`` 7 路并行查; 但 SQLAlchemy AsyncSession 单连接限制 —
  asyncpg 同 connection 不允许 concurrent statements, ``asyncio.gather`` 在同一 session
  上并不能真正并行. 取而代之走 Postgres ``SELECT (SELECT count(*) FROM x), ...`` 单查询
  多 scalar subquery, 1 round-trip 返回所有 KPI. 行为完全等价 (mock_db.execute 调用次数
  从 7/10 → 1, 见 dashboard tests).
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Select, and_, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.org.schemas import DashboardKpiDelta, DashboardStats, KpiDelta
from app.core.database import get_db
from app.db.models.assessment_results import AssessmentResult
from app.db.models.client_assignments import ClientAssignment
from app.db.models.course_instances import CourseInstance
from app.db.models.group_instances import GroupInstance
from app.db.models.org_members import OrgMember
from app.db.models.session_notes import SessionNote
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.role_guards import reject_client, require_admin

router = APIRouter()


def _require_org_admin(org: OrgContext | None) -> None:
    reject_client(org)
    require_admin(org)


# ─── /stats ──────────────────────────────────────────────────────


def _stats_subqueries(org_uuid: uuid.UUID) -> list[Select[tuple[int]]]:
    """构造 7 个 count subquery (顺序与 DashboardStats 字段对齐)."""
    counselor_q = select(func.count()).where(
        and_(
            OrgMember.org_id == org_uuid,
            OrgMember.role == "counselor",
            OrgMember.status == "active",
        )
    )
    client_q = select(func.count(func.distinct(ClientAssignment.client_id))).where(
        ClientAssignment.org_id == org_uuid
    )
    session_q = select(func.count()).where(
        and_(
            SessionNote.org_id == org_uuid,
            SessionNote.created_at >= text("date_trunc('month', CURRENT_DATE)"),
        )
    )
    unassigned_q = select(func.count()).where(
        and_(
            OrgMember.org_id == org_uuid,
            OrgMember.role == "client",
            OrgMember.status == "active",
            text(
                "NOT EXISTS (SELECT 1 FROM client_assignments ca "
                "WHERE ca.org_id = org_members.org_id "
                "AND ca.client_id = org_members.user_id)"
            ),
        )
    )
    group_q = select(func.count()).where(
        and_(
            GroupInstance.org_id == org_uuid,
            or_(
                GroupInstance.status == "recruiting",
                GroupInstance.status == "active",
            ),
        )
    )
    course_q = select(func.count()).where(
        and_(
            CourseInstance.org_id == org_uuid,
            or_(
                CourseInstance.status == "draft",
                CourseInstance.status == "active",
            ),
        )
    )
    assessment_q = select(func.count()).where(
        and_(
            AssessmentResult.org_id == org_uuid,
            AssessmentResult.created_at >= text("date_trunc('month', CURRENT_DATE)"),
        )
    )
    return [counselor_q, client_q, session_q, unassigned_q, group_q, course_q, assessment_q]


@router.get("/stats", response_model=DashboardStats)
async def get_stats(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DashboardStats:
    """7 个 KPI 快照 (org_admin only). 镜像 dashboard.routes.ts:29-118.

    优化: Postgres 单查询多 scalar subquery — 1 round-trip 返回 7 个 count.
    """
    _require_org_admin(org)

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")

    subqs = _stats_subqueries(org_uuid)
    labels = (
        "counselor_count",
        "client_count",
        "session_count",
        "unassigned_count",
        "group_count",
        "course_count",
        "assessment_count",
    )
    combined = select(
        *(sq.scalar_subquery().label(label) for sq, label in zip(subqs, labels, strict=True))
    )
    row = (await db.execute(combined)).first()
    counts = list(row) if row is not None else [0] * 7

    return DashboardStats(
        counselor_count=int(counts[0] or 0),
        client_count=int(counts[1] or 0),
        monthly_session_count=int(counts[2] or 0),
        unassigned_count=int(counts[3] or 0),
        active_group_count=int(counts[4] or 0),
        active_course_count=int(counts[5] or 0),
        monthly_assessment_count=int(counts[6] or 0),
    )


# ─── /kpi-delta ──────────────────────────────────────────────────


# Postgres 窗口子句 (镜像 dashboard.routes.ts:140-162)
_WINDOW_SQL: dict[str, dict[str, str]] = {
    "month": {
        "current_start": "date_trunc('month', CURRENT_DATE)",
        "current_end": "(CURRENT_DATE + INTERVAL '1 day')",
        "previous_start": "date_trunc('month', CURRENT_DATE - INTERVAL '1 month')",
        "previous_end": (
            "(date_trunc('month', CURRENT_DATE - INTERVAL '1 month') + "
            "(CURRENT_DATE - date_trunc('month', CURRENT_DATE)) + "
            "INTERVAL '1 day')"
        ),
    },
    "week": {
        "current_start": "date_trunc('week', CURRENT_DATE)",
        "current_end": "(CURRENT_DATE + INTERVAL '1 day')",
        "previous_start": "date_trunc('week', CURRENT_DATE - INTERVAL '1 week')",
        "previous_end": (
            "(date_trunc('week', CURRENT_DATE - INTERVAL '1 week') + "
            "(CURRENT_DATE - date_trunc('week', CURRENT_DATE)) + "
            "INTERVAL '1 day')"
        ),
    },
}


def _kpi_count_query(
    *,
    kind: str,
    org_uuid: uuid.UUID,
    start_sql: str,
    end_sql: str,
) -> Select[tuple[int]]:
    """统计某 kind 在 [start, end) 区间内行数 (与 Node ``select`` 函数等价).

    返回 query, 由调用方包装为 scalar_subquery 与其他 KPI 一起单 SQL 执行.
    """
    if kind == "session":
        return select(func.count()).where(
            and_(
                SessionNote.org_id == org_uuid,
                SessionNote.created_at >= text(start_sql),
                SessionNote.created_at < text(end_sql),
            )
        )
    if kind == "assessment":
        return select(func.count()).where(
            and_(
                AssessmentResult.org_id == org_uuid,
                AssessmentResult.created_at >= text(start_sql),
                AssessmentResult.created_at < text(end_sql),
            )
        )
    if kind == "newClient":
        return select(func.count()).where(
            and_(
                OrgMember.org_id == org_uuid,
                OrgMember.role == "client",
                OrgMember.created_at >= text(start_sql),
                OrgMember.created_at < text(end_sql),
            )
        )
    if kind == "groupActive":
        # 与 Node 一致: 含 ended (前一窗口里也算)
        return select(func.count()).where(
            and_(
                GroupInstance.org_id == org_uuid,
                GroupInstance.created_at < text(end_sql),
                or_(
                    GroupInstance.status == "recruiting",
                    GroupInstance.status == "active",
                    GroupInstance.status == "ended",
                ),
            )
        )
    if kind == "courseActive":
        return select(func.count()).where(
            and_(
                CourseInstance.org_id == org_uuid,
                CourseInstance.created_at < text(end_sql),
                or_(
                    CourseInstance.status == "draft",
                    CourseInstance.status == "active",
                    CourseInstance.status == "ended",
                ),
            )
        )
    raise ValueError(f"unknown KPI kind: {kind}")


# 与历史 _kpi_pair 调用顺序一致 (newClient, session, groupActive, courseActive, assessment)
# 每个 KPI 是 (current, previous) 一对, 总 10 个 count.
_KPI_KINDS: tuple[str, ...] = (
    "newClient",
    "session",
    "groupActive",
    "courseActive",
    "assessment",
)


@router.get("/kpi-delta", response_model=DashboardKpiDelta)
async def get_kpi_delta(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    window: Annotated[str, Query()] = "month",
) -> DashboardKpiDelta:
    """5 KPI current vs previous-window (org_admin only). 镜像 dashboard.routes.ts:134-245.

    window=month (default): 本月 vs 上月同期
    window=week:           本周 vs 上周同期

    优化: Postgres 单查询 10 个 scalar subquery — 1 round-trip 返回所有 (cur, prev) 对.
    """
    _require_org_admin(org)

    win_key = "week" if window == "week" else "month"
    win = _WINDOW_SQL[win_key]

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")

    # 10 个 scalar subqueries: 5 KPI × {current, previous}, 顺序与 _KPI_KINDS 严格对齐
    subqs: list[Select[tuple[int]]] = []
    labels: list[str] = []
    for kind in _KPI_KINDS:
        subqs.append(
            _kpi_count_query(
                kind=kind,
                org_uuid=org_uuid,
                start_sql=win["current_start"],
                end_sql=win["current_end"],
            )
        )
        labels.append(f"{kind}_current")
        subqs.append(
            _kpi_count_query(
                kind=kind,
                org_uuid=org_uuid,
                start_sql=win["previous_start"],
                end_sql=win["previous_end"],
            )
        )
        labels.append(f"{kind}_previous")

    combined = select(
        *(sq.scalar_subquery().label(label) for sq, label in zip(subqs, labels, strict=True))
    )
    row = (await db.execute(combined)).first()
    counts = list(row) if row is not None else [0] * 10

    def _pair(idx: int) -> KpiDelta:
        return KpiDelta(current=int(counts[idx] or 0), previous=int(counts[idx + 1] or 0))

    return DashboardKpiDelta(
        new_client=_pair(0),
        session=_pair(2),
        group_active=_pair(4),
        course_active=_pair(6),
        assessment=_pair(8),
    )


__all__ = ["router"]
