"""
Person archive 服务层 — 镜像 ``server/src/modules/delivery/person-archive.service.ts`` (479 行)。

"Person archive" = 单一人员跨 4 模块的全部 service touchpoint:
  - care_episodes  WHERE client_id = userId
  - group_enrollments → JOIN group_instances WHERE org_id
  - course_enrollments → JOIN course_instances WHERE org_id
  - assessment_results → JOIN assessments WHERE org_id

两个 entry:
  - ``list_people(db, org_id, limit)``       — 列表 + 计数 (PeopleList.tsx)
  - ``get_person_archive(db, org_id, user_id)`` — 单人完整档案 (PersonArchive.tsx)

跨表大聚合, N+1 风险高, 实现策略 (与 Node 一致):

  list_people: **单 raw SQL UNION ALL** (5 分支: 4 个 touchpoint + bare membership),
               外层 GROUP BY 一次出全部用户 + 最后活动时间 + 各 kind 计数。
               比 fan-out 4 query + 客户端聚合性能高一个数量级。

  get_person_archive: **5 个 SQLAlchemy ``select`` 并行** (asyncio.gather) —
               user lookup + 4 个 service touchpoint 查询并发跑 (5 round-trip
               时间 ≈ 最慢一条), 不是串行。每条都按 (orgId + userId) 索引覆盖,
               不会 full scan。

状态映射 (STATUS_MAP_*) 与 ``delivery.service.ts`` (Phase 5b) 同步, 两边一改两边改。
"""

from __future__ import annotations

import asyncio
from typing import Any

from sqlalchemy import and_, desc, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.delivery.schemas import (
    ArchivedService,
    ArchiveTimelineEvent,
    ArchiveTimelineEventType,
    ListPeopleResponse,
    PersonArchive,
    PersonArchiveUser,
    PersonCounts,
    PersonSummary,
)
from app.db.models.assessment_results import AssessmentResult
from app.db.models.assessments import Assessment
from app.db.models.care_episodes import CareEpisode
from app.db.models.course_enrollments import CourseEnrollment
from app.db.models.course_instances import CourseInstance
from app.db.models.group_enrollments import GroupEnrollment
from app.db.models.group_instances import GroupInstance
from app.db.models.users import User
from app.lib.errors import NotFoundError
from app.lib.uuid_utils import parse_uuid_or_raise

# ─── 状态映射 (镜像 person-archive.service.ts:219-243) ──────────


_STATUS_MAP_EPISODE: dict[str, str] = {
    "active": "ongoing",
    "paused": "paused",
    "closed": "closed",
    "archived": "archived",
}
_STATUS_MAP_GROUP: dict[str, str] = {
    "draft": "draft",
    "recruiting": "recruiting",
    "ongoing": "ongoing",
    "full": "ongoing",
    "ended": "completed",
}
_STATUS_MAP_COURSE: dict[str, str] = {
    "draft": "draft",
    "active": "ongoing",
    "closed": "closed",
    "archived": "archived",
}


def _map_assessment_status(status: str | None, is_active: bool | None) -> str:
    """assessment 状态分支 (镜像 person-archive.service.ts:239-243)。"""
    if status == "draft":
        return "draft"
    if status == "archived":
        return "archived"
    return "ongoing" if is_active else "paused"


def _iso(value: Any) -> str | None:
    """datetime / date / None → ISO str 或 None (集中处理 wire 一致性)。"""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


# ─── list_people (镜像 person-archive.service.ts:120-215) ─────


