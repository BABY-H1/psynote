"""
Org context middleware (Phase 1.6).

镜像 server/src/middleware/org-context.ts (Node) 的 orgContextGuard。从请求
路径参数 ``org_id`` 解析当前组织上下文 + 校验成员资格 + 派生 role_v2 /
data_classes / supervisor / supervisee 链, 给下游 (data_scope / authorize /
phi_access) 用。

逻辑分支:

  1. ``org_id is None`` → ``None`` (路由没 path param, e.g. /me 类)
  2. ``org_id`` 不是 UUID 形态 → ``HTTPException(404)`` (与 Node 一致, 防
     Postgres "invalid input syntax" 暴 500)
  3. ``user.is_system_admin`` 且 org 存在 → 合成 OrgContext (role=org_admin,
     full_practice_access=True, 当前 org 的 tier/orgType)
  4. 非 sysadm 不是成员 → ``HTTPException(403, 'not_a_member')``
  5. 非 sysadm 成员过期 (valid_until < now) → ``HTTPException(403,
     'membership_expired')``
  6. 非 sysadm 正常 → 组装 OrgContext:
     - role_v2: ``member.role_v2 ?? legacy_role_to_v2(org_type, legacy_role)``
     - full_practice_access: ``member.full_practice_access ?? (legacy_role ==
       'org_admin')`` (NULL 才回落到 role 默认; 显式 False 保留 False)
     - is_supervisor: ``role_v2 ∈ supervisor-class`` OR ``(counselor +
       full_practice_access)``
     - allowed_data_classes: ``ROLE_DATA_CLASS_POLICY[role_v2] ∪
       access_profile.dataClasses``
     - principal_class: ``member.principal_class ?? principal_of(role_v2)``
     - tier: 由 license + plan 推 (Phase 1.6 暂跳 license JWT 验证, 用 plan)

Phase 1.6 实装注:
  3 个 DB helper (``_load_org_row`` / ``_load_member_row`` /
  ``_load_supervisee_user_ids``) 现在返回 None / 空 (Phase 2 ORM 模型完整后
  替换为真实 select)。tests 用 ``monkeypatch.setattr`` 把 helper mock 成具体
  行, 验证组装逻辑。

  License JWT 验证 (server/src/lib/license/verify.ts 是 RSA 签名 + JWT)
  没 port — Phase X TBD ticket。Phase 1.6 阶段所有 license 按 'no license'
  走, tier 由 plan_to_tier(plan) 推。
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any, cast
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field, computed_field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import AuthUser, get_current_user
from app.shared.data_class import ROLE_DATA_CLASS_POLICY, DataClass
from app.shared.principal import Principal
from app.shared.roles import LegacyRole, RoleV2, legacy_role_to_v2, principal_of
from app.shared.tier import OrgTier, OrgType, plan_to_tier

# ─── Models ─────────────────────────────────────────────────────


class LicenseInfo(BaseModel):
    """License 校验结果 (镜像 packages/shared/src/types/tier.ts LicenseInfo)。"""

    model_config = ConfigDict(frozen=True)

    status: str  # 'active' | 'expired' | 'invalid' | 'none'
    max_seats: int | None = None
    expires_at: str | None = None  # ISO8601 字符串


class OrgContext(BaseModel):
    """
    当前请求的 org 成员上下文。Phase 1.6 (resolve_org_context) 从 ``org_members``
    + ``access_profile`` + ``organizations`` 三表读出来 + 派生计算字段填充。

    role 用 legacy 枚举 (``org_admin`` / ``counselor`` / ``client``) 与 Node
    端 ``request.org.role`` 兼容; ``role_v2`` 是新枚举 (RoleV2), 优先生效。

    `is_supervisor` / `principal_class` 是 ``@computed_field`` 派生属性 —
    根据 ``role_v2`` + ``full_practice_access`` 即时计算, 防止存储字段与
    role_v2 漂移。如果 DB 有显式 ``principal_class`` 列 (proxy 账号特殊
    身份), 通过 ``principal_class_override`` 注入。
    """

    model_config = ConfigDict(frozen=True)

    org_id: str
    org_type: OrgType
    role: LegacyRole  # 'org_admin' | 'counselor' | 'client'
    role_v2: RoleV2
    member_id: str
    supervisor_id: str | None = None
    full_practice_access: bool = False
    supervisee_user_ids: tuple[str, ...] = Field(default_factory=tuple)
    guardian_of_user_ids: tuple[str, ...] = Field(default_factory=tuple)
    # ROLE_DATA_CLASS_POLICY[role_v2] ∪ access_profile.dataClasses
    allowed_data_classes: tuple[DataClass, ...] | None = None
    tier: OrgTier
    license: LicenseInfo
    # 仅当 DB 显式标了 principal_class (e.g. proxy 账号) 时注入, 否则 None;
    # 通过 .principal_class computed_field 透出 (override 优先, 否则 principal_of(role_v2))
    principal_class_override: Principal | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_supervisor(self) -> bool:
        """
        派生: role_v2 在 supervisor-class OR (legacy counselor + fullPractice)。
        与 Node org-context.ts:219-225 同语义。

        是 computed 而非存储字段 — 派生自 role_v2 + full_practice_access, 防漂移。
        """
        return self.role_v2 in _SUPERVISOR_LIKE_ROLES_V2 or (
            self.role == "counselor" and self.full_practice_access
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def principal_class(self) -> Principal:
        """显式 override 优先 (proxy 等), 否则 principal_of(role_v2)。"""
        return self.principal_class_override or principal_of(self.role_v2)


# ─── 常量 ────────────────────────────────────────────────────────


_NO_LICENSE = LicenseInfo(status="none")

# role_v2 表示 supervisor 等级 (与 Node org-context.ts:219-225 一致)
_SUPERVISOR_LIKE_ROLES_V2: frozenset[str] = frozenset(
    {"supervisor", "clinic_admin", "psychologist", "school_admin", "owner"}
)


# ─── HTTPException factories ────────────────────────────────────


def _not_found(detail: str = "Organization not found") -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def _forbidden(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


# ─── DB query helper stubs (Phase 2 ORM 后填实) ──────────────────


async def _load_org_row(db: AsyncSession, org_id: str) -> dict[str, Any] | None:
    """
    Phase 2 实装::

        from app.db.models.organizations import Organization
        result = await db.execute(
            select(Organization.id, Organization.plan, Organization.license_key,
                   Organization.settings).where(Organization.id == org_id)
        )
        row = result.first()
        if not row: return None
        return {"id": row.id, "plan": row.plan, "license_key": row.license_key,
                "settings": row.settings}
    """
    _ = (db, org_id)
    return None


async def _load_member_row(db: AsyncSession, org_id: str, user_id: str) -> dict[str, Any] | None:
    """
    Phase 2 实装::

        from app.db.models.org_members import OrgMember
        result = await db.execute(
            select(OrgMember).where(
                OrgMember.org_id == org_id,
                OrgMember.user_id == user_id,
                OrgMember.status == 'active',
            )
        )
        row = result.first()
        if not row: return None
        # 转 dict 让 resolve_org_context 内部不依赖具体 ORM 类型
        return {field: getattr(row, field) for field in (
            'id', 'user_id', 'org_id', 'role', 'role_v2', 'full_practice_access',
            'access_profile', 'supervisor_id', 'valid_until', 'principal_class',
            'status',
        )}
    """
    _ = (db, org_id, user_id)
    return None


async def _load_supervisee_user_ids(
    db: AsyncSession, member_id: str, org_id: str
) -> tuple[str, ...]:
    """
    Phase 2 实装::

        from app.db.models.org_members import OrgMember
        result = await db.execute(
            select(OrgMember.user_id).where(
                OrgMember.supervisor_id == member_id,
                OrgMember.org_id == org_id,
                OrgMember.status == 'active',
            )
        )
        return tuple(result.scalars().all())
    """
    _ = (db, member_id, org_id)
    return ()


# ─── Tier 推导 (Phase 1.6 跳 license JWT 验证) ───────────────────


async def _resolve_tier(
    org_id: str,
    license_key: str | None,
    db_plan: str | None,
) -> tuple[OrgTier, LicenseInfo]:
    """
    Phase 1.6: lib/license/verify (RSA + JWT) 没 port, 一律按 'no license'
    走, tier 由 plan 推。Phase X TBD: 加入 license 验证后, 这里走 license
    优先 / 过期降级 / 无效回落 三分支 (与 Node org-context.ts:resolveTier 一致)。
    """
    _ = (org_id, license_key)
    return plan_to_tier(db_plan), _NO_LICENSE


# ─── Pure logic entry ────────────────────────────────────────────


async def resolve_org_context(
    user: AuthUser,
    org_id: str | None,
    db: AsyncSession,
) -> OrgContext | None:
    """
    根据 user + org_id 返回 OrgContext。无 org_id → None。非法 UUID / 不是
    成员 / 成员过期 等异常路径抛 HTTPException, 由 FastAPI 直接转 HTTP 响应。
    """
    if org_id is None:
        return None

    # UUID 校验 — stdlib 比手写正则可读且少一份维护点 (与 Node 行为一致:
    # 非 UUID 形态先 404, 防 Postgres "invalid input syntax" 暴 500)
    try:
        UUID(org_id)
    except ValueError as exc:
        raise _not_found() from exc

    if user.is_system_admin:
        return await _build_sysadm_context(org_id, db)

    return await _build_member_context(user, org_id, db)


async def _build_sysadm_context(org_id: str, db: AsyncSession) -> OrgContext:
    """sysadm 合成 org_admin 身份 + 当前 org 的 tier / orgType (与 Node 一致)。"""
    org_row = await _load_org_row(db, org_id)
    if org_row is None:
        raise _not_found()

    org_settings: dict[str, Any] = org_row.get("settings") or {}
    org_type: OrgType = org_settings.get("orgType", "counseling")
    tier, license_info = await _resolve_tier(
        org_id, org_row.get("license_key"), org_row.get("plan")
    )

    role_v2 = cast("RoleV2", legacy_role_to_v2(org_type, "org_admin"))
    policy_classes = ROLE_DATA_CLASS_POLICY.get(role_v2, ())

    # is_supervisor / principal_class 走 computed_field 自动派生
    return OrgContext(
        org_id=org_id,
        org_type=org_type,
        role="org_admin",
        role_v2=role_v2,
        member_id="system-admin",
        supervisor_id=None,
        full_practice_access=True,
        supervisee_user_ids=(),
        guardian_of_user_ids=(),
        allowed_data_classes=tuple(policy_classes),
        tier=tier,
        license=license_info,
    )


async def _build_member_context(user: AuthUser, org_id: str, db: AsyncSession) -> OrgContext:
    """非 sysadm: 查 member, 校验 membership, 拼字段。"""
    member = await _load_member_row(db, org_id, user.id)
    if member is None:
        raise _forbidden("not_a_member")

    valid_until = member.get("valid_until")
    if valid_until is not None and valid_until < datetime.now(tz=UTC):
        raise _forbidden("membership_expired")

    legacy_role: str = member.get("role") or "client"

    # supervisees 仅 counselor / org_admin 才查 (与 Node org-context.ts:187 一致)
    supervisee_user_ids: tuple[str, ...] = ()
    if legacy_role in ("counselor", "org_admin"):
        supervisee_user_ids = await _load_supervisee_user_ids(db, member["id"], org_id)

    org_row = await _load_org_row(db, org_id)
    if org_row is None:
        raise _not_found()

    org_settings: dict[str, Any] = org_row.get("settings") or {}
    org_type: str = org_settings.get("orgType", "counseling")
    tier, license_info = await _resolve_tier(
        org_id, org_row.get("license_key"), org_row.get("plan")
    )

    # full_practice_access: NULL → 走 role 默认 (org_admin → True). 显式 True/False 透传
    fpa_raw = member.get("full_practice_access")
    fpa: bool = (legacy_role == "org_admin") if fpa_raw is None else bool(fpa_raw)

    # role_v2: 显式优先, 空 fall back to legacy_role_to_v2
    role_v2: str = member.get("role_v2") or legacy_role_to_v2(org_type, legacy_role)

    # is_supervisor: 派生自 role_v2 OR (counselor + full_practice_access)
    is_supervisor: bool = role_v2 in _SUPERVISOR_LIKE_ROLES_V2 or (
        legacy_role == "counselor" and fpa
    )

    # allowed_data_classes = ROLE_DATA_CLASS_POLICY[role_v2] ∪ access_profile.dataClasses
    policy_classes = ROLE_DATA_CLASS_POLICY.get(role_v2, ())
    access_profile: dict[str, Any] = member.get("access_profile") or {}
    profile_extras: list[str] = access_profile.get("dataClasses") or []
    allowed_data_classes: tuple[str, ...] = tuple(sorted(set(policy_classes) | set(profile_extras)))

    # principal_class: 显式优先 (e.g. proxy 账号), 空 fall back to principal_of(role_v2)
    principal_class: str = member.get("principal_class") or principal_of(role_v2)

    return OrgContext(
        org_id=org_id,
        org_type=org_type,
        role=legacy_role,
        role_v2=role_v2,
        member_id=member["id"],
        supervisor_id=member.get("supervisor_id"),
        full_practice_access=fpa,
        is_supervisor=is_supervisor,
        supervisee_user_ids=supervisee_user_ids,
        guardian_of_user_ids=(),  # Phase X (proxy 流水线) 接入
        allowed_data_classes=allowed_data_classes,
        tier=tier,
        license=license_info,
        principal_class=principal_class,
    )


# ─── FastAPI Dependency (替换 Phase 1.4 的 stub) ────────────────


async def get_org_context(
    user: Annotated[AuthUser, Depends(get_current_user)],
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrgContext | None:
    """
    FastAPI Dependency. 从 ``request.path_params['org_id']`` 抽 org_id, 调
    ``resolve_org_context``。

    路由层声明 ``{org_id}`` path 参数后, FastAPI 会自动填到 path_params。无
    path 参 → resolve 返 None, 下游 require_action 顶部判 None 决定行为。
    """
    org_id = request.path_params.get("org_id")
    return await resolve_org_context(user, org_id, db)
