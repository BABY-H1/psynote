"""
Compliance review router — 镜像 ``server/src/modules/compliance/compliance-review.routes.ts``
(50 行) + ``compliance-review.service.ts`` (119 行).

挂在 ``/api/orgs/{org_id}/compliance``:

  POST /review-note/{noteId}            note 合规度复核
  POST /review-golden-thread/{episodeId} 临床推理一致性 (主诉→评估→计划)
  POST /review-quality/{noteId}         治疗质量评估
  GET  /reviews                         列表 (filter careEpisodeId/noteId/reviewType/counselorId)

业务逻辑:
  - 三类 review 都跑 AI 管道 (Python 端 ``ai.pipelines.compliance_review`` 当前是 stub)
    然后把结果写进 ``compliance_reviews`` 表
  - Node 端 review_type 为: note_compliance / golden_thread / treatment_quality
  - reviewed_by 默认 'ai' (server_default), 我们写入时不显式指定

Phase 1 阶段 AI 管道是 stub, 因此本路由的 ``score`` / ``findings`` 也是 stub
(score=None, findings=[])。Phase 2+ AI 管道接通后, 这里能直接用真实结果。
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.compliance.schemas import ComplianceReviewOutput
from app.core.database import get_db
from app.db.models.compliance_reviews import ComplianceReview
from app.db.models.session_notes import SessionNote
from app.db.models.treatment_plans import TreatmentPlan
from app.lib.errors import ForbiddenError, NotFoundError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


def _require_org(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    return org


def _require_admin_or_counselor(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.role not in ("org_admin", "counselor"):
        raise ForbiddenError("insufficient_role")
    return org


def _review_to_output(r: ComplianceReview) -> ComplianceReviewOutput:
    return ComplianceReviewOutput(
        id=str(r.id),
        org_id=str(r.org_id),
        care_episode_id=str(r.care_episode_id),
        note_id=str(r.note_id) if r.note_id else None,
        counselor_id=str(r.counselor_id) if r.counselor_id else None,
        review_type=r.review_type,
        score=r.score,
        findings=list(r.findings or []),
        golden_thread_score=r.golden_thread_score,
        quality_indicators=r.quality_indicators,
        reviewed_at=r.reviewed_at,
        reviewed_by=r.reviewed_by or "ai",
    )


# ─── POST /review-note/{note_id} ────────────────────────────────


@router.post(
    "/review-note/{note_id}",
    response_model=ComplianceReviewOutput,
    status_code=status.HTTP_201_CREATED,
)
async def review_note_route(
    org_id: str,
    note_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ComplianceReviewOutput:
    """``POST /review-note/{note_id}`` (镜像 routes.ts:14-21 + service.ts:12-39).

    流程:
      1. 加载 note (note 不存在 → 404)
      2. (AI 管道 stub) 跑 reviewNoteCompliance — 这里 stub 出 score=None / findings=[]
      3. INSERT compliance_reviews row
    """
    _require_admin_or_counselor(org)
    nid = parse_uuid_or_raise(note_id, field="noteId")

    nq = select(SessionNote).where(SessionNote.id == nid).limit(1)
    note = (await db.execute(nq)).scalar_one_or_none()
    if note is None:
        raise NotFoundError("Note", note_id)
    if note.care_episode_id is None:
        # care_episode_id! 在 Node 端 service.ts:30, 缺失时直接落到 NOT NULL 字段错误
        # Python 端提前抛 404 更清晰
        raise NotFoundError("CareEpisode", note_id)

    # AI pipeline stub — Phase 2 接通后用真实 score / findings
    score: int | None = None
    findings: list[Any] = []

    review = ComplianceReview(
        org_id=note.org_id,
        care_episode_id=note.care_episode_id,
        note_id=note.id,
        counselor_id=note.counselor_id,
        review_type="note_compliance",
        score=score,
        findings=findings,
    )
    db.add(review)
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="create",
        resource="compliance_reviews",
        resource_id=str(review.id),
        ip_address=request.client.host if request.client else None,
    )
    return _review_to_output(review)


# ─── POST /review-golden-thread/{episode_id} ────────────────────


@router.post(
    "/review-golden-thread/{episode_id}",
    response_model=ComplianceReviewOutput,
    status_code=status.HTTP_201_CREATED,
)
async def review_golden_thread_route(
    org_id: str,
    episode_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ComplianceReviewOutput:
    """``POST /review-golden-thread/{episode_id}`` (镜像 routes.ts:23-31 + service.ts:41-77).

    校验:
      - episode 下必须有 active 治疗计划
    """
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    ep_uuid = parse_uuid_or_raise(episode_id, field="episodeId")

    pq = (
        select(TreatmentPlan)
        .where(
            and_(
                TreatmentPlan.care_episode_id == ep_uuid,
                TreatmentPlan.status == "active",
            )
        )
        .limit(1)
    )
    plan = (await db.execute(pq)).scalar_one_or_none()
    if plan is None:
        raise NotFoundError("TreatmentPlan", episode_id)

    # AI pipeline stub
    golden_thread_score: int | None = None
    findings: list[Any] = []

    review = ComplianceReview(
        org_id=org_uuid,
        care_episode_id=ep_uuid,
        counselor_id=plan.counselor_id,
        review_type="golden_thread",
        golden_thread_score=golden_thread_score,
        findings=findings,
    )
    db.add(review)
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="create",
        resource="compliance_reviews",
        resource_id=str(review.id),
        ip_address=request.client.host if request.client else None,
    )
    return _review_to_output(review)


# ─── POST /review-quality/{note_id} ─────────────────────────────


@router.post(
    "/review-quality/{note_id}",
    response_model=ComplianceReviewOutput,
    status_code=status.HTTP_201_CREATED,
)
async def review_quality_route(
    org_id: str,
    note_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ComplianceReviewOutput:
    """``POST /review-quality/{note_id}`` (镜像 routes.ts:33-41 + service.ts:79-104)."""
    _require_admin_or_counselor(org)
    nid = parse_uuid_or_raise(note_id, field="noteId")

    nq = select(SessionNote).where(SessionNote.id == nid).limit(1)
    note = (await db.execute(nq)).scalar_one_or_none()
    if note is None:
        raise NotFoundError("Note", note_id)
    if note.care_episode_id is None:
        raise NotFoundError("CareEpisode", note_id)

    # AI pipeline stub
    score: int | None = None
    quality_indicators: dict[str, Any] = {}
    findings: list[Any] = []

    review = ComplianceReview(
        org_id=note.org_id,
        care_episode_id=note.care_episode_id,
        note_id=note.id,
        counselor_id=note.counselor_id,
        review_type="treatment_quality",
        score=score,
        quality_indicators=quality_indicators,
        findings=findings,
    )
    db.add(review)
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="create",
        resource="compliance_reviews",
        resource_id=str(review.id),
        ip_address=request.client.host if request.client else None,
    )
    return _review_to_output(review)


# ─── GET /reviews ──────────────────────────────────────────────


@router.get("/reviews", response_model=list[ComplianceReviewOutput])
async def list_reviews_route(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    care_episode_id: Annotated[str | None, Query(alias="careEpisodeId")] = None,
    note_id: Annotated[str | None, Query(alias="noteId")] = None,
    review_type: Annotated[str | None, Query(alias="reviewType")] = None,
    counselor_id: Annotated[str | None, Query(alias="counselorId")] = None,
) -> list[ComplianceReviewOutput]:
    """``GET /reviews`` 列表 + filters (镜像 routes.ts:43-49 + service.ts:106-119)."""
    _require_org(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")

    conds: list[Any] = [ComplianceReview.org_id == org_uuid]
    if care_episode_id:
        conds.append(
            ComplianceReview.care_episode_id
            == parse_uuid_or_raise(care_episode_id, field="careEpisodeId")
        )
    if note_id:
        conds.append(ComplianceReview.note_id == parse_uuid_or_raise(note_id, field="noteId"))
    if review_type:
        conds.append(ComplianceReview.review_type == review_type)
    if counselor_id:
        conds.append(
            ComplianceReview.counselor_id == parse_uuid_or_raise(counselor_id, field="counselorId")
        )

    q = select(ComplianceReview).where(and_(*conds)).order_by(desc(ComplianceReview.reviewed_at))
    rows = list((await db.execute(q)).scalars().all())
    return [_review_to_output(r) for r in rows]


__all__ = ["router"]
