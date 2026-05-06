"""
Referral 业务逻辑 — 镜像 ``server/src/modules/referral/referral.service.ts`` (393 行).

涵盖:
  - listReferrals / getReferralById / createReferral / updateReferral (基础 CRUD)
  - createReferralExtended (Phase 9δ — 含 mode + dataPackageSpec)
  - recordClientConsent (client portal: 同意 / 不同意; mint download token)
  - respondToReferral (receiver: accept / reject)
  - resolveDataPackage (按 spec 装包临床记录)
  - listIncomingReferrals (receiver inbox)
  - getByDownloadToken (W2.9: 单次失效 token)

W2.9 修复 (referral.service.ts:373-393):
  ``get_by_download_token`` 在校验通过 + resolve_data_package 之前 nullify
  download_token。后续同一 token → NotFoundError(404) (找不到行)。
  Trade-off: 若 resolve_data_package / 网络传输失败, sender 必须重新签发
  下载链 (security > convenience for external PHI link)。
"""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import and_, desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.referral.schemas import DataPackageSpec, ReferralOutput
from app.db.models.assessment_results import AssessmentResult
from app.db.models.care_episodes import CareEpisode
from app.db.models.care_timeline import CareTimeline
from app.db.models.referrals import Referral
from app.db.models.session_notes import SessionNote
from app.db.models.treatment_plans import TreatmentPlan
from app.db.models.users import User
from app.lib.errors import NotFoundError, ValidationError
from app.middleware.data_scope import DataScope

# ─── DTO 转换 ──────────────────────────────────────────────────────


def referral_to_output(r: Referral) -> ReferralOutput:
    """ORM → DTO."""
    return ReferralOutput(
        id=str(r.id),
        org_id=str(r.org_id),
        care_episode_id=str(r.care_episode_id),
        client_id=str(r.client_id),
        referred_by=str(r.referred_by),
        reason=r.reason,
        risk_summary=r.risk_summary,
        target_type=r.target_type,
        target_name=r.target_name,
        target_contact=r.target_contact,
        status=r.status or "pending",
        follow_up_plan=r.follow_up_plan,
        follow_up_notes=r.follow_up_notes,
        mode=r.mode or "external",
        to_counselor_id=str(r.to_counselor_id) if r.to_counselor_id else None,
        to_org_id=str(r.to_org_id) if r.to_org_id else None,
        data_package_spec=r.data_package_spec or {},
        consented_at=r.consented_at,
        accepted_at=r.accepted_at,
        rejected_at=r.rejected_at,
        rejection_reason=r.rejection_reason,
        download_token=r.download_token,
        download_expires_at=r.download_expires_at,
        created_at=getattr(r, "created_at", None),
        updated_at=getattr(r, "updated_at", None),
    )


# ─── 基础 CRUD (referral.service.ts:28-113) ─────────────────────────


async def list_referrals(
    db: AsyncSession,
    org_id: uuid.UUID,
    *,
    care_episode_id: uuid.UUID | None = None,
    scope: DataScope | None = None,
) -> list[ReferralOutput]:
    """列表 + data scope filter (镜像 service.ts:28-44).

    ``scope.type='assigned'`` 时按 ``allowed_client_ids`` 过滤; 空集合 → []。
    """
    conds: list[Any] = [Referral.org_id == org_id]
    if care_episode_id:
        conds.append(Referral.care_episode_id == care_episode_id)

    if scope and scope.type == "assigned":
        if not scope.allowed_client_ids:
            return []
        ids = [uuid.UUID(s) for s in scope.allowed_client_ids]
        conds.append(Referral.client_id.in_(ids))

    q = select(Referral).where(and_(*conds)).order_by(desc(Referral.created_at))
    rows = list((await db.execute(q)).scalars().all())
    return [referral_to_output(r) for r in rows]


async def get_referral_by_id(db: AsyncSession, referral_id: uuid.UUID) -> ReferralOutput:
    """详情 — 不存在抛 404 (镜像 service.ts:46-54)."""
    q = select(Referral).where(Referral.id == referral_id).limit(1)
    row = (await db.execute(q)).scalar_one_or_none()
    if row is None:
        raise NotFoundError("Referral", str(referral_id))
    return referral_to_output(row)


