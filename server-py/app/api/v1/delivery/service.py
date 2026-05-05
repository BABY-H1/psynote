"""
Delivery service — 跨 4 类 service UNION ALL 聚合 (镜像
``server/src/modules/delivery/delivery.service.ts``, 318 行)。

对外只暴露一个函数: ``list_service_instances(db, org_id, query)``。

设计要点 (与 Node 一致):
  1. **单 UNION ALL 查询** — 4 个分支 (counseling/group/course/assessment) 在 PG
     端 merge + 统一 ``ORDER BY last_activity_at DESC`` + ``LIMIT/OFFSET``
     一次 round-trip 出全部行。比 fan-out 4 query + 内存 merge 高效很多。
  2. **状态映射 inline** — 每个分支 ``CASE`` 把 raw status 映射到统一的
     ``ServiceStatus`` 枚举 (与 client/src/api/service-instance-mappers.ts 同步)。
  3. **kind filter EXISTS short-circuit** — 通过 Python 端构建分支列表实现
     (Node 同款), 不查指定 kind 时整段 SELECT 跳过。
  4. **status filter on merged set** — status 过滤是映射后的 ServiceStatus, 故
     必须放外层 SELECT (CTE 之后), 不能下推到分支。
  5. **count 单独查** — 不带 LIMIT/OFFSET 的 COUNT(*) 给分页 UI 总数。

raw SQL 走 ``sqlalchemy.text`` (Node 端走 drizzle ``sql`` template), 因为各分支
不同表 + UNION 用 ORM ``select()`` 比 raw 噪音大。bind params 全走 ``:name``
+ ``params={...}`` 防注入。
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.delivery.schemas import ListServicesResponse, ServiceInstance, ServiceKindInput
from app.lib.errors import ValidationError
from app.lib.uuid_utils import parse_uuid_or_raise

# 与 Node ``ServiceKindInput`` 完全一致 (delivery.service.ts:37 + delivery.routes.ts:94)
_VALID_KINDS: frozenset[ServiceKindInput] = frozenset(
    {"counseling", "group", "course", "assessment"}
)


# ─── 4 个分支 SQL (镜像 delivery.service.ts:91-223) ────────────────


# counseling 分支 (delivery.service.ts:91-122)
_BRANCH_COUNSELING = """
    SELECT
        ce.id::text                                    AS id,
        'counseling'::text                             AS kind,
        ce.org_id::text                                AS org_id,
        COALESCE(u.name, '未知来访者')                 AS title,
        CASE ce.status
            WHEN 'active'   THEN 'ongoing'
            WHEN 'paused'   THEN 'paused'
            WHEN 'closed'   THEN 'closed'
            WHEN 'archived' THEN 'archived'
            ELSE 'draft'
        END                                            AS status,
        COALESCE(ce.counselor_id::text, '')            AS owner_id,
        1::integer                                     AS participant_count,
        NULL::timestamptz                              AS next_session_at,
        ce.updated_at                                  AS last_activity_at,
        ce.created_at                                  AS created_at,
        ce.updated_at                                  AS updated_at,
        ce.client_id::text                             AS client_id,
        u.name                                         AS client_name,
        ce.current_risk                                AS current_risk,
        NULL::text                                     AS scheme_id,
        NULL::integer                                  AS capacity,
        NULL::text                                     AS course_id,
        NULL::text                                     AS course_type,
        NULL::text                                     AS assessment_type
    FROM care_episodes ce
    LEFT JOIN users u ON u.id = ce.client_id
    WHERE ce.org_id = :org_id
"""

# group 分支 (delivery.service.ts:125-156)
_BRANCH_GROUP = """
    SELECT
        gi.id::text                                    AS id,
        'group'::text                                  AS kind,
        gi.org_id::text                                AS org_id,
        gi.title                                       AS title,
        CASE gi.status
            WHEN 'draft'      THEN 'draft'
            WHEN 'recruiting' THEN 'recruiting'
            WHEN 'ongoing'    THEN 'ongoing'
            WHEN 'full'       THEN 'ongoing'
            WHEN 'ended'      THEN 'completed'
            ELSE 'draft'
        END                                            AS status,
        COALESCE(gi.leader_id::text, gi.created_by::text, '') AS owner_id,
        0::integer                                     AS participant_count,
        NULL::timestamptz                              AS next_session_at,
        gi.updated_at                                  AS last_activity_at,
        gi.created_at                                  AS created_at,
        gi.updated_at                                  AS updated_at,
        NULL::text                                     AS client_id,
        NULL::text                                     AS client_name,
        NULL::text                                     AS current_risk,
        gi.scheme_id::text                             AS scheme_id,
        gi.capacity                                    AS capacity,
        NULL::text                                     AS course_id,
        NULL::text                                     AS course_type,
        NULL::text                                     AS assessment_type
    FROM group_instances gi
    WHERE gi.org_id = :org_id
