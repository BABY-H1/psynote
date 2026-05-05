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

Phase 3 stubs note:
  Node 实装跑 ``Promise.all`` 7 路并行查 + 复杂 window 子句. Python 端 1:1 镜像
  Postgres 表达式, 单测用 mock_db 覆盖快照计数.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.org.schemas import DashboardKpiDelta, DashboardStats, KpiDelta
from app.core.database import get_db
from app.db.models.assessment_results import AssessmentResult
from app.db.models.client_assignments import ClientAssignment
from app.db.models.course_instances import CourseInstance
from app.db.models.group_instances import GroupInstance
from app.db.models.org_members import OrgMember
from app.db.models.session_notes import SessionNote
from app.lib.errors import ForbiddenError, ValidationError
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


def _parse_uuid(value: str, field: str = "id") -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except (ValueError, TypeError) as exc:
        raise ValidationError(f"{field} 不是合法 UUID") from exc


def _require_org_admin(org: OrgContext | None) -> None:
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.role == "client":
        raise ForbiddenError("Client role not permitted on this endpoint")
    if org.role != "org_admin":
        raise ForbiddenError("insufficient_role")


# ─── /stats ──────────────────────────────────────────────────────


@router.get("/stats", response_model=DashboardStats)
async def get_stats(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DashboardStats:
    """7 个 KPI 快照 (org_admin only). 镜像 dashboard.routes.ts:29-118."""
    _require_org_admin(org)

    org_uuid = _parse_uuid(org_id, "orgId")

    # 7 路并行 in Node, Python 这里串行 (单测 mock 简单 — 也 ok)
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

    counselor_count = (await db.execute(counselor_q)).scalar() or 0
    client_count = (await db.execute(client_q)).scalar() or 0
    session_count = (await db.execute(session_q)).scalar() or 0
    unassigned_count = (await db.execute(unassigned_q)).scalar() or 0
    group_count = (await db.execute(group_q)).scalar() or 0
    course_count = (await db.execute(course_q)).scalar() or 0
    assessment_count = (await db.execute(assessment_q)).scalar() or 0

    return DashboardStats(
        counselor_count=int(counselor_count),
        client_count=int(client_count),
        monthly_session_count=int(session_count),
        unassigned_count=int(unassigned_count),
        active_group_count=int(group_count),
        active_course_count=int(course_count),
        monthly_assessment_count=int(assessment_count),
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


async def _count_in_window(
    db: AsyncSession,
    *,
    kind: str,
    org_uuid: uuid.UUID,
    start_sql: str,
    end_sql: str,
) -> int:
    """统计某 kind 在 [start, end) 区间内行数 (与 Node ``select`` 函数等价)."""
    if kind == "session":
        q = select(func.count()).where(
            and_(
                SessionNote.org_id == org_uuid,
                SessionNote.created_at >= text(start_sql),
                SessionNote.created_at < text(end_sql),
            )
        )
    elif kind == "assessment":
        q = select(func.count()).where(
            and_(
                AssessmentResult.org_id == org_uuid,
                AssessmentResult.created_at >= text(start_sql),
                AssessmentResult.created_at < text(end_sql),
            )
        )
    elif kind == "newClient":
        q = select(func.count()).where(
            and_(
                OrgMember.org_id == org_uuid,
                OrgMember.role == "client",
                OrgMember.created_at >= text(start_sql),
                OrgMember.created_at < text(end_sql),
            )
        )
    elif kind == "groupActive":
        # 与 Node 一致: 含 ended (前一窗口里也算)
        q = select(func.count()).where(
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
    elif kind == "courseActive":
        q = select(func.count()).where(
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
    else:
        raise ValueError(f"unknown KPI kind: {kind}")

    val = (await db.execute(q)).scalar()
    return int(val or 0)


async def _kpi_pair(
    db: AsyncSession,
    *,
    kind: str,
    org_uuid: uuid.UUID,
    win: dict[str, str],
) -> KpiDelta:
    cur = await _count_in_window(
        db,
        kind=kind,
        org_uuid=org_uuid,
        start_sql=win["current_start"],
        end_sql=win["current_end"],
    )
    prev = await _count_in_window(
        db,
        kind=kind,
        org_uuid=org_uuid,
        start_sql=win["previous_start"],
        end_sql=win["previous_end"],
    )
    return KpiDelta(current=cur, previous=prev)


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
    """
    _require_org_admin(org)

    win_key = "week" if window == "week" else "month"
    win = _WINDOW_SQL[win_key]

    org_uuid = _parse_uuid(org_id, "orgId")

    new_client = await _kpi_pair(db, kind="newClient", org_uuid=org_uuid, win=win)
    session = await _kpi_pair(db, kind="session", org_uuid=org_uuid, win=win)
    group_active = await _kpi_pair(db, kind="groupActive", org_uuid=org_uuid, win=win)
    course_active = await _kpi_pair(db, kind="courseActive", org_uuid=org_uuid, win=win)
    assessment = await _kpi_pair(db, kind="assessment", org_uuid=org_uuid, win=win)

    return DashboardKpiDelta(
        new_client=new_client,
        session=session,
        group_active=group_active,
        course_active=course_active,
        assessment=assessment,
    )


__all__ = ["router"]