async def list_people(
    db: AsyncSession,
    org_id: str,
    limit: int | None = 200,
) -> ListPeopleResponse:
    """列出该 org 内所有有 service touchpoint OR 仅成员身份的客户。

    实现: 单 SQL CTE + UNION ALL 5 分支 (4 touchpoint + bare membership).
    membership 分支保证刚注册无 touchpoint 的 client 仍能被咨询师在列表里找到。
    """
    parse_uuid_or_raise(org_id, field="orgId")
    cap = min(max(limit if limit is not None else 200, 1), 1000)

    sql = text(
        """
        WITH touchpoints AS (
            SELECT
                ce.client_id::text  AS user_id,
                'counseling'::text  AS kind,
                ce.updated_at       AS last_activity_at
            FROM care_episodes ce
            WHERE ce.org_id = :org_id

            UNION ALL

            SELECT
                ge.user_id::text    AS user_id,
                'group'::text       AS kind,
                COALESCE(ge.enrolled_at, ge.created_at, gi.updated_at) AS last_activity_at
            FROM group_enrollments ge
            INNER JOIN group_instances gi ON gi.id = ge.instance_id
            WHERE gi.org_id = :org_id

            UNION ALL

            SELECT
                cen.user_id::text   AS user_id,
                'course'::text      AS kind,
                COALESCE(cen.enrolled_at, ci.updated_at) AS last_activity_at
            FROM course_enrollments cen
            INNER JOIN course_instances ci ON ci.id = cen.instance_id
            WHERE ci.org_id = :org_id

            UNION ALL

            SELECT
                ar.user_id::text    AS user_id,
                'assessment'::text  AS kind,
                ar.created_at       AS last_activity_at
            FROM assessment_results ar
            WHERE ar.org_id = :org_id
              AND ar.user_id IS NOT NULL
              AND ar.deleted_at IS NULL

            UNION ALL

            -- bare membership: 仅 active client member, 即使无 touchpoint
            SELECT
                om.user_id::text  AS user_id,
                'member'::text    AS kind,
                COALESCE(om.created_at, NOW()) AS last_activity_at
            FROM org_members om
            WHERE om.org_id = :org_id
              AND om.role = 'client'
              AND om.status = 'active'
        )
        SELECT
            t.user_id,
            u.name,
            u.email,
            MAX(t.last_activity_at) AS last_activity_at,
            COUNT(*) FILTER (WHERE t.kind = 'counseling') AS counseling,
            COUNT(*) FILTER (WHERE t.kind = 'group')      AS group_count,
            COUNT(*) FILTER (WHERE t.kind = 'course')     AS course_count,
            COUNT(*) FILTER (WHERE t.kind = 'assessment') AS assessment
        FROM touchpoints t
        LEFT JOIN users u ON u.id = t.user_id::uuid
        GROUP BY t.user_id, u.name, u.email
        ORDER BY MAX(t.last_activity_at) DESC NULLS LAST
        LIMIT :cap
        """
    )

    result = await db.execute(sql, {"org_id": org_id, "cap": cap})
    rows = list(result.mappings().all())

    items: list[PersonSummary] = []
    for row in rows:
        counseling = int(row["counseling"] or 0)
        group = int(row["group_count"] or 0)
        course = int(row["course_count"] or 0)
        assessment = int(row["assessment"] or 0)
        items.append(
            PersonSummary(
                user_id=str(row["user_id"]),
                name=str(row["name"]) if row.get("name") else "未知用户",
                email=str(row["email"]) if row.get("email") else None,
                last_activity_at=_iso(row["last_activity_at"]) or "",
                counts=PersonCounts(
                    counseling=counseling,
                    group=group,
                    course=course,
                    assessment=assessment,
                    total=counseling + group + course + assessment,
                ),
            )
        )
    return ListPeopleResponse(items=items)


# ─── get_person_archive (镜像 person-archive.service.ts:253-479) ─