async def create_referral(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    care_episode_id: uuid.UUID,
    client_id: uuid.UUID,
    referred_by: uuid.UUID,
    reason: str,
    risk_summary: str | None = None,
    target_type: str | None = None,
    target_name: str | None = None,
    target_contact: str | None = None,
    follow_up_plan: str | None = None,
) -> ReferralOutput:
    """基础创建 — 不带 data package (镜像 service.ts:57-94).

    同步写一条 ``care_timeline`` (event_type='referral') 让 episode 详情看得到。
    """
    referral = Referral(
        org_id=org_id,
        care_episode_id=care_episode_id,
        client_id=client_id,
        referred_by=referred_by,
        reason=reason,
        risk_summary=risk_summary,
        target_type=target_type,
        target_name=target_name,
        target_contact=target_contact,
        follow_up_plan=follow_up_plan,
    )
    db.add(referral)
    await db.flush()

    target_label = target_name or target_type or "外部机构"
    timeline = CareTimeline(
        care_episode_id=care_episode_id,
        event_type="referral",
        ref_id=referral.id,
        title="发起转介",
        summary=f"转介至 {target_label}: {reason}",
        metadata_={"targetType": target_type, "targetName": target_name},
        created_by=referred_by,
    )
    db.add(timeline)
    await db.commit()

    return referral_to_output(referral)


async def update_referral(
    db: AsyncSession,
    referral_id: uuid.UUID,
    *,
    updates: dict[str, Any],
) -> ReferralOutput:
    """部分更新 (镜像 service.ts:96-113). updates 已经过 schema 校验."""
    q = select(Referral).where(Referral.id == referral_id).limit(1)
    referral = (await db.execute(q)).scalar_one_or_none()
    if referral is None:
        raise NotFoundError("Referral", str(referral_id))

    for k, v in updates.items():
        if v is not None:
            setattr(referral, k, v)
    referral.updated_at = datetime.now(UTC)
    await db.commit()
    return referral_to_output(referral)


# ─── Phase 9δ 双向流 (referral.service.ts:115-181) ──────────────────


async def create_referral_extended(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    care_episode_id: uuid.UUID,
    client_id: uuid.UUID,
    referred_by: uuid.UUID,
    reason: str,
    risk_summary: str | None,
    mode: str,
    to_counselor_id: uuid.UUID | None,
    to_org_id: uuid.UUID | None,
    target_type: str | None,
    target_name: str | None,
    target_contact: str | None,
    data_package_spec: dict[str, Any],
) -> ReferralOutput:
    """显式 mode + data package 创建 (镜像 service.ts:126-180).

    校验:
      - mode='platform' 必须有 to_counselor_id 或 to_org_id
      - mode 必须是 'platform' 或 'external'
    """
    if mode not in ("platform", "external"):
        raise ValidationError("mode must be platform or external")
    if mode == "platform" and not to_counselor_id and not to_org_id:
        raise ValidationError("platform mode requires toCounselorId or toOrgId")

    referral = Referral(
        org_id=org_id,
        care_episode_id=care_episode_id,
        client_id=client_id,
        referred_by=referred_by,
        reason=reason,
        risk_summary=risk_summary,
        mode=mode,
        to_counselor_id=to_counselor_id,
        to_org_id=to_org_id,
        target_type=target_type,
        target_name=target_name,
        target_contact=target_contact,
        data_package_spec=data_package_spec,
        status="pending",
    )
    db.add(referral)
    await db.flush()

    target_label = target_name or target_type or "外部机构"
    timeline = CareTimeline(
        care_episode_id=care_episode_id,
        event_type="referral",
        ref_id=referral.id,
        title="发起转介",
        summary=f"转介至 {target_label}: {reason}",
        metadata_={
            "mode": mode,
            "toCounselorId": str(to_counselor_id) if to_counselor_id else None,
            "toOrgId": str(to_org_id) if to_org_id else None,
        },
        created_by=referred_by,
    )
    db.add(timeline)
    await db.commit()

    return referral_to_output(referral)


# ─── Client consent (referral.service.ts:182-236) ──────────────────


