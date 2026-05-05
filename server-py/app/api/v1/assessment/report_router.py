"""
Report router — 镜像 ``server/src/modules/assessment/report.routes.ts`` (136 行) +
``report.service.ts`` (423 行复杂聚合).

挂在 ``/api/orgs/{org_id}/assessment-reports`` prefix. 6 个 endpoint:

  GET   /                          — 列表 (任意 staff)
  GET   /{report_id}               — 详情
  POST  /                          — 生成报告 (admin/counselor, 4 种 reportType)
  PATCH /{report_id}/narrative     — 更新 narrative (admin/counselor)
  GET   /{report_id}/pdf           — 单报告 PDF (任意 staff)
  POST  /batch-pdf                 — 批量 PDF ZIP (admin/counselor)

报告类型 (reportType):
  - ``individual_single``  — 单人单次报告 (一份 result → 解读 + 维度分级)
  - ``group_single``       — 团体单次报告 (多 results 聚合, 含均值/中位数/标准差)
  - ``individual_trend``   — 单人纵向报告 (>=2 次同 assessment+user, 计算 trend)
  - ``group_longitudinal`` — 团体纵向 (group/course instance 的 PRE/POST 对比 + Cohen's d)

PDF: Phase 3 stub (``app.api.v1.assessment.pdf_service``), Phase 4 接 WeasyPrint.
"""

from __future__ import annotations

import math
import uuid
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy import and_, asc, desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.assessment.pdf_service import (
    generate_batch_pdf_zip,
    generate_report_pdf,
)
from app.api.v1.assessment.schemas import (
    BatchPDFRequest,
    ReportCreateRequest,
    ReportNarrativeUpdateRequest,
    ReportRow,
)
from app.core.database import get_db
from app.db.models.assessment_reports import AssessmentReport
from app.db.models.assessment_results import AssessmentResult
from app.db.models.course_enrollments import CourseEnrollment
from app.db.models.course_instances import CourseInstance
from app.db.models.dimension_rules import DimensionRule
from app.db.models.group_enrollments import GroupEnrollment
from app.db.models.group_instances import GroupInstance
from app.db.models.scale_dimensions import ScaleDimension
from app.db.models.users import User
from app.lib.errors import NotFoundError, ValidationError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.role_guards import (
    reject_client as _reject_client,
)
from app.middleware.role_guards import (
    require_admin_or_counselor as _require_admin_or_counselor,
)

router = APIRouter()


_UUID_REGEX_LEN = 36  # 8-4-4-4-12 hex


def _orm_to_row(r: AssessmentReport) -> ReportRow:
    return ReportRow(
        id=str(r.id),
        org_id=str(r.org_id),
        title=r.title,
        report_type=r.report_type,
        result_ids=[str(rid) for rid in (r.result_ids or [])] if r.result_ids else [],
        batch_id=str(r.batch_id) if r.batch_id else None,
        assessment_id=str(r.assessment_id) if r.assessment_id else None,
        scale_id=str(r.scale_id) if r.scale_id else None,
        content=dict(r.content or {}),
        ai_narrative=r.ai_narrative,
        generated_by=str(r.generated_by) if r.generated_by else None,
        created_at=getattr(r, "created_at", None),
    )


def _round2(v: float) -> float:
    """``Math.round(v * 100) / 100`` 等价 — 保 2 位小数 (与 Node 计算一致)."""
    return round(v * 100) / 100


# ─── routes ─────────────────────────────────────────────────────