"""

# course 分支 (delivery.service.ts:159-189)
_BRANCH_COURSE = """
    SELECT
        ci.id::text                                    AS id,
        'course'::text                                 AS kind,
        ci.org_id::text                                AS org_id,
        ci.title                                       AS title,
        CASE ci.status
            WHEN 'draft'    THEN 'draft'
            WHEN 'active'   THEN 'ongoing'
            WHEN 'closed'   THEN 'closed'
            WHEN 'archived' THEN 'archived'
            ELSE 'draft'
        END                                            AS status,
        COALESCE(ci.responsible_id::text, ci.created_by::text, '') AS owner_id,
        0::integer                                     AS participant_count,
        NULL::timestamptz                              AS next_session_at,
        ci.updated_at                                  AS last_activity_at,
        ci.created_at                                  AS created_at,
        ci.updated_at                                  AS updated_at,
        NULL::text                                     AS client_id,
        NULL::text                                     AS client_name,
        NULL::text                                     AS current_risk,
        NULL::text                                     AS scheme_id,
        ci.capacity                                    AS capacity,
        ci.course_id::text                             AS course_id,
        NULL::text                                     AS course_type,
        NULL::text                                     AS assessment_type
    FROM course_instances ci
    WHERE ci.org_id = :org_id
"""

# assessment 分支 (delivery.service.ts:192-222) — 含 deleted_at IS NULL 软删过滤
_BRANCH_ASSESSMENT = """
    SELECT
        a.id::text                                     AS id,
        'assessment'::text                             AS kind,
        a.org_id::text                                 AS org_id,
        a.title                                        AS title,
        CASE
            WHEN a.status = 'draft'    THEN 'draft'
            WHEN a.status = 'archived' THEN 'archived'
            WHEN a.is_active           THEN 'ongoing'
            ELSE 'paused'
        END                                            AS status,
        COALESCE(a.created_by::text, '')               AS owner_id,
        0::integer                                     AS participant_count,
        NULL::timestamptz                              AS next_session_at,
        a.updated_at                                   AS last_activity_at,
        a.created_at                                   AS created_at,
        a.updated_at                                   AS updated_at,
        NULL::text                                     AS client_id,
        NULL::text                                     AS client_name,
        NULL::text                                     AS current_risk,
        NULL::text                                     AS scheme_id,
        NULL::integer                                  AS capacity,
        NULL::text                                     AS course_id,
        NULL::text                                     AS course_type,
        a.assessment_type                              AS assessment_type
    FROM assessments a
    WHERE a.org_id = :org_id
      AND a.deleted_at IS NULL
