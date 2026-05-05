"""
Crisis case 状态机 — 镜像 ``server/src/modules/crisis/crisis-case.workflow.ts`` (311 行).

状态机:

  candidate accept → ``create_from_candidate()``
    创建 care_episode + crisis_case + timeline 事件 (原子)

  counselor 勾选步骤 → ``update_checklist_step()``
    merge step 到 ``checklist`` JSONB + 写 timeline breadcrumb

  counselor 提交结案 → ``submit_for_sign_off()``
    stage='pending_sign_off', 通知所有督导

  督导确认 → ``sign_off(approve=True)``
    stage='closed', 同时关闭关联 care_episode

  督导退回 → ``sign_off(approve=False)``
    stage='reopened', counselor 可重新提交

设计原则 (与 Node 一致):
  - 没有外部通信 — 每个"contact"步骤纯记账, 实际沟通由咨询师线下完成
  - 只读 lookups 在 ``queries_service.py``
  - 分析在 ``dashboard_service.py``
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.crisis.helpers import (
    CRISIS_REQUIRED_STEPS,
    CRISIS_STEP_LABELS,
    build_step_timeline_summary,
    build_step_timeline_title,
    crisis_case_to_output,
    notify_supervisors,
)
from app.api.v1.crisis.queries_service import get_case_by_id, get_case_by_id_row
from app.api.v1.crisis.schemas import CrisisCaseOutput
from app.db.models.candidate_pool import CandidatePool
from app.db.models.care_episodes import CareEpisode
from app.db.models.care_timeline import CareTimeline
from app.db.models.crisis_cases import CrisisCase
from app.db.models.notifications import Notification
from app.lib.errors import NotFoundError, ValidationError


async def create_from_candidate(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    candidate_id: uuid.UUID,
    acceptor_user_id: uuid.UUID,
) -> dict[str, str]:
    """从已接收的 candidate 原子创建 care_episode + crisis_case + timeline.

    镜像 workflow.ts:55-110。从 workflow.routes.ts 调入口,候选被
    accept 时同步创建实体。

    Args:
        db: AsyncSession
        org_id: 当前机构 (从 OrgContext 来)
        candidate_id: 候选 id
        acceptor_user_id: 接手 counselor 的 user.id

    Returns:
        ``{"episodeId": ..., "crisisCaseId": ...}``

    Raises:
        NotFoundError: candidate 不存在
        ValidationError: candidate kind != 'crisis_candidate' 或 status != 'pending'
    """
    cq = (
        select(CandidatePool)
        .where(and_(CandidatePool.id == candidate_id, CandidatePool.org_id == org_id))
        .limit(1)
    )
    cand = (await db.execute(cq)).scalar_one_or_none()
    if cand is None:
        raise NotFoundError("Candidate", str(candidate_id))
    if cand.kind != "crisis_candidate":
        raise ValidationError("仅 crisis_candidate 可以创建危机案件")
    if cand.status != "pending":
        raise ValidationError(f"候选已被处理(status={cand.status})")

    episode = CareEpisode(
        org_id=org_id,
        client_id=cand.client_user_id,
        counselor_id=acceptor_user_id,
        chief_complaint=cand.suggestion,
        current_risk="level_4",
        intervention_type="crisis",
        status="active",
    )
    db.add(episode)
    await db.flush()  # 取 episode.id

    crisis = CrisisCase(
        org_id=org_id,
        episode_id=episode.id,
        candidate_id=cand.id,
        stage="open",
        checklist={},
        created_by=acceptor_user_id,
    )
    db.add(crisis)
    await db.flush()

    metadata: dict[str, Any] = {
        "candidateId": str(cand.id),
        "sourceRuleId": str(cand.source_rule_id) if cand.source_rule_id else None,
        "priority": cand.priority,
    }
    timeline = CareTimeline(
        care_episode_id=episode.id,
        event_type="crisis_opened",
        ref_id=crisis.id,
        title="危机处置案件已开启",
        summary=cand.reason or "由规则引擎识别为危机候选,咨询师接手处置",
        metadata_=metadata,
        created_by=acceptor_user_id,
    )
    db.add(timeline)
    await db.commit()

    return {"episodeId": str(episode.id), "crisisCaseId": str(crisis.id)}


async def update_checklist_step(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    case_id: uuid.UUID,
    step_key: str,
    payload: dict[str, Any],
    user_id: uuid.UUID,
) -> CrisisCaseOutput:
    """合并单步状态到 checklist + 写 timeline breadcrumb.

    镜像 workflow.ts:113-151。

    业务逻辑:
      - 已结案案件不能再改 (stage='closed' → 400)
      - completedAt: payload 显式传 → 用; 没传但 done=True → 当下时间; 否则 None
      - merge: 同 stepKey 旧 step 与新 payload 浅合并 (新覆盖旧)
    """
    existing_row = await get_case_by_id_row(db, org_id, case_id)
    if existing_row.stage == "closed":
        raise ValidationError("案件已结案,无法再修改清单")

    merged: dict[str, Any] = dict(existing_row.checklist or {})
    prev_step = merged.get(step_key, {}) if isinstance(merged.get(step_key), dict) else {}

    next_step: dict[str, Any] = {**prev_step, **payload}
    if payload.get("completedAt") is not None:
        next_step["completedAt"] = payload["completedAt"]
    elif payload.get("done"):
        next_step["completedAt"] = datetime.now(UTC).isoformat()
    else:
        next_step["completedAt"] = None
    merged[step_key] = next_step

    existing_row.checklist = merged
    existing_row.updated_at = datetime.now(UTC)

    timeline = CareTimeline(
        care_episode_id=existing_row.episode_id,
        event_type=f"crisis_step_{step_key}",
        ref_id=case_id,
        title=build_step_timeline_title(step_key, next_step),
        summary=build_step_timeline_summary(step_key, next_step),
        metadata_={"stepKey": step_key, "payload": payload},
        created_by=user_id,
    )
    db.add(timeline)
    await db.commit()

    return crisis_case_to_output(existing_row)


async def submit_for_sign_off(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    case_id: uuid.UUID,
    closure_summary: str,
    user_id: uuid.UUID,
) -> CrisisCaseOutput:
    """提交督导审核 — stage='pending_sign_off' + 通知扇出.

    镜像 workflow.ts:157-212.

    校验:
      - stage 必须不是 closed / pending_sign_off
      - CRISIS_REQUIRED_STEPS 全部 done=True
      - closure_summary 非空
    """
    existing = await get_case_by_id(db, org_id, case_id)
    if existing.stage == "closed":
        raise ValidationError("案件已结案")
    if existing.stage == "pending_sign_off":
        raise ValidationError("案件已提交,等待督导审核")

    missing = [
        k
        for k in CRISIS_REQUIRED_STEPS
        if not existing.checklist.get(k) or not existing.checklist[k].get("done")
    ]
    if missing:
        names = "、".join(CRISIS_STEP_LABELS.get(k, k) for k in missing)
        raise ValidationError(f"以下必做步骤未完成: {names}")
    if not closure_summary or not closure_summary.strip():
        raise ValidationError("请填写结案摘要")

    summary_clean = closure_summary.strip()
    now = datetime.now(UTC)

    # Update via row reference for consistency
    row = await get_case_by_id_row(db, org_id, case_id)
    row.stage = "pending_sign_off"
    row.closure_summary = summary_clean
    row.submitted_for_sign_off_at = now
    row.updated_at = now

    timeline = CareTimeline(
        care_episode_id=row.episode_id,
        event_type="crisis_submitted_for_sign_off",
        ref_id=case_id,
        title="已提交督导审核",
        summary=summary_clean,
        created_by=user_id,
    )
    db.add(timeline)

    await notify_supervisors(
        db,
        str(org_id),
        notif_type="crisis_sign_off_request",
        title="危机案件等待您审核",
        body=summary_clean[:120],
        ref_type="crisis_case",
        ref_id=str(case_id),
    )

    await db.commit()
    return crisis_case_to_output(row)


async def sign_off(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    case_id: uuid.UUID,
    approve: bool,
    supervisor_note: str | None,
    user_id: uuid.UUID,
) -> CrisisCaseOutput:
    """督导 approve / bounce.

    镜像 workflow.ts:219-311.

    approve=True:
      stage='closed', 同时关闭 care_episode (status='closed', closed_at=now)

    approve=False:
      stage='reopened', submitted_for_sign_off_at 清空, counselor 可重新走
      submit 流程
    """
    existing = await get_case_by_id_row(db, org_id, case_id)
    if existing.stage != "pending_sign_off":
        raise ValidationError(f"只有 pending_sign_off 状态的案件可以审核(当前: {existing.stage})")

    now = datetime.now(UTC)

    if approve:
        existing.stage = "closed"
        existing.signed_off_by = user_id
        existing.signed_off_at = now
        existing.supervisor_note = supervisor_note
        existing.updated_at = now

        # 同步关闭关联 episode
        epq = select(CareEpisode).where(CareEpisode.id == existing.episode_id).limit(1)
        episode = (await db.execute(epq)).scalar_one_or_none()
        if episode is not None:
            episode.status = "closed"
            episode.closed_at = now
            episode.updated_at = now

        timeline = CareTimeline(
            care_episode_id=existing.episode_id,
            event_type="crisis_signed_off",
            ref_id=case_id,
            title="督导已确认结案",
            summary=supervisor_note or "",
            created_by=user_id,
        )
        db.add(timeline)

        if existing.created_by:
            db.add(
                Notification(
                    org_id=org_id,
                    user_id=existing.created_by,
                    type="crisis_signed_off",
                    title="危机案件已结案",
                    body="督导已确认您提交的危机处置案件结案。",
                    ref_type="crisis_case",
                    ref_id=case_id,
                )
            )

        await db.commit()
        return crisis_case_to_output(existing)

    # bounce
    existing.stage = "reopened"
    existing.supervisor_note = supervisor_note
    existing.submitted_for_sign_off_at = None
    existing.updated_at = now

    timeline = CareTimeline(
        care_episode_id=existing.episode_id,
        event_type="crisis_reopened",
        ref_id=case_id,
        title="督导退回修改",
        summary=supervisor_note or "",
        created_by=user_id,
    )
    db.add(timeline)

    if existing.created_by:
        body = (supervisor_note or "")[:120] or "请根据督导反馈修改后重新提交。"
        db.add(
            Notification(
                org_id=org_id,
                user_id=existing.created_by,
                type="crisis_reopened",
                title="危机案件已退回修改",
                body=body,
                ref_type="crisis_case",
                ref_id=case_id,
            )
        )

    await db.commit()
    return crisis_case_to_output(existing)


__all__ = [
    "create_from_candidate",
    "sign_off",
    "submit_for_sign_off",
    "update_checklist_step",
]
