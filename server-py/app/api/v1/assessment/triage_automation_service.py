"""
Triage automation service — 镜像 ``server/src/modules/assessment/triage-automation.service.ts``
(303 行).

业务语义 (Phase 1.5 安全设计):
  1. 客户提交测评 (``submit_result``) 后, 若有 ``risk_level``, 这里 fire-and-forget
     调用本 service:
       a. 派生 ``current_risk`` (assessment_results.risk_level 已经计算好, 此处不重算)
       b. **必要时** 在 ``candidate_pool`` 建一行 ``kind='crisis_candidate'`` 的候选
          (level_4 危机时, 给 admin 看待处理列表)
       c. 给相关人员发 ``notifications`` 行 (counselor 危机告警, parent 通知, etc)

  2. 与 Node 端区别:
     - **不调 AI pipeline**: Phase 3 不接 LLM, ``ai_provenance`` 字段保持 NULL,
       前端 ``<AIBadge>`` 走 fallback "AI 生成" 文案. AI 在 Phase 5+ 接入.
     - **不调 workflow rule engine**: Phase 12+ workflow_rules 模块独立 port.
     - **不调 EAP module**: Phase 4+ EAP 模块独立 port.

设计原则:
  - **All exceptions swallowed**: 与 Node ``console.warn(...)`` 一致, 任何步失败
    都不能阻塞 submit (HIPAA 哲学: care 不能被审计/通知系统拖垮).
  - **levels**: level_1/2 → 无操作. level_3+ → 通知 assigned counselor.
    level_4 → 通知 org_admins + 建 candidate_pool crisis 候选.
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.candidate_pool import CandidatePool
from app.db.models.client_assignments import ClientAssignment
from app.db.models.notifications import Notification
from app.db.models.org_members import OrgMember
from app.db.models.organizations import Organization
from app.lib.uuid_utils import parse_uuid_or_none

logger = logging.getLogger(__name__)


_LEVEL_LABELS = {
    "level_1": "一般",
    "level_2": "关注",
    "level_3": "严重",
    "level_4": "危机",
}


async def auto_triage_and_notify(
    *,
    db: AsyncSession,
    org_id: str,
    result_id: str,
    risk_level: str,
    user_id: str | None,
    dimension_scores: dict[str, float],
) -> None:
    """
    自动研判 + 风险通知. 任一步异常 swallow + log, 不破 caller.

    Args:
        db:                AsyncSession (caller 的 transaction 中)
        org_id:            org UUID 字符串
        result_id:         触发本次自动研判的 assessment_results.id
        risk_level:        level_1 / level_2 / level_3 / level_4
        user_id:           客户 user_id; 匿名公开测评时 None — 此时无个体可通知,
                           只通知 org_admins (level_4)
        dimension_scores:  本次结果的维度分 (供 candidate_pool.source_payload 留档)
    """
    # level_1 / level_2: 无操作
    if risk_level in ("level_1", "level_2"):
        return

    try:
        await _dispatch_notifications(
            db=db,
            org_id=org_id,
            result_id=result_id,
            risk_level=risk_level,
            user_id=user_id,
        )
    except Exception:
        logger.exception("[auto-triage] notification dispatch failed (non-blocking)")

    # level_4: 危机候选入候选池 (Phase 5 candidate-pool UI 上 admin 处理)
    if risk_level == "level_4" and user_id is not None:
        try:
            await _create_crisis_candidate(
                db=db,
                org_id=org_id,
                result_id=result_id,
                user_id=user_id,
                risk_level=risk_level,
                dimension_scores=dimension_scores,
            )
        except Exception:
            logger.exception("[auto-triage] candidate pool insert failed (non-blocking)")


async def _dispatch_notifications(
    *,
    db: AsyncSession,
    org_id: str,
    result_id: str,
    risk_level: str,
    user_id: str | None,
) -> None:
    """level_3+ → 通知 assigned counselor; level_4 → 也通知 org_admins."""
    try:
        org_uuid = uuid.UUID(org_id)
    except (ValueError, TypeError):
        return

    result_uuid = parse_uuid_or_none(result_id)
    user_uuid = parse_uuid_or_none(user_id) if user_id else None

    label = _LEVEL_LABELS.get(risk_level, risk_level)

    # level_3+: 给 assigned counselor 发通知
    if user_uuid is not None:
        a_q = (
            select(ClientAssignment.counselor_id)
            .where(
                and_(
                    ClientAssignment.org_id == org_uuid,
                    ClientAssignment.client_id == user_uuid,
                )
            )
            .limit(1)
        )
        counselor_id_row = (await db.execute(a_q)).first()
        if counselor_id_row is not None:
            counselor_id = counselor_id_row[0]
            db.add(
                Notification(
                    org_id=org_uuid,
                    user_id=counselor_id,
                    type="risk_alert",
                    title="测评结果需关注",
                    body=f"风险等级: {label}, 请查看测评结果并处理",
                    ref_type="assessment_result",
                    ref_id=result_uuid,
                )
            )

    # level_4: 通知 org_admins
    if risk_level == "level_4":
        admin_q = select(OrgMember.user_id).where(
            and_(
                OrgMember.org_id == org_uuid,
                OrgMember.role == "org_admin",
                OrgMember.status == "active",
            )
        )
        admin_rows = (await db.execute(admin_q)).all()
        for (admin_user_id,) in admin_rows:
            db.add(
                Notification(
                    org_id=org_uuid,
                    user_id=admin_user_id,
                    type="crisis_alert",
                    title="危机预警: 测评结果达到危机等级",
                    body=f"有客户的测评结果达到 {label} (level_4), 请立即关注",
                    ref_type="assessment_result",
                    ref_id=result_uuid,
                )
            )

    await db.flush()


async def _create_crisis_candidate(
    *,
    db: AsyncSession,
    org_id: str,
    result_id: str,
    user_id: str,
    risk_level: str,
    dimension_scores: dict[str, float],
) -> None:
    """level_4 → ``candidate_pool`` kind='crisis_candidate' 一行.

    设计: 不直接建个案 / 派咨询师 — 仅候选, admin 在协作中心人工二次访谈再决定动作.
    """
    try:
        org_uuid = uuid.UUID(org_id)
        user_uuid = uuid.UUID(user_id)
    except (ValueError, TypeError):
        return

    result_uuid = parse_uuid_or_none(result_id)

    # 查 org settings → orgType (用于 message 文案)
    org_q = select(Organization.settings).where(Organization.id == org_uuid).limit(1)
    org_row = (await db.execute(org_q)).first()
    settings = (org_row[0] if org_row else None) or {}
    org_type = settings.get("orgType", "counseling")

    db.add(
        CandidatePool(
            org_id=org_uuid,
            client_user_id=user_uuid,
            kind="crisis_candidate",
            suggestion="危机评估结果触发, 建议立即人工跟进",
            reason=f"测评 risk_level={risk_level}, orgType={org_type}",
            priority="urgent",
            source_result_id=result_uuid,
            source_payload={
                "resultId": result_id,
                "riskLevel": risk_level,
                "dimensionScores": dimension_scores,
            },
            status="pending",
        )
    )
    await db.flush()


__all__ = ["auto_triage_and_notify"]