async def get_person_archive(
    db: AsyncSession,
    org_id: str,
    user_id: str,
) -> PersonArchive:
    """单人完整档案: 5 query 并行 (user + 4 模块 touchpoint).

    Raises:
        NotFoundError: 用户不存在 (即使有零 touchpoint, user 行存在也会成功返回
                       空 archive — 与 Node 一致)。
    """
    parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user_id, field="userId")

    # 5 个查询并行 — asyncio.gather 而非串行 await (与 Node Promise.all 等价)
    user_q = select(User).where(User.id == user_uuid).limit(1)
    episode_q = (
        select(CareEpisode)
        .where(
            and_(
                CareEpisode.org_id == parse_uuid_or_raise(org_id, field="orgId"),
                CareEpisode.client_id == user_uuid,
            )
        )
        .order_by(desc(CareEpisode.updated_at))
    )
    group_q = (
        select(GroupEnrollment, GroupInstance)
        .join(GroupInstance, GroupInstance.id == GroupEnrollment.instance_id)
        .where(
            and_(
                GroupEnrollment.user_id == user_uuid,
                GroupInstance.org_id == parse_uuid_or_raise(org_id, field="orgId"),
            )
        )
        .order_by(desc(GroupInstance.updated_at))
    )
    course_q = (
        select(CourseEnrollment, CourseInstance)
        .join(CourseInstance, CourseInstance.id == CourseEnrollment.instance_id)
        .where(
            and_(
                CourseEnrollment.user_id == user_uuid,
                CourseInstance.org_id == parse_uuid_or_raise(org_id, field="orgId"),
            )
        )
        .order_by(desc(CourseInstance.updated_at))
    )
    assessment_q = (
        select(AssessmentResult, Assessment)
        .join(Assessment, Assessment.id == AssessmentResult.assessment_id)
        .where(
            and_(
                AssessmentResult.org_id == parse_uuid_or_raise(org_id, field="orgId"),
                AssessmentResult.user_id == user_uuid,
                AssessmentResult.deleted_at.is_(None),
            )
        )
        .order_by(desc(AssessmentResult.created_at))
    )

    (
        user_result,
        episodes_result,
        groups_result,
        courses_result,
        assessments_result,
    ) = await asyncio.gather(
        db.execute(user_q),
        db.execute(episode_q),
        db.execute(group_q),
        db.execute(course_q),
        db.execute(assessment_q),
    )

    user_row = user_result.scalar_one_or_none()
    if user_row is None:
        raise NotFoundError("User", user_id)

    episodes = list(episodes_result.scalars().all())
    group_rows = list(groups_result.all())
    course_rows = list(courses_result.all())
    assessment_rows = list(assessments_result.all())

    services: list[ArchivedService] = []
    timeline: list[ArchiveTimelineEvent] = []

    # ─ counseling (镜像 service.ts:307-341) ─
    for e in episodes:
        services.append(
            ArchivedService(
                id=str(e.id),
                kind="counseling",
                org_id=str(e.org_id),
                title=user_row.name or "未知来访者",
                status=_STATUS_MAP_EPISODE.get(e.status or "", "draft"),
                description=e.chief_complaint,
                joined_at=_iso(e.opened_at),
                last_activity_at=_iso(e.updated_at) or "",
                instance_id=str(e.id),
                chief_complaint=e.chief_complaint,
                current_risk=e.current_risk,
                total_score=None,
            )
        )
        if e.opened_at:
            timeline.append(
                ArchiveTimelineEvent(
                    id=f"ep-open-{e.id}",
                    kind="counseling",
                    type="episode_opened",
                    at=_iso(e.opened_at) or "",
                    title="建立个案",
                    detail=e.chief_complaint,
                    service_id=str(e.id),
                )
            )
        if e.closed_at:
            timeline.append(
                ArchiveTimelineEvent(
                    id=f"ep-close-{e.id}",
                    kind="counseling",
                    type="episode_closed",
                    at=_iso(e.closed_at) or "",
                    title="个案结案",
                    service_id=str(e.id),
                )
            )

    # ─ group (镜像 service.ts:343-374) ─
    for grp_row in group_rows:
        enr: GroupEnrollment = grp_row[0]
        inst: GroupInstance = grp_row[1]
        joined_iso = _iso(enr.enrolled_at) or _iso(getattr(enr, "created_at", None))
        services.append(
            ArchivedService(
                id=str(inst.id),
                kind="group",
                org_id=str(inst.org_id),
                title=inst.title,
                status=_STATUS_MAP_GROUP.get(inst.status or "", "draft"),
                description=inst.description,
                joined_at=joined_iso,
                last_activity_at=_iso(inst.updated_at) or "",
                instance_id=str(inst.id),
            )
        )
        if joined_iso:
            timeline.append(
                ArchiveTimelineEvent(
                    id=f"grp-{enr.id}",
                    kind="group",
                    type="group_enrolled",
                    at=joined_iso,
                    title=f"加入团辅: {inst.title}",
                    service_id=str(inst.id),
                )
            )

    # ─ course (镜像 service.ts:376-403) ─
    for crs_row in course_rows:
        cen: CourseEnrollment = crs_row[0]
        cinst: CourseInstance = crs_row[1]
        joined_iso = _iso(cen.enrolled_at)
        services.append(
            ArchivedService(
                id=str(cinst.id),
                kind="course",
                org_id=str(cinst.org_id),
                title=cinst.title,
                status=_STATUS_MAP_COURSE.get(cinst.status or "", "draft"),
                description=cinst.description,
                joined_at=joined_iso,
                last_activity_at=_iso(cinst.updated_at) or "",
                instance_id=str(cinst.id),
            )
        )
        if joined_iso:
            timeline.append(
                ArchiveTimelineEvent(
                    id=f"crs-{cen.id}",
                    kind="course",
                    type="course_enrolled",
                    at=joined_iso,
                    title=f"加入课程: {cinst.title}",
                    service_id=str(cinst.id),
                )
            )

    # ─ assessment (镜像 service.ts:405-431) ─
    for row in assessment_rows:
        ar: AssessmentResult = row[0]
        a: Assessment = row[1]
        score: float | None = None
        if ar.total_score is not None:
            score = float(ar.total_score)
        services.append(
            ArchivedService(
                id=str(a.id),
                kind="assessment",
                org_id=str(a.org_id),
                title=a.title,
                status=_map_assessment_status(a.status, a.is_active),
                description=a.description,
                joined_at=_iso(getattr(ar, "created_at", None)),
                last_activity_at=_iso(a.updated_at) or "",
                instance_id=str(ar.id),
                total_score=score,
            )
        )
        timeline.append(
            ArchiveTimelineEvent(
                id=f"asm-{ar.id}",
                kind="assessment",
                type="assessment_taken",
                at=_iso(getattr(ar, "created_at", None)) or "",
                title=f"完成测评: {a.title}",
                detail=f"总分 {score}" if score is not None else None,
                service_id=str(a.id),
            )
        )

    # ─ Dedupe by (kind, id) — 同 user 同 assessment 多次提交可能产多 service rows
    seen: dict[str, ArchivedService] = {}
    for s in services:
        key = f"{s.kind}-{s.id}"
        prev = seen.get(key)
        if prev is None:
            seen[key] = s
            continue
        # 取更近的 joinedAt
        if s.joined_at and (not prev.joined_at or s.joined_at > prev.joined_at):
            prev.joined_at = s.joined_at
        # totalScore 优先非 None
        if s.total_score is not None and prev.total_score is None:
            prev.total_score = s.total_score
    unique_services = sorted(
        seen.values(),
        key=lambda s: s.last_activity_at,
        reverse=True,
    )

    # timeline 按 oldest → newest
    timeline.sort(key=lambda e: e.at)

    stats = PersonCounts(
        counseling=len(episodes),
        group=len(group_rows),
        course=len(course_rows),
        assessment=len(assessment_rows),
        total=len(episodes) + len(group_rows) + len(course_rows) + len(assessment_rows),
    )

    return PersonArchive(
        user=PersonArchiveUser(
            id=str(user_row.id),
            name=user_row.name,
            email=user_row.email,
            avatar_url=user_row.avatar_url,
        ),
        stats=stats,
        services=unique_services,
        timeline=timeline,
    )


__all__ = ["get_person_archive", "list_people"]


# ────────────────────────────────────────────────────────────────
# 静态 import 提示
# ────────────────────────────────────────────────────────────────

_ = ArchiveTimelineEventType
