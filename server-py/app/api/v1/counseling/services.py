"""
Internal counseling services (no router) — 镜像:
  - ``server/src/modules/counseling/client-summary.service.ts`` (88 行)
  - ``server/src/modules/counseling/progress-report.service.ts`` (87 行)

这两个 service 在 Node 端是 internal — 被 ai/pipelines 模块 import, 没有自己
的 routes。Phase 5 AI pipelines port 时会用到, 此处先把签名 + 数据装配 port
完整, 让 AI pipeline 可以 stub 调用。

为什么单独 services.py 而不拆两个文件:
  - 各自不到 100 行, 两个独立文件 import 麻烦; 集中一处与 Node 设计意图一致
  - 都是数据装配 (从 5+ 表 SELECT 拼成 ClientSummaryInput/CaseProgressInput dict)
  - 真实 AI 调用走 BYOK 在 ai 模块里, 此 service 只负责数据准备
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import and_, asc, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.assessment_results import AssessmentResult
from app.db.models.care_episodes import CareEpisode
from app.db.models.care_timeline import CareTimeline
from app.db.models.client_profiles import ClientProfile
from app.db.models.session_notes import SessionNote
from app.db.models.treatment_plans import TreatmentPlan
from app.db.models.users import User


def _calc_age(dob: Any | None) -> int | None:
    """从 date_of_birth 算 age (年, 整数)。无 DOB → None。"""
    if dob is None:
        return None
    if isinstance(dob, str):
        try:
            dob_dt = datetime.fromisoformat(dob)
        except ValueError:
            return None
    else:
        # date / datetime → datetime
        dob_dt = datetime.combine(dob, datetime.min.time()).replace(tzinfo=UTC)
    now = datetime.now(tz=UTC)
    return int((now - dob_dt).days / 365.25)


# ─── Client summary (build_client_summary_input) ──────────────────


async def build_client_summary_input(
    db: AsyncSession,
    org_id: str,
    client_id: str,
    episode_id: str,
) -> dict[str, Any]:
    """构造 GenerateClientSummary 的 input dict (镜像 client-summary.service.ts:9-87).

    Phase 5: AI pipelines port 时直接拿这个 dict 调 generate_client_summary。
    现阶段返回 dict 给上层处理 (Phase 5 AI 模块 stub call)。

    数据源:
      - users.name
      - care_episodes (chief_complaint / current_risk)
      - client_profiles
      - session_notes 最近 5 条
      - assessment_results 最近 5 条
      - treatment_plans (active 状态那条)
    """
    org_uuid = uuid.UUID(org_id)
    client_uuid = uuid.UUID(client_id)
    episode_uuid = uuid.UUID(episode_id)

    # client name
    uq = select(User.name).where(User.id == client_uuid).limit(1)
    user_name = (await db.execute(uq)).scalar()

    # episode
    eq = select(CareEpisode).where(CareEpisode.id == episode_uuid).limit(1)
    episode = (await db.execute(eq)).scalar_one_or_none()

    # profile
    pq = (
        select(ClientProfile)
        .where(
            and_(
                ClientProfile.org_id == org_uuid,
                ClientProfile.user_id == client_uuid,
            )
        )
        .limit(1)
    )
    profile = (await db.execute(pq)).scalar_one_or_none()

    # recent 5 notes
    nq = (
        select(SessionNote.session_date, SessionNote.summary, SessionNote.tags)
        .where(
            and_(
                SessionNote.org_id == org_uuid,
                SessionNote.client_id == client_uuid,
            )
        )
        .order_by(desc(SessionNote.session_date))
        .limit(5)
    )
    notes = list((await db.execute(nq)).all())

    # recent 5 assessment results
    rq = (
        select(
            AssessmentResult.created_at,
            AssessmentResult.total_score,
            AssessmentResult.risk_level,
            AssessmentResult.dimension_scores,
        )
        .where(AssessmentResult.user_id == client_uuid)
        .order_by(desc(AssessmentResult.created_at))
        .limit(5)
    )
    results = list((await db.execute(rq)).all())

    # active treatment plan
    tpq = (
        select(TreatmentPlan)
        .where(
            and_(
                TreatmentPlan.care_episode_id == episode_uuid,
                TreatmentPlan.status == "active",
            )
        )
        .limit(1)
    )
    plan = (await db.execute(tpq)).scalar_one_or_none()

    age = _calc_age(profile.date_of_birth) if profile else None

    profile_dict: dict[str, Any] | None = None
    if profile is not None:
        profile_dict = {
            "gender": profile.gender,
            "age": age,
            "occupation": profile.occupation,
            "presentingIssues": list(profile.presenting_issues)
            if profile.presenting_issues
            else None,
            "medicalHistory": profile.medical_history,
            "familyBackground": profile.family_background,
        }

    plan_dict: dict[str, Any] | None = None
    if plan is not None:
        plan_dict = {
            "title": plan.title,
            "approach": plan.approach,
            "goals": [
                {"description": g.get("description"), "status": g.get("status")}
                for g in (plan.goals or [])
            ],
        }

    return {
        "clientName": user_name,
        "chiefComplaint": episode.chief_complaint if episode else None,
        "currentRisk": episode.current_risk if episode else "level_1",
        "profile": profile_dict,
        "sessionSummaries": [
            {
                "date": str(n[0]),
                "summary": n[1],
                "tags": list(n[2]) if n[2] else None,
            }
            for n in notes
            if n[1]
        ],
        "assessmentResults": [
            {
                "date": r[0].date().isoformat() if r[0] else None,
                "totalScore": float(r[1]) if r[1] is not None else 0.0,
                "riskLevel": r[2] or "level_1",
                "dimensions": r[3],
            }
            for r in results
        ],
        "treatmentPlan": plan_dict,
    }


# ─── Progress report (build_case_progress_input) ──────────────────


async def build_case_progress_input(
    db: AsyncSession,
    org_id: str,
    episode_id: str,
) -> dict[str, Any]:
    """构造 CaseProgressReport input dict (镜像 progress-report.service.ts:9-86).

    数据源 (与 client_summary 类似但全量按时间正序):
      - episode + user.name
      - 全部 session_notes (按 session_date 正序)
      - 全部 assessment_results (按 created_at 正序)
      - care_timeline.event_type='risk_change' 中的 risk_before/after diff
      - active treatment_plan goals
    """
    org_uuid = uuid.UUID(org_id)
    episode_uuid = uuid.UUID(episode_id)

    eq = select(CareEpisode).where(CareEpisode.id == episode_uuid).limit(1)
    episode = (await db.execute(eq)).scalar_one_or_none()
    if episode is None:
        raise ValueError(f"Episode not found: {episode_id}")

    uq = select(User.name).where(User.id == episode.client_id).limit(1)
    user_name = (await db.execute(uq)).scalar()

    # session notes (全部, 按 session_date 正序)
    nq = (
        select(
            SessionNote.session_date,
            SessionNote.summary,
            SessionNote.subjective,
            SessionNote.assessment,
            SessionNote.plan,
            SessionNote.tags,
        )
        .where(
            and_(
                SessionNote.org_id == org_uuid,
                SessionNote.care_episode_id == episode_uuid,
            )
        )
        .order_by(asc(SessionNote.session_date))
    )
    notes = list((await db.execute(nq)).all())

    # assessment results (全部)
    rq = (
        select(
            AssessmentResult.created_at,
            AssessmentResult.total_score,
            AssessmentResult.risk_level,
        )
        .where(AssessmentResult.user_id == episode.client_id)
        .order_by(asc(AssessmentResult.created_at))
    )
    results = list((await db.execute(rq)).all())

    # risk change events from timeline
    tlq = (
        select(CareTimeline.created_at, CareTimeline.metadata_)
        .where(
            and_(
                CareTimeline.care_episode_id == episode_uuid,
                CareTimeline.event_type == "risk_change",
            )
        )
        .order_by(asc(CareTimeline.created_at))
    )
    risk_events = list((await db.execute(tlq)).all())

    # active treatment plan
    tpq = (
        select(TreatmentPlan)
        .where(
            and_(
                TreatmentPlan.care_episode_id == episode_uuid,
                TreatmentPlan.status == "active",
            )
        )
        .limit(1)
    )
    plan = (await db.execute(tpq)).scalar_one_or_none()

    risk_changes: list[dict[str, Any]] = []
    for re in risk_events:
        meta: dict[str, Any] = re[1] or {}
        risk_changes.append(
            {
                "date": re[0].date().isoformat() if re[0] else None,
                "from": meta.get("riskBefore") or meta.get("from") or "",
                "to": meta.get("riskAfter") or meta.get("to") or "",
            }
        )

    return {
        "clientName": user_name,
        "chiefComplaint": episode.chief_complaint,
        "currentRisk": episode.current_risk,
        "sessionNotes": [
            {
                "date": str(n[0]),
                "summary": n[1],
                "subjective": n[2],
                "assessment": n[3],
                "plan": n[4],
                "tags": list(n[5]) if n[5] else None,
            }
            for n in notes
        ],
        "assessmentResults": [
            {
                "date": r[0].date().isoformat() if r[0] else None,
                "totalScore": float(r[1]) if r[1] is not None else 0.0,
                "riskLevel": r[2] or "level_1",
            }
            for r in results
        ],
        "riskChanges": risk_changes,
        "treatmentGoals": [
            {"description": g.get("description"), "status": g.get("status")}
            for g in (plan.goals if plan else [])
        ],
    }


__all__ = ["build_case_progress_input", "build_client_summary_input"]