@router.get("/", response_model=list[ReportRow])
async def list_reports(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ReportRow]:
    """列表 (按 org). 镜像 service:10-16."""
    _reject_client(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")

    q = (
        select(AssessmentReport)
        .where(AssessmentReport.org_id == org_uuid)
        .order_by(desc(AssessmentReport.created_at))
    )
    rows = (await db.execute(q)).scalars().all()
    return [_orm_to_row(r) for r in rows]


@router.get("/{report_id}", response_model=ReportRow)
async def get_report(
    org_id: str,
    report_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReportRow:
    """单个详情. 镜像 service:18-27."""
    _reject_client(org)
    rid = parse_uuid_or_raise(report_id, field="reportId")
    q = select(AssessmentReport).where(AssessmentReport.id == rid).limit(1)
    r = (await db.execute(q)).scalar_one_or_none()
    if r is None:
        raise NotFoundError("AssessmentReport", report_id)
    return _orm_to_row(r)


# ─── POST / dispatch by reportType ───────────────────────────────


@router.post("/", response_model=ReportRow, status_code=status.HTTP_201_CREATED)
async def create_report(
    org_id: str,
    body: ReportCreateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReportRow:
    """生成报告. 镜像 routes.ts:25-98 (4 种 reportType 分发)."""
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    if body.report_type == "individual_single":
        if not body.result_id:
            raise ValidationError("resultId is required for individual_single")
        report = await _generate_individual_single_report(
            db=db,
            org_uuid=org_uuid,
            result_id=body.result_id,
            generated_by=user_uuid,
        )
    elif body.report_type == "group_single":
        if not body.result_ids:
            raise ValidationError("resultIds are required for group_single")
        report = await _generate_group_single_report(
            db=db,
            org_uuid=org_uuid,
            result_ids=body.result_ids,
            title=body.title or "团体测评报告",
            generated_by=user_uuid,
        )
    elif body.report_type == "individual_trend":
        if not body.assessment_id or not body.user_id:
            raise ValidationError("assessmentId and userId are required for individual_trend")
        report = await _generate_trend_report(
            db=db,
            org_uuid=org_uuid,
            assessment_id=body.assessment_id,
            user_id=body.user_id,
            generated_by=user_uuid,
        )
    elif body.report_type == "group_longitudinal":
        if not body.instance_id or not body.instance_type:
            raise ValidationError("instanceId and instanceType are required for group_longitudinal")
        report = await _generate_group_longitudinal_report(
            db=db,
            org_uuid=org_uuid,
            instance_id=body.instance_id,
            instance_type=body.instance_type,
            generated_by=user_uuid,
        )
    else:
        raise ValidationError(f"Unsupported reportType: {body.report_type}")

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="create",
        resource="assessment_reports",
        resource_id=str(report.id),
        ip_address=request.client.host if request.client else None,
    )
    return _orm_to_row(report)


@router.patch("/{report_id}/narrative", response_model=ReportRow)
async def update_report_narrative(
    org_id: str,
    report_id: str,
    body: ReportNarrativeUpdateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReportRow:
    """更新 narrative (admin/counselor). 镜像 service:29-38."""
    _require_admin_or_counselor(org)

    rid = parse_uuid_or_raise(report_id, field="reportId")
    q = select(AssessmentReport).where(AssessmentReport.id == rid).limit(1)
    r = (await db.execute(q)).scalar_one_or_none()
    if r is None:
        raise NotFoundError("AssessmentReport", report_id)

    r.ai_narrative = body.narrative
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="assessment_reports",
        resource_id=report_id,
        ip_address=request.client.host if request.client else None,
    )
    return _orm_to_row(r)


@router.get("/{report_id}/pdf")
async def get_report_pdf(
    org_id: str,
    report_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """单 report PDF. Phase 3 stub. 镜像 routes.ts:113-119."""
    _reject_client(org)
    pdf_bytes = await generate_report_pdf(db, report_id)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": (f'attachment; filename="report_{report_id[:8]}.pdf"')},
    )


@router.post("/batch-pdf")
async def post_batch_pdf(
    org_id: str,
    body: BatchPDFRequest,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """批量 PDF ZIP. Phase 3 stub. 镜像 routes.ts:122-134."""
    _require_admin_or_counselor(org)
    zip_bytes = await generate_batch_pdf_zip(db, body.report_ids)
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="reports.zip"'},
    )


# ─── 4 种 reportType 生成函数 (内联 service) ──────────────────────


async def _generate_individual_single_report(
    *,
    db: AsyncSession,
    org_uuid: uuid.UUID,
    result_id: str,
    generated_by: uuid.UUID,
) -> AssessmentReport:
    """``individual_single`` — 单人单次报告. 镜像 service:41-105."""
    rid = parse_uuid_or_raise(result_id, field="resultId")
    r_q = select(AssessmentResult).where(AssessmentResult.id == rid).limit(1)
    result = (await db.execute(r_q)).scalar_one_or_none()
    if result is None:
        raise NotFoundError("AssessmentResult", result_id)

    dim_scores: dict[str, float] = {k: float(v) for k, v in (result.dimension_scores or {}).items()}
    dim_ids = [_try_parse_uuid(k) for k in dim_scores]
    dim_uuids = [d for d in dim_ids if d is not None]

    dims: list[ScaleDimension] = []
    rules: list[DimensionRule] = []
    if dim_uuids:
        d_q = select(ScaleDimension).where(or_(*[ScaleDimension.id == d for d in dim_uuids]))
        dims = list((await db.execute(d_q)).scalars().all())

        r_q2 = select(DimensionRule).where(
            or_(*[DimensionRule.dimension_id == d for d in dim_uuids])
        )
        rules = list((await db.execute(r_q2)).scalars().all())

    interpretations: list[dict[str, Any]] = []
    for d in dims:
        score = dim_scores.get(str(d.id), 0.0)
        d_rules = [rr for rr in rules if rr.dimension_id == d.id]
        matched = next(
            (rr for rr in d_rules if float(rr.min_score) <= score <= float(rr.max_score)),
            None,
        )
        interpretations.append(
            {
                "dimension": d.name,
                "dimensionId": str(d.id),
                "score": score,
                "label": matched.label if matched else "",
                "riskLevel": matched.risk_level if matched else None,
                "advice": matched.advice if matched else None,
            }
        )

    content = {
        "userId": str(result.user_id) if result.user_id else None,
        "demographics": dict(result.demographic_data or {}),
        "dimensionScores": dim_scores,
        "totalScore": str(result.total_score) if result.total_score is not None else None,
        "riskLevel": result.risk_level,
        "interpretationPerDimension": interpretations,
    }

    report = AssessmentReport(
        org_id=org_uuid,
        title="个人测评报告",
        report_type="individual_single",
        result_ids=[result_id],
        assessment_id=result.assessment_id,
        content=content,
        generated_by=generated_by,
    )
    db.add(report)
    await db.commit()
    return report


async def _generate_group_single_report(
    *,
    db: AsyncSession,
    org_uuid: uuid.UUID,
    result_ids: list[str],
    title: str,
    generated_by: uuid.UUID,
) -> AssessmentReport:
    """``group_single`` — 团体单次报告 (多 results 聚合). 镜像 service:107-189."""
    rid_uuids = [parse_uuid_or_raise(r, field="resultId") for r in result_ids]
    r_q = select(AssessmentResult).where(or_(*[AssessmentResult.id == r for r in rid_uuids]))
    results = list((await db.execute(r_q)).scalars().all())
    if not results:
        raise NotFoundError("AssessmentResults", "batch")

    risk_distribution: dict[str, int] = {}
    for r in results:
        level = r.risk_level or "unknown"
        risk_distribution[level] = risk_distribution.get(level, 0) + 1

    all_dim_scores: dict[str, list[float]] = {}
    for r in results:
        for dim_id, score in (r.dimension_scores or {}).items():
            all_dim_scores.setdefault(dim_id, []).append(float(score))

    dim_ids = list(all_dim_scores.keys())
    dim_name_map: dict[str, str] = {}
    if dim_ids:
        dim_uuids = [d for d in (_try_parse_uuid(x) for x in dim_ids) if d is not None]
        if dim_uuids:
            d_q = select(ScaleDimension.id, ScaleDimension.name).where(
                or_(*[ScaleDimension.id == d for d in dim_uuids])
            )
            for did, dname in (await db.execute(d_q)).all():
                dim_name_map[str(did)] = dname

    dimension_stats: dict[str, dict[str, float]] = {}
    for dim_id, scores in all_dim_scores.items():
        sorted_scores = sorted(scores)
        n = len(sorted_scores)
        mean = sum(scores) / n
        if n % 2 == 0:
            median = (sorted_scores[n // 2 - 1] + sorted_scores[n // 2]) / 2
        else:
            median = sorted_scores[n // 2]
        variance = sum((v - mean) ** 2 for v in scores) / n
        dim_name = dim_name_map.get(dim_id, dim_id)
        dimension_stats[dim_name] = {
            "mean": _round2(mean),
            "median": _round2(median),
            "stdDev": _round2(math.sqrt(variance)),
            "min": sorted_scores[0],
            "max": sorted_scores[-1],
        }

    content = {
        "participantCount": len(results),
        "riskDistribution": risk_distribution,
        "dimensionStats": dimension_stats,
    }

    assessment_id = results[0].assessment_id

    report = AssessmentReport(
        org_id=org_uuid,
        title=title,
        report_type="group_single",
        result_ids=result_ids,
        assessment_id=assessment_id,
        content=content,
        generated_by=generated_by,
    )
    db.add(report)
    await db.commit()
    return report


async def _generate_trend_report(
    *,
    db: AsyncSession,
    org_uuid: uuid.UUID,
    assessment_id: str,
    user_id: str,
    generated_by: uuid.UUID,
) -> AssessmentReport:
    """``individual_trend`` — 单人纵向 (>=2 次). 镜像 service:191-271."""
    aid = parse_uuid_or_raise(assessment_id, field="assessmentId")
    uid = parse_uuid_or_raise(user_id, field="userId")

    q = (
        select(AssessmentResult)
        .where(
            and_(
                AssessmentResult.assessment_id == aid,
                AssessmentResult.user_id == uid,
            )
        )
        .order_by(desc(AssessmentResult.created_at))
    )
    user_results = list((await db.execute(q)).scalars().all())
    if len(user_results) < 2:
        raise ValidationError("At least 2 results are required for a trend report")

    all_dim_ids: set[str] = set()
    for r in user_results:
        for k in r.dimension_scores or {}:
            all_dim_ids.add(k)

    dim_name_map: dict[str, str] = {}
    if all_dim_ids:
        dim_uuids = [d for d in (_try_parse_uuid(x) for x in all_dim_ids) if d is not None]
        if dim_uuids:
            d_q = select(ScaleDimension.id, ScaleDimension.name).where(
                or_(*[ScaleDimension.id == d for d in dim_uuids])
            )
            for did, dname in (await db.execute(d_q)).all():
                dim_name_map[str(did)] = dname

    timeline = []
    for idx, r in enumerate(user_results):
        scores = r.dimension_scores or {}
        timeline.append(
            {
                "index": len(user_results) - idx,
                "date": r.created_at.isoformat() if r.created_at else None,
                "totalScore": str(r.total_score) if r.total_score is not None else None,
                "riskLevel": r.risk_level,
                "dimensionScores": {
                    dim_name_map.get(did, did): score for did, score in scores.items()
                },
            }
        )
    timeline.reverse()  # 从远到近

    trends: dict[str, str] = {}
    if len(timeline) >= 2:
        first_raw = timeline[0]["dimensionScores"]
        last_raw = timeline[-1]["dimensionScores"]
        first_map: dict[str, Any] = first_raw if isinstance(first_raw, dict) else {}
        last_map: dict[str, Any] = last_raw if isinstance(last_raw, dict) else {}
        for key in last_map:
            diff = float(last_map.get(key, 0)) - float(first_map.get(key, 0))
            if abs(diff) < 1:
                trends[key] = "stable"
            elif diff < 0:
                trends[key] = "improving"
            else:
                trends[key] = "worsening"

    content = {
        "userId": user_id,
        "assessmentCount": len(user_results),
        "timeline": timeline,
        "trends": trends,
    }

    report = AssessmentReport(
        org_id=org_uuid,
        title="追踪评估趋势报告",
        report_type="individual_trend",
        result_ids=[str(r.id) for r in user_results],
        assessment_id=aid,
        content=content,
        generated_by=generated_by,
    )
    db.add(report)
    await db.commit()
    return report


async def _generate_group_longitudinal_report(
    *,
    db: AsyncSession,
    org_uuid: uuid.UUID,
    instance_id: str,
    instance_type: str,
    generated_by: uuid.UUID,
) -> AssessmentReport:
    """``group_longitudinal`` — group/course PRE/POST 对比 + Cohen's d. 镜像 service:278-422."""
    iid = parse_uuid_or_raise(instance_id, field="instanceId")

    member_user_ids: list[uuid.UUID] = []
    instance_title: str = ""
    assessment_config: dict[str, Any] = {}

    if instance_type == "group":
        gi_q = select(GroupInstance).where(GroupInstance.id == iid).limit(1)
        gi = (await db.execute(gi_q)).scalar_one_or_none()
        if gi is None:
            raise NotFoundError("GroupInstance", instance_id)
        instance_title = getattr(gi, "title", "") or ""
        assessment_config = dict(getattr(gi, "assessment_config", None) or {})
        e_q = select(GroupEnrollment.user_id).where(
            and_(
                GroupEnrollment.instance_id == iid,
                GroupEnrollment.status == "approved",
            )
        )
        member_user_ids = [uid for (uid,) in (await db.execute(e_q)).all()]
    else:
        ci_q = select(CourseInstance).where(CourseInstance.id == iid).limit(1)
        ci = (await db.execute(ci_q)).scalar_one_or_none()
        if ci is None:
            raise NotFoundError("CourseInstance", instance_id)
        instance_title = getattr(ci, "title", "") or ""
        assessment_config = dict(getattr(ci, "assessment_config", None) or {})
        e_q2 = select(CourseEnrollment.user_id).where(CourseEnrollment.instance_id == iid)
        member_user_ids = [uid for (uid,) in (await db.execute(e_q2)).all()]

    if not member_user_ids:
        raise ValidationError("No enrolled members found")

    pre_group_ids: list[str] = list(assessment_config.get("preGroup") or [])
    post_group_ids: list[str] = list(assessment_config.get("postGroup") or [])

    # 合并 + 去重 + UUID 校验
    all_assessment_ids: list[uuid.UUID] = []
    seen: set[str] = set()
    for raw in pre_group_ids + post_group_ids:
        if raw in seen:
            continue
        seen.add(raw)
        try:
            all_assessment_ids.append(uuid.UUID(raw))
        except (ValueError, TypeError):
            continue

    if not all_assessment_ids:
        raise ValidationError("No valid assessment IDs in assessmentConfig")

    # 取所有 results
    all_q = (
        select(AssessmentResult)
        .where(
            and_(
                AssessmentResult.user_id.in_(member_user_ids),
                AssessmentResult.assessment_id.in_(all_assessment_ids),
            )
        )
        .order_by(asc(AssessmentResult.created_at))
    )
    all_results = list((await db.execute(all_q)).scalars().all())

    # Group by assessmentId → userId → time-ordered list
    result_map: dict[uuid.UUID, dict[uuid.UUID, list[Any]]] = {}
    for r in all_results:
        if r.user_id is None:
            continue
        result_map.setdefault(r.assessment_id, {}).setdefault(r.user_id, []).append(r)

    assessment_comparisons: list[dict[str, Any]] = []
    for aid in all_assessment_ids:
        user_map = result_map.get(aid)
        if not user_map:
            continue

        member_details: list[dict[str, Any]] = []
        pre_scores: list[float] = []
        post_scores: list[float] = []
        changes: list[float] = []

        for u in member_user_ids:
            results = user_map.get(u, [])
            pre_score = (
                float(results[0].total_score)
                if results and results[0].total_score is not None
                else None
            )
            post_score = (
                float(results[-1].total_score)
                if len(results) > 1 and results[-1].total_score is not None
                else None
            )
            change = (
                (post_score - pre_score)
                if (pre_score is not None and post_score is not None)
                else None
            )
            member_details.append(
                {
                    "userId": str(u),
                    "preScore": pre_score,
                    "postScore": post_score,
                    "change": change,
                }
            )
            if pre_score is not None:
                pre_scores.append(pre_score)
            if post_score is not None:
                post_scores.append(post_score)
            if change is not None:
                changes.append(change)

        pre_mean = sum(pre_scores) / len(pre_scores) if pre_scores else 0.0
        post_mean = sum(post_scores) / len(post_scores) if post_scores else 0.0
        mean_change = post_mean - pre_mean

        cohens_d: float | None = None
        if len(pre_scores) >= 2 and len(post_scores) >= 2:
            pre_var = sum((v - pre_mean) ** 2 for v in pre_scores) / (len(pre_scores) - 1)
            post_var = sum((v - post_mean) ** 2 for v in post_scores) / (len(post_scores) - 1)
            pooled_sd = math.sqrt((pre_var + post_var) / 2)
            if pooled_sd > 0:
                cohens_d = _round2(mean_change / pooled_sd)

        assessment_comparisons.append(
            {
                "assessmentId": str(aid),
                "participantCount": len(member_user_ids),
                "prePostPairs": len(changes),
                "preMean": _round2(pre_mean),
                "postMean": _round2(post_mean),
                "meanChange": _round2(mean_change),
                "cohensD": cohens_d,
                "memberDetails": member_details,
            }
        )

    # member names
    name_map: dict[str, str] = {}
    if member_user_ids:
        u_q = select(User.id, User.name).where(User.id.in_(member_user_ids))
        for uid, uname in (await db.execute(u_q)).all():
            name_map[str(uid)] = uname

    from datetime import UTC
    from datetime import datetime as _dt

    content = {
        "instanceTitle": instance_title,
        "memberCount": len(member_user_ids),
        "memberNames": name_map,
        "assessmentComparisons": assessment_comparisons,
        "generatedAt": _dt.now(UTC).isoformat(),
    }

    report = AssessmentReport(
        org_id=org_uuid,
        title=f"{instance_title} — 纵向对比报告",
        report_type="group_longitudinal",
        result_ids=[str(r.id) for r in all_results],
        assessment_id=all_assessment_ids[0] if all_assessment_ids else None,
        content=content,
        generated_by=generated_by,
    )
    db.add(report)
    await db.commit()
    return report


def _try_parse_uuid(value: Any) -> UUID | None:
    """str → UUID; 失败返 None (用于 Drizzle JSONB key 是否合法 UUID 的容错)."""
    if not isinstance(value, str) or len(value) != _UUID_REGEX_LEN:
        return None
    try:
        return UUID(value)
    except (ValueError, TypeError):
        return None


__all__ = ["router"]
