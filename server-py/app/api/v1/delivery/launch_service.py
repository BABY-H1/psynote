"""
统一 launch verb 实装 — 镜像 ``server/src/modules/delivery/launch.service.ts`` (370 行)。

Phase 9β 设计动机 (与 Node 一致):
  L2 视野下每个 consumer-facing service 都是 "咨询师选资产 → 一键启动 → 来访者
  立即承接" 的同构流程。今天每个模块各有 createXxxInstance 端点 (course /
  group / episode / assessment / consent / referral), parameter shape 不统一,
  分散在 5+ 个路由。

  方案: ``POST /api/orgs/{org_id}/services/launch`` 单一入口, body
  ``{actionType, payload}`` 路由到对应模块的创建逻辑, 返回标准化
  ``LaunchResult`` envelope (kind / instanceId / summary), 让前端
  AI 推荐"一键采纳" + 统一"+ 启动新服务" 按钮共用一个调用点。

业务一致性 (Node 端):
  - launch 调用 = create + audit log + 通知触发, 全在单 DB transaction 里
    (本路由的 ``record_audit`` 由 router 层统一调, 不在 service 层重复)
  - actionType ∈ TriageRecommendation enum, 让 triage 推荐结构可直接传过来
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.delivery.schemas import (
    LaunchActionType,
    LaunchPayload,
    LaunchResult,
)
from app.db.models.assessments import Assessment
from app.db.models.care_episodes import CareEpisode
from app.db.models.client_documents import ClientDocument
from app.db.models.consent_templates import ConsentTemplate
from app.db.models.course_instances import CourseInstance
from app.db.models.courses import Course
from app.db.models.group_instances import GroupInstance
from app.db.models.group_schemes import GroupScheme
from app.db.models.referrals import Referral
from app.db.models.scales import Scale
from app.lib.errors import NotFoundError, ValidationError
from app.lib.uuid_utils import parse_uuid_or_raise

if TYPE_CHECKING:  # pragma: no cover
    pass


def _format_date(d: datetime) -> str:
    """``YYYY-MM-DD`` (镜像 launch.service.ts:365-370 ``formatDate``)。"""
    return f"{d.year:04d}-{d.month:02d}-{d.day:02d}"


# ─── 主入口 (镜像 launch.service.ts:137-154) ───────────────────


async def launch(
    db: AsyncSession,
    *,
    org_id: str,
    user_id: str,
    action_type: LaunchActionType,
    payload: LaunchPayload,
) -> LaunchResult:
    """根据 ``action_type`` 派发到对应 launcher (镜像 launch.service.ts:137-154)。

    Transactional: 每个 launcher 用同一个 ``db`` session, 路由层 commit/rollback
    控制 transaction 边界。

    Raises:
        ValidationError: payload 必填字段缺失 / 未知 actionType
        NotFoundError:   payload 引用的资源 (course/template/scale) 不存在
    """
    if action_type == "launch_course":
        return await _launch_course(db, org_id=org_id, user_id=user_id, p=payload)
    if action_type == "launch_group":
        return await _launch_group(db, org_id=org_id, user_id=user_id, p=payload)
    if action_type == "create_episode":
        return await _create_episode(db, org_id=org_id, p=payload)
    if action_type == "send_assessment":
        return await _send_assessment(db, org_id=org_id, user_id=user_id, p=payload)
    if action_type == "send_consent":
        return await _send_consent(db, org_id=org_id, user_id=user_id, p=payload)
    if action_type == "create_referral":
        return await _create_referral(db, org_id=org_id, user_id=user_id, p=payload)
    raise ValidationError(f"Unknown actionType: {action_type}")


# ─── Course launcher (镜像 launch.service.ts:158-185) ────────


async def _launch_course(
    db: AsyncSession,
    *,
    org_id: str,
    user_id: str,
    p: LaunchPayload,
) -> LaunchResult:
    """启动一期课程实例 (course_instances 行 + 默认 title)。"""
    if not p.course_id:
        raise ValidationError("courseId is required")

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user_id, field="userId")
    course_uuid = parse_uuid_or_raise(p.course_id, field="courseId")

    cq = select(Course).where(Course.id == course_uuid).limit(1)
    course = (await db.execute(cq)).scalar_one_or_none()
    if course is None:
        raise NotFoundError("Course", p.course_id)

    responsible_uuid = (
        parse_uuid_or_raise(p.responsible_id, field="responsibleId")
        if p.responsible_id
        else user_uuid
    )

    title = p.title or f"{course.title} · {_format_date(datetime.now(UTC))}"
    instance = CourseInstance(
        org_id=org_uuid,
        course_id=course_uuid,
        title=title,
        description=p.description,
        publish_mode=p.publish_mode or "assign",
        responsible_id=responsible_uuid,
        created_by=user_uuid,
    )
    db.add(instance)
    await db.flush()

    # TODO Phase 9γ: optionally enroll clientUserIds via course enrollment service
    return LaunchResult(
        kind="course",
        instance_id=str(instance.id),
        summary=f"课程「{course.title}」已启动",
    )


# ─── Group launcher (镜像 launch.service.ts:189-224) ─────────


async def _launch_group(
    db: AsyncSession,
    *,
    org_id: str,
    user_id: str,
    p: LaunchPayload,
) -> LaunchResult:
    """开启一期团辅实例 (group_instances 行 + 可选 scheme 校验)。"""
    if not p.title:
        raise ValidationError("title is required")

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user_id, field="userId")

    scheme_uuid: uuid.UUID | None = None
    if p.scheme_id:
        scheme_uuid = parse_uuid_or_raise(p.scheme_id, field="schemeId")
        sq = select(GroupScheme).where(GroupScheme.id == scheme_uuid).limit(1)
        scheme = (await db.execute(sq)).scalar_one_or_none()
        if scheme is None:
            raise NotFoundError("GroupScheme", p.scheme_id)

    leader_uuid = parse_uuid_or_raise(p.leader_id, field="leaderId") if p.leader_id else user_uuid

    instance = GroupInstance(
        org_id=org_uuid,
        scheme_id=scheme_uuid,
        title=p.title,
        description=p.description,
        category=p.category,
        leader_id=leader_uuid,
        schedule=p.schedule,
        duration=p.duration,
        capacity=p.capacity,
        created_by=user_uuid,
    )
    db.add(instance)
    await db.flush()

    return LaunchResult(
        kind="group",
        instance_id=str(instance.id),
        summary=f"团辅「{p.title}」已开班",
    )


# ─── Episode launcher (镜像 launch.service.ts:228-247) ──────


async def _create_episode(
    db: AsyncSession,
    *,
    org_id: str,
    p: LaunchPayload,
) -> LaunchResult:
    """开启个案 (care_episodes 行) — 不写 timeline event, 由路由层补 audit。"""
    if not p.client_id:
        raise ValidationError("clientId is required")

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    client_uuid = parse_uuid_or_raise(p.client_id, field="clientId")
    counselor_uuid = (
        parse_uuid_or_raise(p.counselor_id, field="counselorId") if p.counselor_id else None
    )

    episode = CareEpisode(
        org_id=org_uuid,
        client_id=client_uuid,
        counselor_id=counselor_uuid,
        chief_complaint=p.chief_complaint,
        current_risk=p.current_risk or "level_1",
    )
    db.add(episode)
    await db.flush()

    return LaunchResult(
        kind="counseling",
        instance_id=str(episode.id),
        summary="个案已开启",
    )


# ─── Assessment launcher (镜像 launch.service.ts:251-292) ───


async def _send_assessment(
    db: AsyncSession,
    *,
    org_id: str,
    user_id: str,
    p: LaunchPayload,
) -> LaunchResult:
    """创建测评活动 (assessment) 准备下发, 或复用现成 ``assessment_id``。

    - 若 ``assessment_id`` 给出 → 直接返该 id (延迟下发由 caller 决定)
    - 否则需要 ``scale_id`` → 用该 scale 创建一个 type='tracking' 的 assessment
    """
    if not p.scale_id and not p.assessment_id:
        raise ValidationError("scaleId or assessmentId is required")
    if not p.client_user_ids:
        raise ValidationError("clientUserIds is required")

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user_id, field="userId")

    assessment_id: str | None = p.assessment_id
    title = p.title

    if not assessment_id and p.scale_id:
        scale_uuid = parse_uuid_or_raise(p.scale_id, field="scaleId")
        sq = select(Scale).where(Scale.id == scale_uuid).limit(1)
        scale = (await db.execute(sq)).scalar_one_or_none()
        if scale is None:
            raise NotFoundError("Scale", p.scale_id)
        if title is None:
            title = scale.title

        new_assessment = Assessment(
            org_id=org_uuid,
            title=title or "新测评",
            assessment_type="tracking",
            collect_mode="require_register",
            created_by=user_uuid,
        )
        db.add(new_assessment)
        await db.flush()
        assessment_id = str(new_assessment.id)

    summary = f"测评「{title or '新测评'}」已创建并准备下发"
    return LaunchResult(
        kind="assessment",
        instance_id=str(assessment_id),
        summary=summary,
    )


# ─── Consent launcher (镜像 launch.service.ts:296-331) ──────


async def _send_consent(
    db: AsyncSession,
    *,
    org_id: str,
    user_id: str,
    p: LaunchPayload,
) -> LaunchResult:
    """从模板创建 pending client_documents 行 (Phase 9β 同意书签发)。"""
    if not p.template_id:
        raise ValidationError("templateId is required")
    if not p.client_user_id:
        raise ValidationError("clientUserId is required")

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user_id, field="userId")
    template_uuid = parse_uuid_or_raise(p.template_id, field="templateId")
    client_uuid = parse_uuid_or_raise(p.client_user_id, field="clientUserId")

    tq = select(ConsentTemplate).where(ConsentTemplate.id == template_uuid).limit(1)
    template = (await db.execute(tq)).scalar_one_or_none()
    if template is None:
        raise NotFoundError("ConsentTemplate", p.template_id)

    doc = ClientDocument(
        org_id=org_uuid,
        client_id=client_uuid,
        template_id=template_uuid,
        doc_type="consent",
        title=template.title,
        content=template.content,
        status="pending",
        created_by=user_uuid,
    )
    db.add(doc)
    await db.flush()

    return LaunchResult(
        kind="consent",
        instance_id=str(doc.id),
        summary=f"协议「{template.title}」已发送给来访者",
    )


# ─── Referral launcher (镜像 launch.service.ts:335-361) ─────


async def _create_referral(
    db: AsyncSession,
    *,
    org_id: str,
    user_id: str,
    p: LaunchPayload,
) -> LaunchResult:
    """创建 referral 行 (status=pending, 走 referral.service 状态机)。"""
    if not p.care_episode_id:
        raise ValidationError("careEpisodeId is required")
    if not p.client_id:
        raise ValidationError("clientId is required")
    if not p.reason:
        raise ValidationError("reason is required")

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user_id, field="userId")
    episode_uuid = parse_uuid_or_raise(p.care_episode_id, field="careEpisodeId")
    client_uuid = parse_uuid_or_raise(p.client_id, field="clientId")

    referral = Referral(
        org_id=org_uuid,
        care_episode_id=episode_uuid,
        client_id=client_uuid,
        referred_by=user_uuid,
        reason=p.reason,
        risk_summary=p.risk_summary,
        target_type=p.target_type,
        target_name=p.target_name,
        target_contact=p.target_contact,
        status="pending",
    )
    db.add(referral)
    await db.flush()

    return LaunchResult(
        kind="referral",
        instance_id=str(referral.id),
        summary="转介已创建",
    )


# 防 mypy 提示 timedelta 未使用 (保留 import 给后续 9γ enroll 流程扩展用)
_ = timedelta

__all__ = ["launch"]
