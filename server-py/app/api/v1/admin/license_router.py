"""
Admin license router — 镜像 ``server/src/modules/admin/admin-license.routes.ts`` (234 行).

挂在 ``/api/admin/licenses`` prefix. 5 个 endpoint:

  GET  /         — 全 org 列表 + 当前 license status
  POST /issue    — 颁发 license (sysadm only)
  POST /renew    — 续期 (基于现有 license, 延期数月)
  POST /modify   — 改 tier / maxSeats (保持 expiry)
  POST /revoke   — 撤销 license

**Phase 3 阶段实装注:**
  Node 端 ``server/src/lib/license/{sign,verify}.ts`` 是 RSA + JWT 签名 (asymmetric:
  servern 用 private key 签, client (org_context middleware) 用 public key 验). 这条
  非 trivial 的密码学路径 Phase 5 单独 ticket 接 (与 ``app/middleware/org_context.py``
  + ``app/api/v1/org/license_router.py`` 的 stub 注释保持一致).

  当前 stub:
    - issue: 生成 ``license_v3:{org_id}:{tier}:{maxSeats}:{expiresAt}`` 字符串作为 token,
      持久化到 ``organizations.license_key``. 任何下游验证 (Phase 5 接 verify) 看到
      非 JWT 形态会按 'invalid' 走, 但当前阶段 org_context 也是 stub, 行为等价.
    - renew: 读现有 license_key 解析 expiresAt (失败按 now 起算), 加 months 延期.
    - modify: 解析 tier / maxSeats 改, expiresAt 不变.
    - revoke: license_key=NULL.

  下游 admin-dashboard / org_context.tier 推导都不依赖 license_key 内容 (Phase 3 用 plan
  推 tier), 所以这个 stub 不会破其他模块.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.admin.schemas import (
    LicenseIssueRequest,
    LicenseIssueResponse,
    LicenseListRow,
    LicenseModifyRequest,
    LicenseRenewRequest,
    LicenseRevokeRequest,
    LicenseStatusInfo,
    SuccessResponse,
)
from app.core.database import get_db
from app.db.models.org_members import OrgMember
from app.db.models.organizations import Organization
from app.lib.errors import ForbiddenError, NotFoundError, ValidationError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user

router = APIRouter()

VALID_TIERS = ("starter", "growth", "flagship")

# Plan 与 tier 互推 (与 admin-license.routes.ts:204 / admin-tenant.routes.ts:167 一致)
_TIER_TO_PLAN = {
    "starter": "free",
    "growth": "pro",
    "flagship": "enterprise",
    # 兼容历史 tier 字符串
    "solo": "free",
    "team": "pro",
    "enterprise": "enterprise",
    "platform": "platform",
}


def _require_system_admin(user: AuthUser) -> None:
    if not user.is_system_admin:
        raise ForbiddenError("system admin only")


# ─── License token stub (Phase 3 — Phase 5 接真实 RSA/JWT) ───────────


def _stub_token_payload(
    *,
    org_id: str,
    tier: str,
    max_seats: int,
    expires_at: datetime,
    issued_at: datetime,
) -> str:
    """Phase 3 stub token — encode 为可解析字符串 (非 JWT, 但能 round-trip 出 expiry).

    格式: ``license_v3|{org_id}|{tier}|{maxSeats}|{expiresAtISO}|{issuedAtISO}``

    用 ``|`` 分隔 — ISO 8601 datetime 含 ``:`` 与 ``+`` 但绝不含 ``|``, 解析无歧义.
    Phase 5 接真 RSA/JWT 时此格式整体替换.
    """
    return (
        f"license_v3|{org_id}|{tier}|{max_seats}|{expires_at.isoformat()}|{issued_at.isoformat()}"
    )


def _parse_stub_token(token: str | None) -> dict[str, Any] | None:
    """从 stub token 还原 payload — 给 renew / modify 用.

    返回 dict 或 None (token 非本格式 — 之前手工写入或 Phase 5 真 JWT).
    """
    if not token or not token.startswith("license_v3|"):
        return None
    parts = token.split("|", 5)
    # parts: ['license_v3', org_id, tier, max_seats, expiresAtISO, issuedAtISO]
    if len(parts) < 6:
        return None
    try:
        return {
            "org_id": parts[1],
            "tier": parts[2],
            "max_seats": int(parts[3]),
            "expires_at": parts[4],
            "issued_at": parts[5],
        }
    except (ValueError, TypeError):
        return None


def _verify_token(license_key: str | None) -> LicenseStatusInfo:
    """Phase 3 stub — 镜像 ``verifyLicense`` 返回的 status / payload 字段.

    对非空 key 一律返回 status='active' + 解析 stub payload (若是 stub 格式).
    Phase 5 接真实 RSA/JWT 验证后此函数被替换.
    """
    if not license_key:
        return LicenseStatusInfo(status="none")

    payload = _parse_stub_token(license_key)
    if payload is None:
        # 非 stub 格式 (老数据 / 手写) — Phase 3 视作 active 但没具体 payload,
        # 让前端不至于因 missing tier 崩.
        return LicenseStatusInfo(status="active")

    return LicenseStatusInfo(
        status="active",
        tier=payload["tier"],
        max_seats=payload["max_seats"],
        expires_at=payload["expires_at"],
        issued_at=payload["issued_at"],
    )


# ─── List — admin-license.routes.ts:27-78 ────────────────────────────


@router.get("/", response_model=list[LicenseListRow])
async def list_licenses(
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[LicenseListRow]:
    """全 org + license status 列表 (sysadm only).

    镜像 admin-license.routes.ts:27-78. 优化: orgs + memberCount group_by 分两 query.
    """
    _require_system_admin(user)

    orgs_q = select(
        Organization.id,
        Organization.name,
        Organization.slug,
        Organization.plan,
        Organization.license_key,
        Organization.created_at,
    ).order_by(Organization.created_at)
    orgs = (await db.execute(orgs_q)).all()

    member_q = (
        select(OrgMember.org_id, func.count().label("cnt"))
        .where(OrgMember.status == "active")
        .group_by(OrgMember.org_id)
    )
    member_rows = (await db.execute(member_q)).all()
    count_map = {r.org_id: int(r.cnt or 0) for r in member_rows}

    out: list[LicenseListRow] = []
    for org in orgs:
        out.append(
            LicenseListRow(
                org_id=str(org.id),
                org_name=org.name,
                org_slug=org.slug,
                plan=org.plan or "free",
                member_count=count_map.get(org.id, 0),
                license=_verify_token(org.license_key),
            )
        )
    return out


# ─── Issue — admin-license.routes.ts:81-131 ──────────────────────────


@router.post("/issue", response_model=LicenseIssueResponse)
async def issue_license(
    body: LicenseIssueRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LicenseIssueResponse:
    """颁发 license (sysadm only). 镜像 admin-license.routes.ts:81-131.

    Phase 3 stub: token 是 ``license_v3:`` 格式字符串, 持久化到 organizations.license_key.
    """
    _require_system_admin(user)

    if body.tier not in VALID_TIERS:
        raise ValidationError(f"tier must be one of: {', '.join(VALID_TIERS)}")

    valid_from: datetime
    if body.valid_from:
        try:
            valid_from = datetime.fromisoformat(body.valid_from.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValidationError("validFrom must be a valid ISO date") from exc
    else:
        valid_from = datetime.now(UTC)

    org_uuid = parse_uuid_or_raise(body.org_id, field="orgId")
    q = select(Organization).where(Organization.id == org_uuid).limit(1)
    org = (await db.execute(q)).scalar_one_or_none()
    if org is None:
        raise NotFoundError("Organization", body.org_id)

    issued_at = datetime.now(UTC)
    # months → expires_at: approximate, 30 天 / 月 (与 Node ``setMonth(+months)`` 行为相近).
    # Node 用 setMonth, dateutil-like 精确; Python 端简化 30d/月. Phase 5 接真 sign 时换实现.
    expires_at = valid_from + timedelta(days=30 * body.months)

    token = _stub_token_payload(
        org_id=body.org_id,
        tier=body.tier,
        max_seats=body.max_seats,
        expires_at=expires_at,
        issued_at=issued_at,
    )

    org.license_key = token
    org.plan = _TIER_TO_PLAN.get(body.tier, org.plan or "free")
    org.updated_at = datetime.now(UTC)

    await db.commit()

    await record_audit(
        db=db,
        org_id=None,  # 与 Node 一致: admin-license 无 orgContextGuard, org_id NULL,
        user_id=user.id,
        action="license.issued",
        resource="organization",
        resource_id=body.org_id,
        ip_address=request.client.host if request.client else None,
    )

    return LicenseIssueResponse(
        success=True,
        token=token,
        tier=body.tier,
        max_seats=body.max_seats,
        expires_at=expires_at.isoformat(),
        issued_at=issued_at.isoformat(),
    )


# ─── Renew — admin-license.routes.ts:134-174 ─────────────────────────


@router.post("/renew", response_model=LicenseIssueResponse)
async def renew_license(
    body: LicenseRenewRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LicenseIssueResponse:
    """续期 license (保持 tier/maxSeats, 延 months).

    镜像 admin-license.routes.ts:134-174. BUG-003 fix: 从 max(now, oldExpiry) 起算,
    早续不丢未用天数 (与 Node 一致).
    """
    _require_system_admin(user)

    org_uuid = parse_uuid_or_raise(body.org_id, field="orgId")
    q = select(Organization).where(Organization.id == org_uuid).limit(1)
    org = (await db.execute(q)).scalar_one_or_none()
    if org is None:
        raise NotFoundError("Organization", body.org_id)
    if not org.license_key:
        raise ValidationError("Organization has no active license to renew")

    payload = _parse_stub_token(org.license_key)
    if payload is None:
        raise ValidationError("Current license is invalid, issue a new one instead")

    now = datetime.now(UTC)
    try:
        old_expiry = datetime.fromisoformat(str(payload["expires_at"]).replace("Z", "+00:00"))
    except (ValueError, TypeError) as exc:
        raise ValidationError("Current license has invalid expiresAt") from exc

    base_date = old_expiry if old_expiry > now else now
    new_expiry = base_date + timedelta(days=30 * body.months)
    issued_at = now

    token = _stub_token_payload(
        org_id=body.org_id,
        tier=payload["tier"],
        max_seats=int(payload["max_seats"]),
        expires_at=new_expiry,
        issued_at=issued_at,
    )

    org.license_key = token
    org.updated_at = now
    await db.commit()

    await record_audit(
        db=db,
        org_id=None,
        user_id=user.id,
        action="license.renewed",
        resource="organization",
        resource_id=body.org_id,
        ip_address=request.client.host if request.client else None,
    )

    return LicenseIssueResponse(
        success=True,
        token=token,
        tier=payload["tier"],
        max_seats=int(payload["max_seats"]),
        expires_at=new_expiry.isoformat(),
        issued_at=issued_at.isoformat(),
    )


# ─── Modify — admin-license.routes.ts:177-214 ────────────────────────


@router.post("/modify", response_model=LicenseIssueResponse)
async def modify_license(
    body: LicenseModifyRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LicenseIssueResponse:
    """改 tier / maxSeats (保持 expires_at). 镜像 admin-license.routes.ts:177-214."""
    _require_system_admin(user)

    org_uuid = parse_uuid_or_raise(body.org_id, field="orgId")
    q = select(Organization).where(Organization.id == org_uuid).limit(1)
    org = (await db.execute(q)).scalar_one_or_none()
    if org is None:
        raise NotFoundError("Organization", body.org_id)
    if not org.license_key:
        raise ValidationError("Organization has no active license to modify")

    payload = _parse_stub_token(org.license_key)
    if payload is None:
        raise ValidationError("Current license is invalid, issue a new one instead")

    new_tier = body.tier if (body.tier and body.tier in VALID_TIERS) else payload["tier"]
    new_seats = (
        body.max_seats if (body.max_seats and body.max_seats >= 1) else int(payload["max_seats"])
    )
    expires_at_str = str(payload["expires_at"])
    try:
        expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValidationError("Current license has invalid expiresAt") from exc

    issued_at = datetime.now(UTC)

    token = _stub_token_payload(
        org_id=body.org_id,
        tier=new_tier,
        max_seats=new_seats,
        expires_at=expires_at,
        issued_at=issued_at,
    )

    org.license_key = token
    # Sync plan column (与 Node admin-license.routes.ts:204-208 一致)
    org.plan = _TIER_TO_PLAN.get(new_tier, "free")
    org.updated_at = issued_at
    await db.commit()

    await record_audit(
        db=db,
        org_id=None,
        user_id=user.id,
        action="license.modified",
        resource="organization",
        resource_id=body.org_id,
        ip_address=request.client.host if request.client else None,
    )

    return LicenseIssueResponse(
        success=True,
        token=token,
        tier=new_tier,
        max_seats=new_seats,
        expires_at=expires_at.isoformat(),
        issued_at=issued_at.isoformat(),
    )


# ─── Revoke — admin-license.routes.ts:217-233 ────────────────────────


@router.post("/revoke", response_model=SuccessResponse)
async def revoke_license(
    body: LicenseRevokeRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SuccessResponse:
    """撤销 license — license_key=NULL. 镜像 admin-license.routes.ts:217-233."""
    _require_system_admin(user)

    org_uuid = parse_uuid_or_raise(body.org_id, field="orgId")
    q = select(Organization).where(Organization.id == org_uuid).limit(1)
    org = (await db.execute(q)).scalar_one_or_none()
    if org is None:
        raise NotFoundError("Organization", body.org_id)

    org.license_key = None
    org.updated_at = datetime.now(UTC)
    await db.commit()

    await record_audit(
        db=db,
        org_id=None,
        user_id=user.id,
        action="license.revoked",
        resource="organization",
        resource_id=body.org_id,
        ip_address=request.client.host if request.client else None,
    )

    return SuccessResponse()


__all__ = ["router"]
