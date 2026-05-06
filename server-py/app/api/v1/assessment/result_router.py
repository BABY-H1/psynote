"""
Result router — 镜像 ``server/src/modules/assessment/result.routes.ts`` (168 行) +
``result.service.ts`` (436 行 PHI 核心).

挂在 ``/api/orgs/{org_id}/assessment-results`` prefix. 7 个 endpoint:

  GET    /                                 — 列表 (filter: assessmentId/userId/...,
                                              respect data_scope='assigned')
  GET    /trajectory                       — Phase 9β 纵向 (userId × scaleId)
  GET    /{result_id}                      — 单条详情 (PHI access log)
  POST   /                                 — 提交 (任意 staff or anon, 自动计分 + 派
                                              triage)
  DELETE /{result_id}                      — 软删除 (org_admin only)
  PATCH  /{result_id}/client-visible       — Phase 9β 切换可见 (admin/counselor)
  PATCH  /{result_id}/recommendations      — Phase 9β 写 AI 推荐 (admin/counselor)

Public sub-router (``/api/public/assessments``):
  POST /{assessment_id}/submit             — 匿名公开提交, no auth

PHI 守门 (Phase 1.7 ``record_phi_access``):
  - GET ``/{result_id}`` 当 result.user_id 既存在又不是 caller 自己 → 调
    ``record_phi_access(action='view')``. 自己看自己 / 匿名结果跳.
  - DELETE 不算 view 不写 phi_access (走 audit_log).

业务计分 (submit_result, 镜像 service:256-424):
  1. 加载 assessment + linked scales 的 dimensions / items / rules.
  2. 对每个 dimension: 累加 / 平均 (按 calculation_method).
  3. 反向计分: ``maxVal + minVal - answer``.
  4. 选最高 risk_level (level_4 > level_3 > level_2 > level_1).
  5. fire-and-forget 触发 ``triage_automation_service.auto_triage_and_notify``.

匿名公开测评:
  - ``user_id IS NULL`` 时不写 phi_access_logs (无个体可追溯, 与 Node 一致).
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy import and_, asc, desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.assessment.schemas import (
    PublicResultSubmitRequest,
    ResultClientVisibleRequest,
    ResultInterpretation,
    ResultListItem,
    ResultRecommendationsRequest,
    ResultRow,
    ResultSubmitRequest,
    TrajectoryPoint,
)
from app.api.v1.assessment.triage_automation_service import auto_triage_and_notify
from app.core.database import get_db
from app.db.models.assessment_results import AssessmentResult
from app.db.models.assessment_scales import AssessmentScale
from app.db.models.assessments import Assessment
from app.db.models.dimension_rules import DimensionRule
from app.db.models.scale_dimensions import ScaleDimension
from app.db.models.scale_items import ScaleItem
from app.db.models.scales import Scale
from app.lib.errors import ForbiddenError, NotFoundError, ValidationError
from app.lib.uuid_utils import parse_uuid_or_none, parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.data_scope import DataScope, get_data_scope
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.phi_access import record_phi_access
from app.middleware.role_guards import (
    require_admin as _require_org_admin,
)
from app.middleware.role_guards import (
    require_admin_or_counselor as _require_admin_or_counselor,
)

logger = logging.getLogger(__name__)

router = APIRouter()
public_router = APIRouter()


_RISK_PRIORITY = {
    "level_1": 1,
    "level_2": 2,
    "level_3": 3,
    "level_4": 4,
}


# ─── 工具 ────────────────────────────────────────────────────────


def _orm_to_row(r: AssessmentResult) -> ResultRow:
    return ResultRow(
        id=str(r.id),
        org_id=str(r.org_id),
        assessment_id=str(r.assessment_id),
        user_id=str(r.user_id) if r.user_id else None,
        care_episode_id=str(r.care_episode_id) if r.care_episode_id else None,
        demographic_data=dict(r.demographic_data or {}),
        answers=dict(r.answers or {}),
        custom_answers=dict(r.custom_answers or {}),
        dimension_scores=dict(r.dimension_scores or {}),
        total_score=r.total_score,
        risk_level=r.risk_level,
        ai_interpretation=r.ai_interpretation,
        client_visible=bool(r.client_visible),
        recommendations=list(r.recommendations or []),
        ai_provenance=dict(r.ai_provenance) if r.ai_provenance else None,
        batch_id=str(r.batch_id) if r.batch_id else None,
        created_by=str(r.created_by) if r.created_by else None,
        deleted_at=r.deleted_at,
        created_at=getattr(r, "created_at", None),
    )


# ─── routes ─────────────────────────────────────────────────────


@router.get("/", response_model=list[ResultListItem])
async def list_results(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    data_scope: Annotated[DataScope | None, Depends(get_data_scope)],
    db: Annotated[AsyncSession, Depends(get_db)],
    assessment_id: Annotated[str | None, Query(alias="assessmentId")] = None,
    user_id: Annotated[str | None, Query(alias="userId")] = None,
    care_episode_id: Annotated[str | None, Query(alias="careEpisodeId")] = None,
    batch_id: Annotated[str | None, Query(alias="batchId")] = None,
    risk_level: Annotated[str | None, Query(alias="riskLevel")] = None,
) -> list[ResultListItem]:
    """列表 + filter, 按 ``data_scope`` 过滤. 镜像 service:14-150.

    enrich: assessmentTitle / scaleTitles / interpretations.
    """
    if org is None:
        raise ForbiddenError("org_context_required")
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")

    conditions: list[Any] = [
        AssessmentResult.org_id == org_uuid,
        AssessmentResult.deleted_at.is_(None),
    ]

    # data_scope='assigned' 过滤 (允许匿名 user_id IS NULL 也透出, 公开测评本就无主)
    if data_scope is not None and data_scope.type == "assigned":
        if not data_scope.allowed_client_ids:
            conditions.append(AssessmentResult.user_id.is_(None))
        else:
            allowed = [
                parse_uuid_or_raise(c, field="clientId") for c in data_scope.allowed_client_ids
            ]
            conditions.append(
                or_(
                    AssessmentResult.user_id.in_(allowed),
                    AssessmentResult.user_id.is_(None),
                )
            )

    if assessment_id:
        conditions.append(
            AssessmentResult.assessment_id
            == parse_uuid_or_raise(assessment_id, field="assessmentId")
        )
    if user_id:
        conditions.append(AssessmentResult.user_id == parse_uuid_or_raise(user_id, field="userId"))
    if care_episode_id:
        conditions.append(
            AssessmentResult.care_episode_id
            == parse_uuid_or_raise(care_episode_id, field="careEpisodeId")
        )
    if batch_id:
        conditions.append(
            AssessmentResult.batch_id == parse_uuid_or_raise(batch_id, field="batchId")
        )
    if risk_level:
        conditions.append(AssessmentResult.risk_level == risk_level)

    q = (
        select(AssessmentResult)
        .where(and_(*conditions))
        .order_by(desc(AssessmentResult.created_at))
    )
    rows = list((await db.execute(q)).scalars().all())
    if not rows:
        return []

    # enrich: assessment titles
    assessment_ids = list({r.assessment_id for r in rows})
    a_map: dict[uuid.UUID, str] = {}
    if assessment_ids:
        a_q = select(Assessment.id, Assessment.title).where(Assessment.id.in_(assessment_ids))
        for aid, atitle in (await db.execute(a_q)).all():
            a_map[aid] = atitle

    # enrich: scale titles per assessment
    scale_map: dict[uuid.UUID, list[str]] = {}
    if assessment_ids:
        s_q = (
            select(AssessmentScale.assessment_id, Scale.title)
            .join(Scale, Scale.id == AssessmentScale.scale_id)
            .where(AssessmentScale.assessment_id.in_(assessment_ids))
            .order_by(asc(AssessmentScale.sort_order))
        )
        for aid, stitle in (await db.execute(s_q)).all():
            scale_map.setdefault(aid, []).append(stitle)

    # enrich: dimension labels
    all_dim_keys: set[str] = set()
    for r in rows:
        ds = r.dimension_scores or {}
        if isinstance(ds, dict):
            all_dim_keys.update(ds.keys())
    dim_uuids = [d for d in (parse_uuid_or_none(k) for k in all_dim_keys) if d is not None]

    dim_name_map: dict[str, str] = {}
    rule_rows: list[DimensionRule] = []
    if dim_uuids:
        d_q = select(ScaleDimension.id, ScaleDimension.name).where(ScaleDimension.id.in_(dim_uuids))
        for did, dname in (await db.execute(d_q)).all():
            dim_name_map[str(did)] = dname

        r_q = select(DimensionRule).where(DimensionRule.dimension_id.in_(dim_uuids))
        rule_rows = list((await db.execute(r_q)).scalars().all())

    out: list[ResultListItem] = []
    for r in rows:
        interpretations: list[ResultInterpretation] = []
        ds = r.dimension_scores or {}
        if isinstance(ds, dict):
            for dim_id, raw_score in ds.items():
                score = float(raw_score)
                rules = [
                    rr
                    for rr in rule_rows
                    if rr.dimension_id is not None and str(rr.dimension_id) == dim_id
                ]
                matched = next(
                    (rr for rr in rules if float(rr.min_score) <= score <= float(rr.max_score)),
                    None,
                )
                interpretations.append(
                    ResultInterpretation(
                        dimension=dim_name_map.get(dim_id, dim_id),
                        score=score,
                        label=matched.label if matched else "",
                    )
                )

        base = _orm_to_row(r)
        out.append(
            ResultListItem(
                **base.model_dump(by_alias=False),
                assessment_title=a_map.get(r.assessment_id),
                scale_titles=scale_map.get(r.assessment_id, []),
                interpretations=interpretations,
            )
        )
    return out


@router.get("/trajectory", response_model=list[TrajectoryPoint])
async def get_trajectory(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Annotated[str | None, Query(alias="userId")] = None,
    scale_id: Annotated[str | None, Query(alias="scaleId")] = None,
) -> list[TrajectoryPoint]:
    """Phase 9β — 单 client × 单 scale 的纵向 trend 数据点. 镜像 service:178-219."""
    if org is None:
        raise ForbiddenError("org_context_required")
    if not user_id:
        raise ValidationError("userId is required")
    if not scale_id:
        raise ValidationError("scaleId is required")

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    uid = parse_uuid_or_raise(user_id, field="userId")
    sid = parse_uuid_or_raise(scale_id, field="scaleId")

    # 找包含此 scale 的所有 assessment ids
    link_q = select(AssessmentScale.assessment_id).where(AssessmentScale.scale_id == sid)
    allowed_aids = [aid for (aid,) in (await db.execute(link_q)).all()]
    if not allowed_aids:
        return []

    q = (
        select(AssessmentResult)
        .where(
            and_(
                AssessmentResult.org_id == org_uuid,
                AssessmentResult.user_id == uid,
                AssessmentResult.deleted_at.is_(None),
                AssessmentResult.assessment_id.in_(allowed_aids),
            )
        )
        .order_by(asc(AssessmentResult.created_at))
    )
    rows = list((await db.execute(q)).scalars().all())
    return [
        TrajectoryPoint(
            id=str(r.id),
            assessment_id=str(r.assessment_id),
            total_score=r.total_score,
            risk_level=r.risk_level,
            dimension_scores=dict(r.dimension_scores or {}),
            client_visible=bool(r.client_visible),
            created_at=getattr(r, "created_at", None),
        )
        for r in rows
    ]


@router.get("/{result_id}", response_model=ResultRow)
async def get_result(
    org_id: str,
    result_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ResultRow:
    """单条详情. 调用方非自己时 → 写 phi_access_logs (action='view'). 镜像 routes.ts:30-48."""
    if org is None:
        raise ForbiddenError("org_context_required")

    rid = parse_uuid_or_raise(result_id, field="resultId")
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    # Phase 5 P0 fix (Fix 2): 详情按 (id, org_id) 双 filter, 防止跨组织 PHI 越权读
    q = (
        select(AssessmentResult)
        .where(
            AssessmentResult.id == rid,
            AssessmentResult.org_id == org_uuid,
        )
        .limit(1)
    )
    r = (await db.execute(q)).scalar_one_or_none()
    if r is None:
        raise NotFoundError("AssessmentResult", result_id)

    # PHI access log (Phase 1.7): user_id 存在 且 不是自己看自己 → 写一行
    # user_id 缺失的匿名结果不走 (无个体可追溯, 与 Node service:38 一致)
    if r.user_id is not None and str(r.user_id) != user.id:
        await record_phi_access(
            db=db,
            org_id=org_id,
            user_id=user.id,
            client_id=str(r.user_id),
            resource="assessment_results",
            action="view",
            resource_id=result_id,
            data_class="phi_full",
            actor_role_snapshot=org.role_v2,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )

    return _orm_to_row(r)


@router.post("/", response_model=ResultRow, status_code=status.HTTP_201_CREATED)
async def submit_result(
    org_id: str,
    body: ResultSubmitRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ResultRow:
    """提交结果 (任意已认证). 自动计分 + 触发 triage. 镜像 routes.ts:51-79 + service:256-424."""
    if org is None:
        raise ForbiddenError("org_context_required")
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    creator_uuid = parse_uuid_or_raise(user.id, field="userId")

    target_user_id: uuid.UUID | None = (
        parse_uuid_or_raise(body.user_id, field="userId") if body.user_id else creator_uuid
    )

    result = await _score_and_save(
        db=db,
        org_uuid=org_uuid,
        body=body,
        target_user_id=target_user_id,
        created_by=creator_uuid,
    )

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="create",
        resource="assessment_results",
        resource_id=str(result.id),
        ip_address=request.client.host if request.client else None,
    )
    # #12: audit 与 result 是 must-persist; triage 是 nice-to-have. 这里独立 commit
    # 让 audit 一定落盘 — 之前与 triage commit 共用一次, triage 抛错时 audit 也丢了。
    await db.commit()

    # 触发 triage automation (与 Node fire-and-forget 等价, 但放当前 transaction 内)
    if result.risk_level:
        try:
            await auto_triage_and_notify(
                db=db,
                org_id=str(org_uuid),
                result_id=str(result.id),
                risk_level=result.risk_level,
                user_id=str(target_user_id) if target_user_id else None,
                dimension_scores={k: float(v) for k, v in (result.dimension_scores or {}).items()},
            )
            await db.commit()
        except Exception:
            # triage 失败 rollback 当前 txn 防 dangling state; 上面 audit 已落盘不受影响
            await db.rollback()
            logger.exception("[submit_result] triage automation failed (non-blocking)")

    return _orm_to_row(result)


@router.delete("/{result_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_result(
    org_id: str,
    result_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """软删除 (org_admin only). 镜像 routes.ts:82-89."""
    _require_org_admin(org)

    rid = parse_uuid_or_raise(result_id, field="resultId")
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    # Phase 5 P0 fix (Fix 2): 详情按 (id, org_id) 双 filter, 防止跨组织 PHI 越权删
    q = (
        select(AssessmentResult)
        .where(
            and_(
                AssessmentResult.id == rid,
                AssessmentResult.org_id == org_uuid,
                AssessmentResult.deleted_at.is_(None),
            )
        )
        .limit(1)
    )
    r = (await db.execute(q)).scalar_one_or_none()
    if r is None:
        raise NotFoundError("AssessmentResult", result_id)

    r.deleted_at = datetime.now(UTC)
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="delete",
        resource="assessment_results",
        resource_id=result_id,
        ip_address=request.client.host if request.client else None,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/{result_id}/client-visible", response_model=ResultRow)
async def set_client_visible(
    org_id: str,
    result_id: str,
    body: ResultClientVisibleRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ResultRow:
    """Phase 9β — 切换 client_visible (admin/counselor). 镜像 routes.ts:111-122."""
    _require_admin_or_counselor(org)

    rid = parse_uuid_or_raise(result_id, field="resultId")
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    # Phase 5 P0 fix (Fix 2): 详情按 (id, org_id) 双 filter, 防止跨组织 PHI 越权写
    q = (
        select(AssessmentResult)
        .where(
            AssessmentResult.id == rid,
            AssessmentResult.org_id == org_uuid,
        )
        .limit(1)
    )
    r = (await db.execute(q)).scalar_one_or_none()
    if r is None:
        raise NotFoundError("AssessmentResult", result_id)

    old_visible = bool(r.client_visible)
    r.client_visible = body.visible
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="assessment_results",
        resource_id=result_id,
        changes={"clientVisible": {"old": old_visible, "new": body.visible}},
        ip_address=request.client.host if request.client else None,
    )
    return _orm_to_row(r)


@router.patch("/{result_id}/recommendations", response_model=ResultRow)
async def set_recommendations(
    org_id: str,
    result_id: str,
    body: ResultRecommendationsRequest,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ResultRow:
    """Phase 9β — 写 AI recommendations (admin/counselor). 镜像 routes.ts:130-139."""
    _require_admin_or_counselor(org)

    rid = parse_uuid_or_raise(result_id, field="resultId")
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    # Phase 5 P0 fix (Fix 2): 详情按 (id, org_id) 双 filter, 防止跨组织 PHI 越权写
    q = (
        select(AssessmentResult)
        .where(
            AssessmentResult.id == rid,
            AssessmentResult.org_id == org_uuid,
        )
        .limit(1)
    )
    r = (await db.execute(q)).scalar_one_or_none()
    if r is None:
        raise NotFoundError("AssessmentResult", result_id)

    r.recommendations = body.recommendations
    await db.commit()
    return _orm_to_row(r)


# ─── public_router (no auth, /api/public/assessments) ────────────


@public_router.post(
    "/{assessment_id}/submit",
    response_model=ResultRow,
    status_code=status.HTTP_201_CREATED,
)
async def public_submit_result(
    assessment_id: str,
    body: PublicResultSubmitRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ResultRow:
    """匿名公开提交 (no auth). 镜像 routes.ts:146-167.

    org_id 从 assessment 推 (调用方不传).
    """
    aid = parse_uuid_or_raise(assessment_id, field="assessmentId")
    a_q = select(Assessment).where(Assessment.id == aid).limit(1)
    a = (await db.execute(a_q)).scalar_one_or_none()
    if a is None:
        raise NotFoundError("Assessment", assessment_id)

    submit = ResultSubmitRequest(
        assessment_id=assessment_id,
        user_id=None,
        care_episode_id=None,
        batch_id=None,
        demographic_data=body.demographic_data,
        answers=body.answers,
    )
    result = await _score_and_save(
        db=db,
        org_uuid=a.org_id,
        body=submit,
        target_user_id=None,
        created_by=None,
    )

    # 匿名结果不写 phi_access (无个体可追溯)
    return _orm_to_row(result)


# ─── 内部计分函数 (assessment.service.ts:256-424) ────────────────


async def _score_and_save(
    *,
    db: AsyncSession,
    org_uuid: uuid.UUID,
    body: ResultSubmitRequest,
    target_user_id: uuid.UUID | None,
    created_by: uuid.UUID | None,
) -> AssessmentResult:
    """加载 assessment + scales + 维度 + 题目 + 规则, 计算 dimension_scores + risk_level."""
    aid = parse_uuid_or_raise(body.assessment_id, field="assessmentId")

    # 1. assessment
    a_q = select(Assessment).where(Assessment.id == aid).limit(1)
    a = (await db.execute(a_q)).scalar_one_or_none()
    if a is None:
        raise NotFoundError("Assessment", body.assessment_id)

    org_id = org_uuid or a.org_id

    # 2. linked scale ids (sorted)
    ls_q = (
        select(AssessmentScale.scale_id)
        .where(AssessmentScale.assessment_id == aid)
        .order_by(asc(AssessmentScale.sort_order))
    )
    scale_ids = [sid for (sid,) in (await db.execute(ls_q)).all()]

    # 3. dimensions / items / rules / scales
    all_dimensions: list[ScaleDimension] = []
    all_items: list[ScaleItem] = []
    all_rules: list[DimensionRule] = []
    if scale_ids:
        d_q = select(ScaleDimension).where(ScaleDimension.scale_id.in_(scale_ids))
        all_dimensions = list((await db.execute(d_q)).scalars().all())

        i_q = select(ScaleItem).where(ScaleItem.scale_id.in_(scale_ids))
        all_items = list((await db.execute(i_q)).scalars().all())

        dim_ids = [d.id for d in all_dimensions]
        if dim_ids:
            r_q = select(DimensionRule).where(DimensionRule.dimension_id.in_(dim_ids))
            all_rules = list((await db.execute(r_q)).scalars().all())

    # 4. compute dimension scores
    dimension_scores: dict[str, float] = {}
    highest_risk: str | None = None

    for dim in all_dimensions:
        dim_items = [it for it in all_items if it.dimension_id == dim.id]
        score: float = 0.0
        answered_count = 0

        for item in dim_items:
            answer = body.answers.get(str(item.id))
            if answer is None:
                continue

            if item.is_reverse_scored:
                option_values = [float(opt.get("value", 0)) for opt in (item.options or [])]
                if option_values:
                    max_val = max(option_values)
                    min_val = min(option_values)
                    score += max_val + min_val - float(answer)
                else:
                    score += float(answer)
            else:
                score += float(answer)
            answered_count += 1

        if dim.calculation_method == "average" and answered_count > 0:
            score = score / answered_count

        dimension_scores[str(dim.id)] = round(score * 100) / 100

        # match risk level
        rules = [rr for rr in all_rules if rr.dimension_id == dim.id]
        for rule in rules:
            if float(rule.min_score) <= score <= float(rule.max_score) and rule.risk_level:
                cur_p = _RISK_PRIORITY.get(highest_risk or "", 0)
                rule_p = _RISK_PRIORITY.get(rule.risk_level, 0)
                if rule_p > cur_p:
                    highest_risk = rule.risk_level

    total_score = sum(dimension_scores.values())

    # 5. INSERT
    new_result = AssessmentResult(
        org_id=org_id,
        assessment_id=aid,
        user_id=target_user_id,
        care_episode_id=parse_uuid_or_none(body.care_episode_id),
        batch_id=parse_uuid_or_none(body.batch_id),
        demographic_data=body.demographic_data or {},
        answers=body.answers,
        dimension_scores=dimension_scores,
        total_score=Decimal(str(total_score)),
        risk_level=highest_risk,
        created_by=created_by,
    )
    db.add(new_result)
    await db.commit()
    return new_result


__all__ = ["public_router", "router"]
