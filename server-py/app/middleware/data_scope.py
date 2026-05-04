"""
Data scope middleware (Phase 1.5)。

镜像 server/src/middleware/data-scope.ts (Node) 的 dataScopeGuard, 按 role +
orgType 决定当前请求的 ``DataScope`` (用于下游 require_action / authorize)。

逻辑分支 (与 Node data-scope.ts 1:1 对齐):

  1. ``user.is_system_admin`` → ``None`` (无 scope, 全局视图)
  2. 没 OrgContext → ``DataScope(type='none')``
  3. ``role='org_admin' AND org_type='enterprise'`` →
     ``DataScope(type='aggregate_only')`` (HR/EAP 合规硬隔离, 仅 eap_usage_events
     聚合, 不读临床)
  4. ``role='org_admin'`` (非 enterprise) OR
     ``role='counselor' AND full_practice_access`` →
     ``DataScope(type='all')`` (机构内全可见)
  5. 普通 ``role='counselor'`` → ``DataScope(type='assigned', allowed_client_ids=...)``
     allowed_client_ids = union of:
       a. own ``client_assignments`` (counselor_id = me)
       b. active ``client_access_grants`` (granted_to_counselor_id = me, not revoked,
          not expired)
       c. supervisees' ``client_assignments`` (counselor_id ∈ my supervisees)
  6. 其他 (client / 占位 hospital 角色等) → ``DataScope(type='none')``

Phase 1.5 实装注:
  ``_resolve_counselor_assignments`` 现在返回空 set —— ``client_assignments`` /
  ``client_access_grants`` 的 SQLAlchemy 模型在 Phase 2 才建。Phase 2 完成后,
  把那个 helper 改为真实 ORM ``select()`` 即可, 上层 ``resolve_data_scope`` /
  ``get_data_scope`` API 不变, 测试无需改。
"""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

DataScopeType = Literal["all", "assigned", "aggregate_only", "none"]


class DataScope(BaseModel):
    """
    当前请求的可见数据范围。

    ``type`` 含义:
      ``'all'``             机构内全可见 (sysadm / org_admin / 督导 fullPractice)
      ``'assigned'``        仅 ``allowed_client_ids`` 列出的 client (普通 counselor)
      ``'aggregate_only'``  仅看聚合 (HR / school_leader, 合规硬红线)
      ``'none'``            无可见 (新成员 / portal 自助 / 未知 role)
    """

    model_config = ConfigDict(frozen=True)

    type: DataScopeType
    allowed_client_ids: tuple[str, ...] = Field(default_factory=tuple)


# ─── 纯逻辑入口 (测试直接调用, 无 FastAPI 副作用) ──────────────────


async def resolve_data_scope(
    user: AuthUser,
    org: OrgContext | None,
    db: AsyncSession,
) -> DataScope | None:
    """
    按 role + orgType 决定 ``DataScope``。返回 ``None`` 表示 sysadm 全局, 不
    限定 scope。
    """
    if user.is_system_admin:
        return None

    if org is None:
        return DataScope(type="none")

    # 3. enterprise + org_admin → aggregate_only (HR PHI 隔离硬红线)
    if org.role == "org_admin" and org.org_type == "enterprise":
        return DataScope(type="aggregate_only")

    # 4. 非-enterprise org_admin / counselor + fullPractice → all
    if org.role == "org_admin" or (org.role == "counselor" and org.full_practice_access):
        return DataScope(type="all")

    # 5. 普通 counselor → assigned (3 表 union)
    if org.role == "counselor":
        client_ids = await _resolve_counselor_assignments(
            db=db,
            org_id=org.org_id,
            counselor_user_id=user.id,
            supervisee_user_ids=org.supervisee_user_ids,
        )
        # tuple 排序保证测试可重复 (set 顺序不固定)
        return DataScope(type="assigned", allowed_client_ids=tuple(sorted(client_ids)))

    # 6. client / 其他 → none (portal 路由自己做 self-only filtering)
    return DataScope(type="none")


# ─── Counselor 3-表查询 (Phase 2 ORM 后填实) ────────────────────


async def _resolve_counselor_assignments(
    db: AsyncSession,
    org_id: str,
    counselor_user_id: str,
    supervisee_user_ids: tuple[str, ...],
) -> set[str]:
    """
    Union 3 来源的 client_id, 给 counselor 用 (Phase 1.5 占位)。

    Phase 2 ORM 模型完整后, 替换为以下 select::

        from app.db.models.client_assignments import ClientAssignment
        from app.db.models.client_access_grants import ClientAccessGrant

        # 1. 自己被分派的
        own_q = select(ClientAssignment.client_id).where(
            ClientAssignment.org_id == org_id,
            ClientAssignment.counselor_id == counselor_user_id,
        )

        # 2. 活跃的临时授权
        now = datetime.now(timezone.utc)
        grant_q = select(ClientAccessGrant.client_id).where(
            ClientAccessGrant.org_id == org_id,
            ClientAccessGrant.granted_to_counselor_id == counselor_user_id,
            ClientAccessGrant.revoked_at.is_(None),
            (ClientAccessGrant.expires_at.is_(None))
                | (ClientAccessGrant.expires_at > now),
        )

        # 3. 督导下属的 (有 supervisees 才查)
        supervisee_q = select(ClientAssignment.client_id).where(
            ClientAssignment.org_id == org_id,
            ClientAssignment.counselor_id.in_(supervisee_user_ids),
        ) if supervisee_user_ids else None

        # union + dedupe
        result_ids: set[str] = set()
        for q in (own_q, grant_q, supervisee_q):
            if q is None:
                continue
            result = await db.execute(q)
            result_ids.update(result.scalars().all())
        return result_ids

    Phase 1.5 阶段返回空 set —— role 路由完整, counselor 的实际 allowed_client_ids
    在 Phase 2 接 ORM 后才填。集成测试 (Phase 2 起加) 会捕捉这块。
    """
    # 参数被 referenced 让 lint 不警告 (Phase 2 替换时这些就是 select 的过滤项)
    _ = (db, org_id, counselor_user_id, supervisee_user_ids)
    return set()


# ─── FastAPI Dependency (替换 1.4 的 stub) ──────────────────────


async def get_data_scope(
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DataScope | None:
    """
    FastAPI Dependency. 测试用 ``app.dependency_overrides[get_data_scope]`` 注入,
    或者直接 await ``resolve_data_scope(user, org, db)`` 跳过 dep 注入。
    """
    return await resolve_data_scope(user, org, db)
