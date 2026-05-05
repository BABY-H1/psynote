"""Client portal "my-assessments" aggregator router.

镜像 ``server/src/modules/client-portal/client-my-assessments.routes.ts``:
  GET /my-assessments  — 跨 group + course 报名聚合"我需要做的测评", 各 phase
                         + 是否完成 + runner URL.

Phase 14: ?as= 拒绝 (家长不能代孩子做测评).
self_only: enrollments 强制 ``user_id == caller_uuid``.

实现要点:
  1. 收集 group_enrollments(approved) + course_enrollments → 拿 instance.assessment_config
  2. 走配置遍历 phases (screening/preGroup/postGroup/satisfaction/perSession/followUp)
     收 unique assessment_id
  3. 过滤 legacy 非 UUID id (与 Node 端 ``uuidRegex`` 一致防漏)
  4. 一次性查 assessments meta + 该 user 在这些 assessment 上已完成的 result
  5. 返回 ``[{id, title, description, completed, context, runnerUrl}]``
"""

from __future__ import annotations

import re
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.client_portal.shared import reject_as_param
from app.core.database import get_db
from app.db.models.assessment_results import AssessmentResult
from app.db.models.assessments import Assessment
from app.db.models.course_enrollments import CourseEnrollment
from app.db.models.course_instances import CourseInstance
from app.db.models.group_enrollments import GroupEnrollment
from app.db.models.group_instances import GroupInstance
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()

# 与 Node uuidRegex (client-my-assessments.routes.ts:88) 完全一致
_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def _harvest_assessment_ids(
    config: dict[str, Any] | None,
    instance_title: str,
    out_set: set[str],
    out_ctx: dict[str, dict[str, str]],
) -> None:
    """从 instance.assessment_config 抓所有 phases 的 assessment id, 去重 + 记录 context.

    与 Node 端 (client-my-assessments.routes.ts:54-83) 行为一致 — 每个 id 第一次出现的
    instance/phase 作为 context, 后续重复忽略 (符合"哪个团给我布置的"语义).
    """
    cfg = config or {}
    phases: list[tuple[str, list[str]]] = [
        ("screening", cfg.get("screening") or []),
        ("preGroup", cfg.get("preGroup") or []),
        ("postGroup", cfg.get("postGroup") or []),
        ("satisfaction", cfg.get("satisfaction") or []),
    ]
    per_session = cfg.get("perSession") or {}
    if isinstance(per_session, dict):
        for ids in per_session.values():
            if isinstance(ids, list):
                phases.append(("perSession", ids))
    follow_up = cfg.get("followUp") or []
    if isinstance(follow_up, list):
        for round_ in follow_up:
            if isinstance(round_, dict):
                ids = round_.get("assessments")
                if isinstance(ids, list):
                    phases.append(("followUp", ids))

    for phase, ids in phases:
        if not isinstance(ids, list):
            continue
        for aid in ids:
            if not isinstance(aid, str):
                continue
            out_set.add(aid)
            if aid not in out_ctx:
                out_ctx[aid] = {"instanceTitle": instance_title, "phase": phase}


# ─── GET /my-assessments ───────────────────────────────────────


@router.get("/my-assessments")
async def list_my_assessments(
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict[str, Any]]:
    """聚合跨 group + course 报名的待测列表 (guardian-blocked)."""
    reject_as_param(request, user)
    assert org is not None
    user_uuid = parse_uuid_or_raise(user.id, field="userId")
    org_uuid = parse_uuid_or_raise(org.org_id, field="orgId")

    # 1. group instances (approved enrollments only) — pick title + assessment_config
    g_q = (
        select(GroupInstance.title, GroupInstance.assessment_config)
        .join(GroupEnrollment, GroupEnrollment.instance_id == GroupInstance.id)
        .where(
            and_(
                GroupEnrollment.user_id == user_uuid,
                GroupEnrollment.status == "approved",
                GroupInstance.org_id == org_uuid,
            )
        )
    )
    group_rows = (await db.execute(g_q)).all()

    # 2. course instances (any enrollment) — pick title + assessment_config
    # 注: course_instances 还需要其它 schema 字段; 用 model 但只 read 需要的列
    c_q = (
        select(CourseInstance.title)
        .join(CourseEnrollment, CourseEnrollment.instance_id == CourseInstance.id)
        .where(
            and_(
                CourseEnrollment.user_id == user_uuid,
                CourseInstance.org_id == org_uuid,
            )
        )
    )
    # course_instances.assessment_config 也要; 一次性 select model
    c_q_full = (
        select(CourseInstance)
        .join(CourseEnrollment, CourseEnrollment.instance_id == CourseInstance.id)
        .where(
            and_(
                CourseEnrollment.user_id == user_uuid,
                CourseInstance.org_id == org_uuid,
            )
        )
    )
    course_rows = list((await db.execute(c_q_full)).scalars().all())
    _ = c_q  # silence unused (kept for future column-level optimization)

    # 3. 收集 assessment id + context
    assessment_id_set: set[str] = set()
    assessment_context: dict[str, dict[str, str]] = {}
    for title, cfg in group_rows:
        _harvest_assessment_ids(cfg or {}, title or "", assessment_id_set, assessment_context)
    for ci in course_rows:
        cfg = getattr(ci, "assessment_config", None)
        _harvest_assessment_ids(cfg or {}, ci.title or "", assessment_id_set, assessment_context)

    if not assessment_id_set:
        return []

    # 4. 过滤 legacy 非 UUID id
    valid_ids: list[uuid.UUID] = []
    for aid in assessment_id_set:
        if _UUID_RE.match(aid):
            try:
                valid_ids.append(uuid.UUID(aid))
            except ValueError:
                continue
    if not valid_ids:
        return []

    # 5. 查 assessments meta
    a_q = select(Assessment.id, Assessment.title, Assessment.description).where(
        or_(*[Assessment.id == aid for aid in valid_ids])
    )
    a_rows = (await db.execute(a_q)).all()

    # 6. 已完成 result 集合
    r_q = select(AssessmentResult.assessment_id).where(
        and_(
            AssessmentResult.user_id == user_uuid,
            or_(*[AssessmentResult.assessment_id == aid for aid in valid_ids]),
        )
    )
    completed_set: set[uuid.UUID] = set((await db.execute(r_q)).scalars().all())

    # 7. 输出
    out: list[dict[str, Any]] = []
    for aid_pk, title, description in a_rows:
        aid_str = str(aid_pk)
        out.append(
            {
                "id": aid_str,
                "title": title,
                "description": description,
                "completed": aid_pk in completed_set,
                "context": assessment_context.get(aid_str),
                "runnerUrl": f"/assess/{aid_str}",
            }
        )
    return out


__all__ = ["router"]
