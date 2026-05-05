"""
School Analytics router — 镜像 ``server/src/modules/school/school-analytics.routes.ts`` (286 行)。

挂在 ``/api/orgs/{org_id}/school/analytics`` 前缀下。

4 个 endpoint:
  GET /overview              — header counts (本月测评 / 风险分布 / open crisis / pending sign-off)
  GET /risk-by-class         — class × risk_level 矩阵 (热图用)
  GET /high-risk-students    — top N level_3/level_4 学生 (含 has_open_crisis)
  GET /crisis-by-class       — crisis cases 按 class 聚合

⚠ 校领导 aggregate-only:
  与 EAP 不同 — 学校场景下校长本来能看到学生姓名 (Node 注释明确说明), 故无 k-anonymity.
  但**仍不返回个体测评原始数据** — 仅返回每学生**最新一次**风险等级 + 班级聚合.
  防 RBAC 上溯, 校长仍不应直读 PHI 主表 (assessment_results.value); 此处只走聚合 column.

Guard: requireOrgType('school'). RBAC: 无显式 admin-only — 学校教务都可看 dashboard.

实现注:
  Node 用 ``DISTINCT ON`` (Postgres 特定), Python 也走 raw SQL (text()) 保留语义.
  这样 SQL 行为完全一致, 不需重写为 window function.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.school.schemas import (
    AnalyticsOverviewResponse,
    CrisisByClassEntry,
    HighRiskStudentEntry,
    RiskByClassEntry,
)
from app.core.database import get_db
from app.lib.errors import ForbiddenError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()

HIGH_RISK_LEVELS = ("level_3", "level_4")


def _require_school(org: OrgContext | None) -> OrgContext:
    """``requireOrgType('school')`` 等价 — 非 school org 直接 403."""
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.org_type != "school":
        raise ForbiddenError("school analytics requires school org type")
    return org


# ─── Overview (header counts) ────────────────────────────────────


@router.get("/overview", response_model=AnalyticsOverviewResponse)
async def get_overview(
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AnalyticsOverviewResponse:
    """Header overview — 替换旧硬编码 "测评完成=0/预警关注=0".

    镜像 school-analytics.routes.ts:52-103. 风险分布走每学生最新一次 risk_level
    (DISTINCT ON), 没做过测评的学生不计入任何 level.
    """
    school = _require_school(org)
    org_uuid = parse_uuid_or_raise(school.org_id, field="orgId")

    # 1. assessments_this_month + open_crisis + pending_signoff
    overview_q = text(
        """
        SELECT
          (SELECT count(DISTINCT user_id)::int FROM assessment_results
            WHERE org_id = :org_id
              AND created_at >= date_trunc('month', CURRENT_DATE)) AS assessments_this_month,
          (SELECT count(*)::int FROM crisis_cases
            WHERE org_id = :org_id AND stage = 'open') AS open_crisis,
          (SELECT count(*)::int FROM crisis_cases
            WHERE org_id = :org_id AND stage = 'pending_sign_off') AS pending_signoff
        """
    )
    overview_row = (await db.execute(overview_q, {"org_id": org_uuid})).first()
    assessments_this_month = int(overview_row[0] if overview_row else 0)
    open_crisis = int(overview_row[1] if overview_row else 0)
    pending_signoff = int(overview_row[2] if overview_row else 0)

    # 2. 每学生最新一次 risk_level 分布 (排除无测评的学生)
    risk_q = text(
        """
        WITH latest_per_student AS (
          SELECT DISTINCT ON (ar.user_id)
            ar.user_id, ar.risk_level
          FROM assessment_results ar
          INNER JOIN school_student_profiles ss
            ON ss.user_id = ar.user_id AND ss.org_id = ar.org_id
          WHERE ar.org_id = :org_id
            AND ar.deleted_at IS NULL
            AND ar.risk_level IS NOT NULL
          ORDER BY ar.user_id, ar.created_at DESC
        )
        SELECT risk_level, count(*)::int AS cnt
        FROM latest_per_student
        GROUP BY risk_level
        """
    )
    risk_rows = (await db.execute(risk_q, {"org_id": org_uuid})).all()

    risk_dist: dict[str, int] = {"level_1": 0, "level_2": 0, "level_3": 0, "level_4": 0}
    for row in risk_rows:
        level = row[0]
        if level in risk_dist:
            risk_dist[level] = int(row[1] or 0)

    return AnalyticsOverviewResponse(
        assessments_this_month=assessments_this_month,
        risk_level_distribution=risk_dist,
        open_crisis_count=open_crisis,
        pending_sign_off_count=pending_signoff,
    )


# ─── Risk × Class Matrix ─────────────────────────────────────────


@router.get("/risk-by-class", response_model=list[RiskByClassEntry])
async def get_risk_by_class(
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[RiskByClassEntry]:
    """class × risk_level 矩阵 (热图). 镜像 school-analytics.routes.ts:111-178.

    每学生按**最新一次** risk_level 计数. 没做过测评的学生 risk_level 为 NULL,
    计入 totalStudents 但不计入 totalAssessed.

    排序: 高风险 (l3+l4) 多的在前, 同则按 grade/className.
    """
    school = _require_school(org)
    org_uuid = parse_uuid_or_raise(school.org_id, field="orgId")

    rq = text(
        """
        WITH latest_per_student AS (
          SELECT DISTINCT ON (ss.user_id)
            ss.grade, ss.class_name, ar.risk_level
          FROM school_student_profiles ss
          LEFT JOIN assessment_results ar
            ON ar.user_id = ss.user_id
            AND ar.org_id = ss.org_id
            AND ar.deleted_at IS NULL
          WHERE ss.org_id = :org_id
          ORDER BY ss.user_id, ar.created_at DESC NULLS LAST
        )
        SELECT grade, class_name, risk_level, count(*)::int AS cnt
        FROM latest_per_student
        GROUP BY grade, class_name, risk_level
        ORDER BY grade, class_name
        """
    )
    rows = (await db.execute(rq, {"org_id": org_uuid})).all()

    # pivot 到 (grade+className) → entry
    table: dict[tuple[str, str], RiskByClassEntry] = {}
    for row in rows:
        grade = row[0] or "未分配"
        cls = row[1] or "未分配"
        rl = row[2]
        cnt = int(row[3] or 0)
        key = (grade, cls)
        entry = table.get(key)
        if entry is None:
            entry = RiskByClassEntry(
                grade=grade,
                class_name=cls,
                risk_counts={"level_1": 0, "level_2": 0, "level_3": 0, "level_4": 0},
                total_assessed=0,
                total_students=0,
            )
            table[key] = entry
        entry.total_students += cnt
        if rl in entry.risk_counts:
            entry.risk_counts[rl] += cnt
            entry.total_assessed += cnt

    # 排序: 高风险数 desc, 同则 grade / className asc (与 Node 一致)
    return sorted(
        table.values(),
        key=lambda e: (
            -(e.risk_counts.get("level_3", 0) + e.risk_counts.get("level_4", 0)),
            e.grade,
            e.class_name,
        ),
    )


# ─── High-Risk Students (top N level_3/level_4) ──────────────────


@router.get("/high-risk-students", response_model=list[HighRiskStudentEntry])
async def get_high_risk_students(
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: Annotated[str | None, Query()] = None,
) -> list[HighRiskStudentEntry]:
    """top N 高风险学生 (level_3/level_4 优先, level_4 排前). 镜像 school-analytics.routes.ts:185-242.

    包含 has_open_crisis 标志 (任意未关 crisis_case 即 True).
    """
    school = _require_school(org)
    org_uuid = parse_uuid_or_raise(school.org_id, field="orgId")

    try:
        limit_n = int(limit) if limit else 20
    except (ValueError, TypeError):
        limit_n = 20

    hq = text(
        """
        WITH latest_per_student AS (
          SELECT DISTINCT ON (ar.user_id)
            ar.user_id, ar.risk_level, ar.created_at AS latest_at
          FROM assessment_results ar
          WHERE ar.org_id = :org_id
            AND ar.deleted_at IS NULL
            AND ar.risk_level IN ('level_3', 'level_4')
          ORDER BY ar.user_id, ar.created_at DESC
        )
        SELECT
          l.user_id,
          u.name,
          ss.student_id,
          ss.grade,
          ss.class_name,
          l.risk_level,
          l.latest_at,
          EXISTS (
            SELECT 1 FROM crisis_cases cc
            INNER JOIN care_episodes ce ON ce.id = cc.episode_id
            WHERE ce.client_id = l.user_id AND cc.org_id = :org_id AND cc.stage <> 'closed'
          ) AS has_open_crisis
        FROM latest_per_student l
        INNER JOIN users u ON u.id = l.user_id
        INNER JOIN school_student_profiles ss
          ON ss.user_id = l.user_id AND ss.org_id = :org_id
        ORDER BY
          CASE l.risk_level WHEN 'level_4' THEN 1 WHEN 'level_3' THEN 2 ELSE 3 END,
          l.latest_at DESC
        LIMIT :limit
        """
    )
    rows = (await db.execute(hq, {"org_id": org_uuid, "limit": limit_n})).all()

    out: list[HighRiskStudentEntry] = []
    for row in rows:
        latest_at_raw: Any = row[6]
        if latest_at_raw is None:
            latest_at_str: str | None = None
        elif isinstance(latest_at_raw, str):
            latest_at_str = latest_at_raw
        else:
            # datetime
            latest_at_str = latest_at_raw.isoformat()

        out.append(
            HighRiskStudentEntry(
                user_id=str(row[0]),
                name=row[1] or "(未命名)",
                student_id=row[2],
                grade=row[3],
                class_name=row[4],
                risk_level=row[5],
                latest_assessment_at=latest_at_str,
                has_open_crisis=bool(row[7]),
            )
        )
    return out


# ─── Crisis Cases by Class ───────────────────────────────────────


@router.get("/crisis-by-class", response_model=list[CrisisByClassEntry])
async def get_crisis_by_class(
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[CrisisByClassEntry]:
    """crisis cases 按 class 聚合, top 20 by total. 镜像 school-analytics.routes.ts:250-284."""
    school = _require_school(org)
    org_uuid = parse_uuid_or_raise(school.org_id, field="orgId")

    cq = text(
        """
        SELECT
          ss.grade, ss.class_name,
          count(*) FILTER (WHERE cc.stage = 'open')::int AS open_count,
          count(*) FILTER (WHERE cc.stage = 'pending_sign_off')::int AS pending_count,
          count(*) FILTER (WHERE cc.stage = 'closed')::int AS closed_count,
          count(*)::int AS total
        FROM crisis_cases cc
        INNER JOIN care_episodes ce ON ce.id = cc.episode_id
        INNER JOIN school_student_profiles ss
          ON ss.user_id = ce.client_id AND ss.org_id = cc.org_id
        WHERE cc.org_id = :org_id
        GROUP BY ss.grade, ss.class_name
        ORDER BY total DESC
        LIMIT 20
        """
    )
    rows = (await db.execute(cq, {"org_id": org_uuid})).all()

    return [
        CrisisByClassEntry(
            grade=row[0] or "未分配",
            class_name=row[1] or "未分配",
            open_count=int(row[2] or 0),
            pending_sign_off_count=int(row[3] or 0),
            closed_count=int(row[4] or 0),
            total=int(row[5] or 0),
        )
        for row in rows
    ]


__all__ = ["HIGH_RISK_LEVELS", "router"]
