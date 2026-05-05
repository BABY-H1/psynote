"""
Public services + service intakes router — 镜像 ``public-services.routes.ts`` (265 行).

两组路由 (Node 拆 ``publicServiceRoutes`` / ``serviceIntakeRoutes``, Python 合一):

  Public (no auth, ``/api/public`` prefix):
    GET  /api/public/orgs/{org_slug}/services         — 列已发布服务
    POST /api/public/orgs/{org_slug}/services/intake  — 提交咨询申请 (transactional)

  Authenticated (``/api/orgs/{org_id}/service-intakes`` prefix):
    GET  /                       — 列待处理 intakes (org_admin)
    POST /{intake_id}/assign     — 分配 intake 给咨询师 (org_admin)

Transactional 重点:
  POST /intake 一次创建 user (找不到时) + org_member (client) + service_intake +
  可选 client_assignment + 通知 — 单 commit, 失败 rollback. 与 Node 行为完全一致.

Phase 3 阶段使用两个 router 注册到不同 prefix:
  - public_router 挂在 ``/api/public`` (no auth)
  - intake_router 挂在 ``/api/orgs/{org_id}/service-intakes`` (auth + admin)
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.org.schemas import (
    IntakeAssignRequest,
    IntakeRow,
    PublicIntakeRequest,
    PublicIntakeResponse,
    PublicServicesResponse,
    SuccessResponse,
)
from app.core.database import get_db
from app.db.models.client_assignments import ClientAssignment
from app.db.models.notifications import Notification
from app.db.models.org_members import OrgMember
from app.db.models.organizations import Organization
from app.db.models.service_intakes import ServiceIntake
from app.db.models.users import User
from app.lib.errors import NotFoundError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.role_guards import require_admin

# 两个 router (路径 prefix 不同, app/main.py 分别 include)
public_router = APIRouter()
intake_router = APIRouter()


def _require_org_admin(org: OrgContext | None) -> None:
    require_admin(org)


# ─── Public routes (no auth) ─────────────────────────────────────


@public_router.get("/orgs/{org_slug}/services", response_model=PublicServicesResponse)
async def list_public_services(
    org_slug: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PublicServicesResponse:
    """列出 org 已发布的公开服务 (no auth). 镜像 public-services.routes.ts:38-64."""
    q = select(Organization).where(Organization.slug == org_slug).limit(1)
    org = (await db.execute(q)).scalar_one_or_none()
    if org is None:
        return PublicServicesResponse(org_id=None, org_name="", services=[])

    settings = org.settings or {}
    public_services_raw = settings.get("publicServices") or []
    active = [s for s in public_services_raw if s.get("isActive")]
    out_services: list[dict[str, Any]] = [
        {
            "id": s.get("id"),
            "title": s.get("title"),
            "description": s.get("description"),
            "sessionFormat": s.get("sessionFormat"),
            "targetAudience": s.get("targetAudience"),
            "intakeMode": s.get("intakeMode"),
        }
        for s in active
    ]
    return PublicServicesResponse(
        org_id=str(org.id),
        org_name=org.name,
        services=out_services,
    )


@public_router.post(
    "/orgs/{org_slug}/services/intake",
    response_model=PublicIntakeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_public_intake(
    org_slug: str,
    body: PublicIntakeRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PublicIntakeResponse:
    """提交咨询申请 (no auth). 镜像 public-services.routes.ts:67-182.

    Transactional: 找/建 user + 加 org_member + 建 intake + 可选 client_assignment +
    通知, 单 commit. 任意失败 rollback. 这是 Phase 3 模块最复杂 transactional 路径.
    """
    # Resolve org
    org_q = select(Organization).where(Organization.slug == org_slug).limit(1)
    org = (await db.execute(org_q)).scalar_one_or_none()
    if org is None:
        raise NotFoundError("Organization", org_slug)

    try:
        # Find or create user — Phase 5: 按手机号查 (主登录字段)
        phone_norm = body.phone.strip()
        email_norm: str | None = str(body.email).strip().lower() if body.email else None
        u_q = select(User).where(User.phone == phone_norm).limit(1)
        u = (await db.execute(u_q)).scalar_one_or_none()
        if u is None:
            # 新手机号 → 建 user (phone 必填, email 可选)
            u = User(phone=phone_norm, email=email_norm, name=body.name)
            db.add(u)
            await db.flush()

        # Ensure user is org member (client role)
        m_q = (
            select(OrgMember)
            .where(and_(OrgMember.org_id == org.id, OrgMember.user_id == u.id))
            .limit(1)
        )
        existing_member = (await db.execute(m_q)).scalar_one_or_none()
        if existing_member is None:
            db.add(
                OrgMember(
                    org_id=org.id,
                    user_id=u.id,
                    role="client",
                    status="active",
                )
            )

        # 找咨询师列表 (auto-assign 仅当 1 名活跃咨询师时)
        c_q = select(OrgMember.user_id).where(
            and_(
                OrgMember.org_id == org.id,
                OrgMember.role == "counselor",
                OrgMember.status == "active",
            )
        )
        counselor_user_ids = [row[0] for row in (await db.execute(c_q)).all()]
        auto_assign = len(counselor_user_ids) == 1
        assign_to: uuid.UUID | None = counselor_user_ids[0] if auto_assign else None

        # preferred counselor (来自 query / link)
        preferred_uuid: uuid.UUID | None = None
        if body.counselor_id:
            preferred_uuid = parse_uuid_or_raise(body.counselor_id, field="counselorId")

        # 创建 intake
        intake = ServiceIntake(
            org_id=org.id,
            service_id=body.service_id,
            client_user_id=u.id,
            preferred_counselor_id=preferred_uuid,
            intake_source="counselor_referral" if body.counselor_id else "org_portal",
            intake_data={"phone": body.phone, "chiefComplaint": body.chief_complaint},
            status="assigned" if auto_assign else "pending",
            assigned_counselor_id=assign_to,
            assigned_at=datetime.now(UTC) if auto_assign else None,
        )
        db.add(intake)
        await db.flush()

        # auto-assigned: 建 client_assignment + 通知
        if auto_assign and assign_to is not None:
            db.add(
                ClientAssignment(
                    org_id=org.id,
                    client_id=u.id,
                    counselor_id=assign_to,
                    is_primary=True,
                )
            )
            db.add(
                Notification(
                    org_id=org.id,
                    user_id=assign_to,
                    type="new_intake",
                    title="新来访者咨询申请",
                    body=f"{body.name} 提交了咨询申请, 已自动分配给您。",
                )
            )
        else:
            # 否则通知所有 org_admin
            adm_q = select(OrgMember.user_id).where(
                and_(OrgMember.org_id == org.id, OrgMember.role == "org_admin")
            )
            admin_user_ids = [row[0] for row in (await db.execute(adm_q)).all()]
            extra_note = "(咨询师推荐)" if body.counselor_id else ""
            for admin_id in admin_user_ids:
                db.add(
                    Notification(
                        org_id=org.id,
                        user_id=admin_id,
                        type="new_intake",
                        title="新来访者咨询申请",
                        body=f"{body.name} 提交了咨询申请{extra_note}, 请前往协作中心分配。",
                    )
                )

        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return PublicIntakeResponse(
        intake_id=str(intake.id),
        status=intake.status,
        assigned_counselor_id=str(intake.assigned_counselor_id)
        if intake.assigned_counselor_id
        else None,
    )


# ─── Authenticated routes (org admin) ────────────────────────────


@intake_router.get("/", response_model=list[IntakeRow])
async def list_pending_intakes(
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[IntakeRow]:
    """列出待处理 intakes (org_admin only). 镜像 public-services.routes.ts:192-216."""
    _require_org_admin(org)
    assert org is not None

    q = (
        select(ServiceIntake, User.name, User.email)
        .join(User, User.id == ServiceIntake.client_user_id)
        .where(
            and_(
                ServiceIntake.org_id == parse_uuid_or_raise(org.org_id, field="orgId"),
                ServiceIntake.status == "pending",
            )
        )
        .order_by(ServiceIntake.created_at)
    )
    rows = (await db.execute(q)).all()
    out: list[IntakeRow] = []
    for intake, client_name, client_email in rows:
        out.append(
            IntakeRow(
                id=str(intake.id),
                org_id=str(intake.org_id),
                service_id=intake.service_id,
                client_user_id=str(intake.client_user_id),
                preferred_counselor_id=(
                    str(intake.preferred_counselor_id) if intake.preferred_counselor_id else None
                ),
                intake_source=intake.intake_source,
                intake_data=intake.intake_data or {},
                status=intake.status,
                assigned_counselor_id=(
                    str(intake.assigned_counselor_id) if intake.assigned_counselor_id else None
                ),
                assigned_at=intake.assigned_at,
                created_at=getattr(intake, "created_at", None),
                client_name=client_name,
                client_email=client_email,
            )
        )
    return out


@intake_router.post("/{intake_id}/assign", response_model=SuccessResponse)
async def assign_intake(
    org_id: str,
    intake_id: str,
    body: IntakeAssignRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SuccessResponse:
    """分配 intake 给咨询师 (org_admin only). 镜像 public-services.routes.ts:219-264."""
    _require_org_admin(org)
    assert org is not None

    intake_uuid = parse_uuid_or_raise(intake_id, field="intakeId")
    counselor_uuid = parse_uuid_or_raise(body.counselor_id, field="counselorId")
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")

    q = select(ServiceIntake).where(ServiceIntake.id == intake_uuid).limit(1)
    intake = (await db.execute(q)).scalar_one_or_none()
    if intake is None:
        raise NotFoundError("Intake", intake_id)

    intake.status = "assigned"
    intake.assigned_counselor_id = counselor_uuid
    intake.assigned_at = datetime.now(UTC)

    # client_assignment (UPSERT 等价 — Node 用 onConflictDoNothing, Python 这里查重再加)
    a_q = (
        select(ClientAssignment)
        .where(
            and_(
                ClientAssignment.org_id == org_uuid,
                ClientAssignment.client_id == intake.client_user_id,
                ClientAssignment.counselor_id == counselor_uuid,
            )
        )
        .limit(1)
    )
    if (await db.execute(a_q)).scalar_one_or_none() is None:
        db.add(
            ClientAssignment(
                org_id=org_uuid,
                client_id=intake.client_user_id,
                counselor_id=counselor_uuid,
                is_primary=True,
            )
        )

    db.add(
        Notification(
            org_id=org_uuid,
            user_id=counselor_uuid,
            type="case_assigned",
            title="新来访者分配",
            body="管理员为您分配了一位新来访者, 请查看交付中心。",
        )
    )

    await db.commit()

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="assign",
        resource="service_intakes",
        resource_id=str(intake_uuid),
        changes={"counselorId": {"old": None, "new": str(counselor_uuid)}},
        ip_address=request.client.host if request.client else None,
    )
    return SuccessResponse()


__all__ = ["intake_router", "public_router"]