"""

_BRANCHES: dict[ServiceKindInput, str] = {
    "counseling": _BRANCH_COUNSELING,
    "group": _BRANCH_GROUP,
    "course": _BRANCH_COURSE,
    "assessment": _BRANCH_ASSESSMENT,
}


def _normalize_kinds(kinds: list[str] | None) -> set[ServiceKindInput] | None:
    """``kinds=['counseling','foo']`` → ``{'counseling'}``; 全无效 → None。

    与 delivery.routes.ts:91-97 ``parseKindList`` 等价 — 无效值丢弃, 全部无效
    时回退到全部 kind (None 表示 "无 filter")。
    """
    if not kinds:
        return None
    valid: set[ServiceKindInput] = {k for k in kinds if k in _VALID_KINDS}
    return valid if valid else None


def _normalize_statuses(statuses: list[str] | None) -> list[str] | None:
    """空 / None → None (不 filter); 非空 → 原样列表。"""
    if not statuses:
        return None
    cleaned = [s for s in statuses if s]
    return cleaned if cleaned else None


async def list_service_instances(
    db: AsyncSession,
    org_id: str,
    *,
    kinds: list[str] | None = None,
    statuses: list[str] | None = None,
    limit: int | None = None,
    offset: int | None = None,
) -> ListServicesResponse:
    """聚合 4 类 service 实例 (镜像 delivery.service.ts:70-286).

    Args:
        db:        SQLAlchemy async session
        org_id:    机构 UUID 字符串 (路由层已 OrgContext 校验)
        kinds:     limit to specific kinds, None / 空 → 全部 4 类
        statuses:  limit to specific (mapped) statuses, None → 不过滤
        limit:     1..500, 默认 60 (与 Node ``query.limit ?? 60`` 一致)
        offset:    默认 0

    Returns:
        ``ListServicesResponse(items, total)`` —
        ``total`` 是不带 LIMIT/OFFSET 的总行数, 给分页 UI 用。
    """
    parse_uuid_or_raise(org_id, field="orgId")  # 防 PG "invalid input syntax"

    capped_limit = min(max(limit if limit is not None else 60, 1), 500)
    capped_offset = max(offset if offset is not None else 0, 0)

    want = _normalize_kinds(kinds)
    branch_keys: list[ServiceKindInput] = list(want) if want is not None else list(_BRANCHES.keys())
    if not branch_keys:
        return ListServicesResponse(items=[], total=0)

    union_sql = " UNION ALL ".join(_BRANCHES[k] for k in branch_keys)

    statuses_clean = _normalize_statuses(statuses)
    status_clause = ""
    if statuses_clean:
        # 走 expanding bindparam 防 SQL 注入 + 跨 driver 兼容
        status_clause = " WHERE combined.status IN :statuses"

    final_sql = f"""
        WITH combined AS (
            {union_sql}
        )
        SELECT * FROM combined
        {status_clause}
        ORDER BY combined.last_activity_at DESC NULLS LAST
        LIMIT :limit OFFSET :offset
    """
    count_sql = f"""
        WITH combined AS (
            {union_sql}
        )
        SELECT COUNT(*)::int AS total FROM combined
        {status_clause}
    """

    params: dict[str, Any] = {
        "org_id": org_id,
        "limit": capped_limit,
        "offset": capped_offset,
    }
    final_stmt = text(final_sql)
    count_stmt = text(count_sql)
    if statuses_clean:
        # ``expanding=True`` 让 PG 把 :statuses 展开成 (?, ?, ...) tuple, 跟驱动无关
        final_stmt = final_stmt.bindparams(bindparam("statuses", expanding=True))
        count_stmt = count_stmt.bindparams(bindparam("statuses", expanding=True))
        params["statuses"] = statuses_clean

    rows_result = await db.execute(final_stmt, params)
    raw_rows = list(rows_result.mappings().all())

    count_result = await db.execute(count_stmt, params)
    total = int(count_result.scalar() or 0)

    items = [_row_to_service_instance(r) for r in raw_rows]
    return ListServicesResponse(items=items, total=total)


def _row_to_service_instance(row: Any) -> ServiceInstance:
    """raw row dict → ``ServiceInstance`` (镜像 delivery.service.ts:294-318 ``toCamel``)。

    Mappings 行用 ``["col"]`` 访问 (跟驱动无关 dict-like)。 ``last_activity_at``
    / ``created_at`` / ``updated_at`` 可能是 datetime / str / None — 统一转
    isoformat 让 wire 一致。
    """

    def _iso(v: Any) -> str:
        if v is None:
            return ""
        if isinstance(v, str):
            return v
        # datetime, date 等
        return v.isoformat() if hasattr(v, "isoformat") else str(v)

    def _iso_or_none(v: Any) -> str | None:
        return _iso(v) if v is not None else None

    return ServiceInstance(
        id=str(row["id"]),
        kind=row["kind"],
        org_id=str(row["org_id"]),
        title=str(row["title"]),
        status=str(row["status"]),
        owner_id=str(row.get("owner_id") or ""),
        participant_count=int(row.get("participant_count") or 0),
        next_session_at=_iso_or_none(row.get("next_session_at")),
        last_activity_at=_iso(row["last_activity_at"]),
        created_at=_iso(row["created_at"]),
        updated_at=_iso(row["updated_at"]),
        client_id=str(row["client_id"]) if row.get("client_id") else None,
        client_name=str(row["client_name"]) if row.get("client_name") else None,
        current_risk=str(row["current_risk"]) if row.get("current_risk") else None,
        scheme_id=str(row["scheme_id"]) if row.get("scheme_id") else None,
        capacity=int(row["capacity"]) if row.get("capacity") is not None else None,
        course_id=str(row["course_id"]) if row.get("course_id") else None,
        course_type=str(row["course_type"]) if row.get("course_type") else None,
        assessment_type=str(row["assessment_type"]) if row.get("assessment_type") else None,
    )


__all__ = ["list_service_instances"]


# ────────────────────────────────────────────────────────────────
# 静态分析 — 让 mypy 知道 ValidationError / uuid 可能在 future 用到
# ────────────────────────────────────────────────────────────────

_ = (ValidationError, uuid)
