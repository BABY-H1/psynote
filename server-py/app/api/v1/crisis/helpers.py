"""
Crisis helpers — 镜像 ``server/src/modules/crisis/crisis-helpers.ts`` (131 行).

包含:
  - ``CRISIS_REQUIRED_STEPS`` / ``CRISIS_STEP_LABELS`` (镜像 packages/shared)
  - ``crisis_case_to_output``: 行 → DTO (镜像 ``toCrisisCase``)
  - ``build_step_timeline_title`` / ``build_step_timeline_summary``:
    根据 stepKey + payload 生成 timeline 事件标题 + summary
  - ``notify_supervisors``: 督导通知扇出 (org_admin OR counselor+full_practice_access)

设计决策与 Node 一致 — 这些 helper 只在 crisis 域内有意义,不抽到 ``app/lib/``。
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.crisis.schemas import CrisisCaseOutput
from app.db.models.crisis_cases import CrisisCase
from app.db.models.notifications import Notification
from app.db.models.org_members import OrgMember

# 镜像 packages/shared/src/types/crisis.ts
CRISIS_REQUIRED_STEPS: tuple[str, ...] = (
    "reinterview",
    "parentContact",
    "documents",
    "referral",
    "followUp",
)

CRISIS_STEP_LABELS: dict[str, str] = {
    "reinterview": "重新访谈",
    "parentContact": "联系家长/监护人",
    "documents": "文书签署",
    "referral": "外部转介",
    "followUp": "跟进随访",
}


def build_step_timeline_title(step_key: str, step: dict[str, Any]) -> str:
    """构造 timeline 事件 title (镜像 helpers.ts:37-45).

    区分 done / skipped / updated 三态, 让审计能看出步骤实际完成度。
    """
    label = CRISIS_STEP_LABELS.get(step_key, step_key)
    if step.get("skipped"):
        return f"{label}(已跳过)"
    if step.get("done"):
        return f"{label}已完成"
    return f"{label}已更新"


def build_step_timeline_summary(step_key: str, step: dict[str, Any]) -> str:
    """构造 timeline 事件 summary (镜像 helpers.ts:48-64).

    parentContact 有专属拼接 (method/contactName/summary), 其它步骤回退到
    step.summary 字段。
    """
    if step.get("skipped") and step.get("skipReason"):
        return f"跳过原因: {step['skipReason']}"
    if step_key == "parentContact":
        parts: list[str] = []
        if step.get("method"):
            parts.append(f"方式: {step['method']}")
        if step.get("contactName"):
            parts.append(f"对象: {step['contactName']}")
        if step.get("summary"):
            parts.append(str(step["summary"]))
        return " · ".join(parts)
    return str(step.get("summary") or "")


def crisis_case_to_output(row: CrisisCase) -> CrisisCaseOutput:
    """ORM 行 → ``CrisisCaseOutput`` DTO (镜像 helpers.ts:67-86)."""
    return CrisisCaseOutput(
        id=str(row.id),
        org_id=str(row.org_id),
        episode_id=str(row.episode_id),
        candidate_id=str(row.candidate_id) if row.candidate_id else None,
        stage=row.stage or "open",
        checklist=row.checklist or {},
        closure_summary=row.closure_summary,
        supervisor_note=row.supervisor_note,
        signed_off_by=str(row.signed_off_by) if row.signed_off_by else None,
        signed_off_at=row.signed_off_at,
        submitted_for_sign_off_at=row.submitted_for_sign_off_at,
        created_by=str(row.created_by) if row.created_by else None,
        created_at=getattr(row, "created_at", None),
        updated_at=getattr(row, "updated_at", None),
    )


async def notify_supervisors(
    db: AsyncSession,
    org_id: str,
    *,
    notif_type: str,
    title: str,
    body: str | None = None,
    ref_type: str | None = None,
    ref_id: str | None = None,
) -> None:
    """督导通知扇出 (镜像 helpers.ts:96-131).

    psynote 没有专门的 'supervisor' 角色, 督导职能由两类人担任:
      1. ``role = 'org_admin'``
      2. ``role = 'counselor' AND full_practice_access = TRUE``

    本函数把通知插到所有这类用户的 notifications 表 — 谁先在通知中心看到
    谁处理。

    无候选时静默返回 — 与 Node 一致 (helpers.ts:118)。
    """
    from app.lib.uuid_utils import parse_uuid_or_raise

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    q = select(OrgMember).where(and_(OrgMember.org_id == org_uuid, OrgMember.status == "active"))
    result = await db.execute(q)
    members = list(result.scalars().all())

    supervisors = [
        m
        for m in members
        if m.role == "org_admin" or (m.role == "counselor" and bool(m.full_practice_access))
    ]
    if not supervisors:
        return

    ref_uuid = parse_uuid_or_raise(ref_id, field="refId") if ref_id else None
    for s in supervisors:
        notif = Notification(
            org_id=org_uuid,
            user_id=s.user_id,
            type=notif_type,
            title=title,
            body=body,
            ref_type=ref_type,
            ref_id=ref_uuid,
        )
        db.add(notif)


__all__ = [
    "CRISIS_REQUIRED_STEPS",
    "CRISIS_STEP_LABELS",
    "build_step_timeline_summary",
    "build_step_timeline_title",
    "crisis_case_to_output",
    "notify_supervisors",
]