async def record_client_consent(
    db: AsyncSession,
    *,
    referral_id: uuid.UUID,
    client_id: uuid.UUID,
    consent: bool,
) -> ReferralOutput:
    """Client portal: 同意 / 不同意 (镜像 service.ts:186-236).

    同意 + mode='external' → mint download_token + download_expires_at (7 天)。
    """
    q = select(Referral).where(Referral.id == referral_id).limit(1)
    referral = (await db.execute(q)).scalar_one_or_none()
    if referral is None:
        raise NotFoundError("Referral", str(referral_id))
    if referral.client_id != client_id:
        raise ValidationError("You cannot consent to a referral that is not yours")
    if referral.status != "pending":
        raise ValidationError(f'Referral is in status "{referral.status}", not pending')

    now = datetime.now(UTC)

    if not consent:
        referral.status = "rejected"
        referral.rejected_at = now
        referral.rejection_reason = "来访者未同意转介"
        referral.updated_at = now
        await db.commit()
        return referral_to_output(referral)

    referral.status = "consented"
    referral.consented_at = now
    referral.updated_at = now
    if referral.mode == "external":
        referral.download_token = secrets.token_hex(24)
        referral.download_expires_at = now + timedelta(days=7)
    await db.commit()
    return referral_to_output(referral)


# ─── Receiver decision (referral.service.ts:238-287) ───────────────


async def respond_to_referral(
    db: AsyncSession,
    *,
    referral_id: uuid.UUID,
    receiver_user_id: uuid.UUID,
    decision: str,
    reason: str | None = None,
) -> ReferralOutput:
    """Receiver 接受/拒绝 (镜像 service.ts:242-287).

    校验: status 必须是 'consented'。

    decision 只接受 'accept' / 'reject' (路由层校验过), 这里仅做状态机 transition.

    Note: receiver_user_id 在 Node 端注释也明说了"通过 toCounselorId 软关联,
    上层 caller 已校验 org context", 这里保持同步。
    """
    if decision not in ("accept", "reject"):
        raise ValidationError("decision must be accept or reject")

    q = select(Referral).where(Referral.id == referral_id).limit(1)
    referral = (await db.execute(q)).scalar_one_or_none()
    if referral is None:
        raise NotFoundError("Referral", str(referral_id))
    if referral.status != "consented":
        raise ValidationError(f'Referral is in status "{referral.status}", expected "consented"')

    now = datetime.now(UTC)
    if decision == "reject":
        referral.status = "rejected"
        referral.rejected_at = now
        referral.rejection_reason = reason
        referral.updated_at = now
    else:
        referral.status = "accepted"
        referral.accepted_at = now
        referral.updated_at = now

    await db.commit()
    return referral_to_output(referral)


# ─── Data package resolve (referral.service.ts:289-343) ────────────


