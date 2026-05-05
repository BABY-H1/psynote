"""
Crisis dashboard 聚合 — 镜像 ``server/src/modules/crisis/crisis-dashboard.service.ts`` (231 行).

返回:
  - cards: 总数 / 处置中 / 待督导审核 / 本月结案 / 重新打开 / 待处置 candidate
  - byCounselor: 每位咨询师的开案/待审/已结案数 (谁负担最重)
  - bySource: candidate_pool 触发 vs 手工
  - monthlyTrend: 最近 6 个月的 opened/closed 计数
  - recentActivity: 跨全机构最新 10 条 crisis_* timeline 事件
  - pendingSignOffList: 待审核案件简表

所有聚合在 SQL 端做 (不走 ORM 行 fetch + Python 端 reduce), 性能随案件量 flat。
6 query 并发执行 (asyncio.gather) — 与 Node Promise.all 等价。
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.crisis.schemas import (
    DashboardActivityItem,
    DashboardByCounselor,
    DashboardCards,
    DashboardMonthlyTrendItem,
    DashboardOutput,
    DashboardPendingItem,
)


def _to_iso(value: Any) -> str | None:
    """兼容 row 字段可能是 str / datetime / None."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


async def get_dashboard_stats(db: AsyncSession, org_id: uuid.UUID) -> DashboardOutput:
    """返回完整 dashboard payload (镜像 dashboard.service.ts:18-231).

    6 个 SQL 并发跑, 失败任一会冒到 caller (与 Node Promise.all 一致)。
    """
    six_months_ago = datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    # back 5 months (current + 5 prior = 6)
    month = six_months_ago.month - 5
    year = six_months_ago.year
    while month <= 0:
        month += 12
        year -= 1
    six_months_ago = six_months_ago.replace(year=year, month=month)
    six_iso = six_months_ago.isoformat()

    # ── 1. cards ──
    card_sql = text(
        """
        SELECT
            count(*)::int AS total,
            count(*) FILTER (WHERE stage = 'open')::int AS open_count,
            count(*) FILTER (WHERE stage = 'pending_sign_off')::int AS pending_count,
            count(*) FILTER (WHERE stage = 'closed' AND signed_off_at >= date_trunc('month', CURRENT_DATE))::int AS closed_this_month,
            count(*) FILTER (WHERE stage = 'reopened')::int AS reopened_count,
            (SELECT count(*)::int FROM candidate_pool
              WHERE org_id = :org_id
                AND kind = 'crisis_candidate'
                AND status = 'pending') AS pending_candidate_count
        FROM crisis_cases
        WHERE org_id = :org_id
        """
    )

    # ── 2. byCounselor ──
    by_counselor_sql = text(
        """
        SELECT
            cc.created_by AS counselor_id,
            u.name AS counselor_name,
            count(*) FILTER (WHERE cc.stage = 'open')::int AS open_count,
            count(*) FILTER (WHERE cc.stage = 'pending_sign_off')::int AS pending_count,
            count(*) FILTER (WHERE cc.stage = 'closed')::int AS closed_count,
            count(*)::int AS total
        FROM crisis_cases cc
        LEFT JOIN users u ON u.id = cc.created_by
        WHERE cc.org_id = :org_id AND cc.created_by IS NOT NULL
        GROUP BY cc.created_by, u.name
        ORDER BY open_count DESC, pending_count DESC, total DESC
        LIMIT 20
        """
    )

    # ── 3. bySource ──
    by_source_sql = text(
        """
        SELECT
            CASE WHEN candidate_id IS NULL THEN 'manual' ELSE 'auto_candidate' END AS source,
            count(*)::int AS cnt
        FROM crisis_cases
        WHERE org_id = :org_id
        GROUP BY source
        """
    )

    # ── 4. monthlyTrend ──
    monthly_sql = text(
        """
        WITH months AS (
            SELECT generate_series(
                date_trunc('month', CAST(:six_months_ago AS timestamptz)),
                date_trunc('month', CURRENT_DATE),
                interval '1 month'
            ) AS month_start
        )
        SELECT
            to_char(m.month_start, 'YYYY-MM') AS month,
            count(o.id)::int AS opened,
            count(c.id)::int AS closed
        FROM months m
        LEFT JOIN crisis_cases o
            ON o.org_id = :org_id
            AND o.created_at >= m.month_start
            AND o.created_at < m.month_start + interval '1 month'
        LEFT JOIN crisis_cases c
            ON c.org_id = :org_id
            AND c.signed_off_at >= m.month_start
            AND c.signed_off_at < m.month_start + interval '1 month'
            AND c.stage = 'closed'
        GROUP BY m.month_start
        ORDER BY m.month_start
        """
    )

    # ── 5. recentActivity ──
    activity_sql = text(
        """
        SELECT
            ct.id, ct.event_type, ct.title, ct.summary,
            ct.care_episode_id, ct.created_at,
            u.name AS created_by_name,
            cu.name AS client_name
        FROM care_timeline ct
        INNER JOIN care_episodes ce ON ce.id = ct.care_episode_id
        LEFT JOIN users u ON u.id = ct.created_by
        LEFT JOIN users cu ON cu.id = ce.client_id
        WHERE ce.org_id = :org_id
            AND ct.event_type LIKE 'crisis_%%'
        ORDER BY ct.created_at DESC
        LIMIT 10
        """
    )

    # ── 6. pendingSignOffList ──
    pending_sql = text(
        """
        SELECT
            cc.id, cc.episode_id, cc.submitted_for_sign_off_at AS submitted_at,
            cc.closure_summary,
            u.name AS counselor_name,
            cu.name AS client_name
        FROM crisis_cases cc
        INNER JOIN care_episodes ce ON ce.id = cc.episode_id
        LEFT JOIN users u ON u.id = cc.created_by
        LEFT JOIN users cu ON cu.id = ce.client_id
        WHERE cc.org_id = :org_id AND cc.stage = 'pending_sign_off'
        ORDER BY cc.submitted_for_sign_off_at ASC
        LIMIT 20
        """
    )

    # 并发跑 6 个 query (与 Node Promise.all 等价)
    base_params = {"org_id": org_id}
    monthly_params = {**base_params, "six_months_ago": six_iso}

    results = await asyncio.gather(
        db.execute(card_sql, base_params),
        db.execute(by_counselor_sql, base_params),
        db.execute(by_source_sql, base_params),
        db.execute(monthly_sql, monthly_params),
        db.execute(activity_sql, base_params),
        db.execute(pending_sql, base_params),
    )

    card_row: dict[str, Any] = dict(results[0].mappings().first() or {})
    by_counselor_rows = list(results[1].mappings().all())
    by_source_rows = list(results[2].mappings().all())
    monthly_rows = list(results[3].mappings().all())
    activity_rows = list(results[4].mappings().all())
    pending_rows = list(results[5].mappings().all())

    cards = DashboardCards(
        total=int(card_row.get("total") or 0),
        open_count=int(card_row.get("open_count") or 0),
        pending_candidate_count=int(card_row.get("pending_candidate_count") or 0),
        pending_sign_off_count=int(card_row.get("pending_count") or 0),
        closed_this_month=int(card_row.get("closed_this_month") or 0),
        reopened_count=int(card_row.get("reopened_count") or 0),
    )

    by_counselor = [
        DashboardByCounselor(
            counselor_id=str(r["counselor_id"]) if r.get("counselor_id") else None,
            counselor_name=r.get("counselor_name") or "(未命名)",
            open_count=int(r.get("open_count") or 0),
            pending_count=int(r.get("pending_count") or 0),
            closed_count=int(r.get("closed_count") or 0),
            total=int(r.get("total") or 0),
        )
        for r in by_counselor_rows
    ]

    by_source: dict[str, int] = {"auto_candidate": 0, "manual": 0}
    for r in by_source_rows:
        by_source[str(r["source"])] = int(r.get("cnt") or 0)

    monthly = [
        DashboardMonthlyTrendItem(
            month=str(r["month"]),
            opened=int(r.get("opened") or 0),
            closed=int(r.get("closed") or 0),
        )
        for r in monthly_rows
    ]

    activity = [
        DashboardActivityItem(
            id=str(r["id"]),
            event_type=str(r["event_type"]),
            title=r.get("title"),
            summary=r.get("summary"),
            care_episode_id=str(r["care_episode_id"]),
            created_at=_to_iso(r.get("created_at")),
            created_by_name=r.get("created_by_name"),
            client_name=r.get("client_name"),
        )
        for r in activity_rows
    ]

    pending = [
        DashboardPendingItem(
            case_id=str(r["id"]),
            episode_id=str(r["episode_id"]),
            submitted_at=_to_iso(r.get("submitted_at")),
            counselor_name=r.get("counselor_name"),
            client_name=r.get("client_name"),
            closure_summary=r.get("closure_summary"),
        )
        for r in pending_rows
    ]

    return DashboardOutput(
        cards=cards,
        by_counselor=by_counselor,
        by_source=by_source,
        monthly_trend=monthly,
        recent_activity=activity,
        pending_sign_off_list=pending,
    )


__all__ = ["get_dashboard_stats"]
