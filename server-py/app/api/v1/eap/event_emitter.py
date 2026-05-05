"""
EAP Usage Event emitter — 镜像 ``server/src/modules/eap/eap-event-emitter.ts`` (88 行)。

供其它业务模块在适当时机调用 (e.g. assessment/session/course 完成后), 把事件
落到 ``eap_usage_events`` 表 — HR analytics 走的就是这张表 (聚合, 不读 PHI)。

这个 module **只写** ``eap_usage_events``, **绝不读** clinical 数据 — 维持
EAP 物理隐私边界 (Phase 5+ 业务侧 hooks 接入时仍守此边界)。

Phase 3 Tier 3 阶段 stub:
  - ``emit_eap_event(...)`` 函数签名稳定, 内部 fire-and-forget (绝不抛, 不阻塞 caller)
  - 业务侧 hooks (assessment.complete / session.book / etc.) Phase 5 接入时无需改 caller
  - org_type cache (5 min TTL) 与 Node 一致 — 避免每次事件都去查 organizations 表
"""

from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.eap_employee_profiles import EAPEmployeeProfile
from app.db.models.eap_usage_events import EAPUsageEvent
from app.db.models.organizations import Organization

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class EmitEventParams:
    """``emit_eap_event`` 入参 — 与 Node ``EmitEventParams`` interface 等价."""

    org_id: str
    event_type: str
    user_id: str | None = None
    risk_level: str | None = None
    metadata: dict[str, Any] | None = None


# org_type cache (5 min TTL) — 与 Node ``orgTypeCache`` 行为一致.
# 每次 emit 都查 organizations 太费; 缓存 (org_id → orgType) 5 分钟即可.
_CACHE_TTL_SECONDS = 5 * 60
_org_type_cache: dict[str, tuple[str, float]] = {}


async def _is_enterprise_org(db: AsyncSession, org_id: str) -> bool:
    """检查 org 是否为 enterprise 类型, 5 分钟缓存. 镜像 Node ``isEnterpriseOrg``."""
    now = time.time()
    cached = _org_type_cache.get(org_id)
    if cached and cached[1] > now:
        return cached[0] == "enterprise"

    try:
        org_uuid = uuid.UUID(org_id)
    except (ValueError, TypeError):
        return False

    try:
        q = select(Organization.settings).where(Organization.id == org_uuid).limit(1)
        row = (await db.execute(q)).first()
        if row is None:
            return False
        settings: dict[str, Any] = row[0] or {}
        org_type: str = settings.get("orgType", "counseling")
        _org_type_cache[org_id] = (org_type, now + _CACHE_TTL_SECONDS)
        return org_type == "enterprise"
    except Exception:
        return False


async def emit_eap_event(db: AsyncSession, params: EmitEventParams) -> None:
    """
    给 enterprise org 写一行 ``eap_usage_events``.

    非 enterprise org → no-op. **fire-and-forget**: 绝不抛异常, 也不阻塞 caller —
    任何 DB 错只 log warning, 业务请求继续 (镜像 Node 行为, 数据写失败不影响主流程).

    Args:
        db:     SQLAlchemy async session
        params: ``EmitEventParams``
    """
    try:
        if not await _is_enterprise_org(db, params.org_id):
            return

        try:
            org_uuid = uuid.UUID(params.org_id)
        except (ValueError, TypeError):
            return

        # 查员工 department (有 user_id 时), 用于按部门统计
        department: str | None = None
        if params.user_id:
            try:
                user_uuid = uuid.UUID(params.user_id)
            except (ValueError, TypeError):
                user_uuid = None
            if user_uuid is not None:
                pq = (
                    select(EAPEmployeeProfile.department)
                    .where(
                        and_(
                            EAPEmployeeProfile.org_id == org_uuid,
                            EAPEmployeeProfile.user_id == user_uuid,
                        )
                    )
                    .limit(1)
                )
                row = (await db.execute(pq)).first()
                department = row[0] if row else None

        ev = EAPUsageEvent(
            enterprise_org_id=org_uuid,
            event_type=params.event_type,
            user_id=uuid.UUID(params.user_id) if params.user_id else None,
            department=department,
            risk_level=params.risk_level,
            metadata_=params.metadata or {},
        )
        db.add(ev)
        # 不 commit — 让外层 caller 决定 transaction 边界 (与 Node 行为不同, Node 自己 commit;
        # FastAPI 通常 caller 已在事务里, fire-and-forget 写更安全.) 注意: 如果 caller 不
        # commit, 这条事件会随其它 commit 一起落库, 与 Node 等价.
    except Exception:
        logger.warning(
            "emit_eap_event failed: org_id=%s type=%s",
            params.org_id,
            params.event_type,
            exc_info=True,
        )


def _clear_org_type_cache() -> None:
    """测试用 — 清空 org_type cache."""
    _org_type_cache.clear()


__all__ = ["EmitEventParams", "emit_eap_event"]