async def resolve_data_package(db: AsyncSession, referral_id: uuid.UUID) -> dict[str, Any]:
    """按 spec 装临床记录数据包 (镜像 service.ts:293-343).

    返回 dict (而非 typed model), 因为字段动态由 ``data_package_spec`` 决定。

    **安全 (Phase 5 P0 Fix 2 加固, 2026-05-06)**:
      ``data_package_spec`` 里的 PHI ID 来自创建 referral 时 sender 提供 — 攻击路径:
      org A 的 counselor 偷拿 org B 的 session_note_id 塞进 spec, resolve 时若不
      校验 org_id, B 的 PHI 直接被 A 提取。这里对所有 PHI 表强制 ``org_id == sender_org``
      过滤, 即使 spec 含跨 org ID 也只会得到空结果, 不发生数据泄露。
    """
    q = select(Referral).where(Referral.id == referral_id).limit(1)
    referral = (await db.execute(q)).scalar_one_or_none()
    if referral is None:
        raise NotFoundError("Referral", str(referral_id))

    # 发起方 org_id — 所有 PHI 必须归属此 org (defense-in-depth)
    sender_org_id = referral.org_id

    spec_raw: dict[str, Any] = referral.data_package_spec or {}
    spec = DataPackageSpec(**spec_raw)
    result: dict[str, Any] = {"referral": referral_to_output(referral).model_dump(by_alias=True)}

    # episode + client 基础信息
    epq = (
        select(CareEpisode)
        .where(
            and_(
                CareEpisode.id == referral.care_episode_id,
                CareEpisode.org_id == sender_org_id,
            )
        )
        .limit(1)
    )
    episode = (await db.execute(epq)).scalar_one_or_none()
    result["episode"] = episode

    cq = select(User.id, User.name).where(User.id == referral.client_id).limit(1)
    crow = (await db.execute(cq)).first()
    result["client"] = {"id": str(crow[0]), "name": crow[1]} if crow else None

    if spec.session_note_ids:
        ids = [uuid.UUID(s) for s in spec.session_note_ids]
        nq = select(SessionNote).where(
            and_(SessionNote.id.in_(ids), SessionNote.org_id == sender_org_id)
        )
        result["sessionNotes"] = list((await db.execute(nq)).scalars().all())

    if spec.assessment_result_ids:
        ids = [uuid.UUID(s) for s in spec.assessment_result_ids]
        aq = select(AssessmentResult).where(
            and_(AssessmentResult.id.in_(ids), AssessmentResult.org_id == sender_org_id)
        )
        result["assessmentResults"] = list((await db.execute(aq)).scalars().all())

    if spec.treatment_plan_ids:
        ids = [uuid.UUID(s) for s in spec.treatment_plan_ids]
        tq = select(TreatmentPlan).where(
            and_(TreatmentPlan.id.in_(ids), TreatmentPlan.org_id == sender_org_id)
        )
        result["treatmentPlans"] = list((await db.execute(tq)).scalars().all())

    return result


# ─── Inbox (referral.service.ts:345-361) ───────────────────────────


async def list_incoming_referrals(
    db: AsyncSession, receiver_user_id: uuid.UUID
) -> list[ReferralOutput]:
    """Receiver inbox — 我作为 to_counselor + 状态 ∈ {consented, accepted}.

    镜像 service.ts:349-361。
    """
    q = (
        select(Referral)
        .where(
            and_(
                Referral.to_counselor_id == receiver_user_id,
                or_(Referral.status == "consented", Referral.status == "accepted"),
            )
        )
        .order_by(desc(Referral.created_at))
    )
    rows = list((await db.execute(q)).scalars().all())
    return [referral_to_output(r) for r in rows]


# ─── W2.9 — Single-use download token (service.ts:363-393) ─────────


async def get_by_download_token(db: AsyncSession, token: str) -> dict[str, Any]:
    """根据 download_token 取数据包 (W2.9 single-use, 镜像 service.ts:373-393).

    校验顺序 (顺序至关重要 — 失败时不能 nullify):
      1. token 匹配某行 (找不到 → NotFoundError 404)
      2. download_expires_at 在未来 (过期 → ValidationError)
      3. status ∈ {consented, completed} (状态错 → ValidationError)
      4. **校验全过后**, 在 resolve_data_package 之前 nullify token
      5. 返回数据包

    后续请求同 token → 第 1 步找不到行 → 404。

    Trade-off: 若 resolve_data_package / 网络传输失败, token 已经 nullify,
    sender 必须重新签发。security > convenience for external PHI links。
    """
    q = select(Referral).where(Referral.download_token == token).limit(1)
    referral = (await db.execute(q)).scalar_one_or_none()
    if referral is None:
        raise NotFoundError("Referral", token)
    if referral.download_expires_at is None or referral.download_expires_at < datetime.now(UTC):
        raise ValidationError("Download link has expired")
    if referral.status not in ("consented", "completed"):
        raise ValidationError("Referral is not in a downloadable state")

    # ⚠ W2.9: 必须在 resolve_data_package 之前 nullify, 让后续同 token 落到
    # 第 1 步的 NotFoundError。把 nullify 移到 resolve 之后会让攻击者
    # 在并发窗口里多 download 几次 (race-condition leak)。
    referral_id = referral.id
    referral.download_token = None
    await db.commit()

    return await resolve_data_package(db, referral_id)


__all__ = [
    "create_referral",
    "create_referral_extended",
    "get_by_download_token",
    "get_referral_by_id",
    "list_incoming_referrals",
    "list_referrals",
    "record_client_consent",
    "referral_to_output",
    "resolve_data_package",
    "respond_to_referral",
    "update_referral",
]
