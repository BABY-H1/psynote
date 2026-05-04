"""
PHI access logging utility (Phase 1.7).

镜像 server/src/middleware/audit.ts (Node) 的 ``logPhiAccess``。

每次路由层 materialize PHI (e.g. 给 counselor 渲染 case note 全文) 时, 调用
``record_phi_access`` 记录一行 ``phi_access_logs``。这是 HIPAA / 国内行业
合规 audit trail 的硬要求 — 必须能回答 "谁在什么时候看了哪个来访者的什么
临床数据"。

设计原则:
  1. **手动调用**, 不是 ``_do_authorize`` 自动做。authorize 只决定 "能否
     看", 不知道 "实际看了"。同一个 authorize pass 下游可能只读 metadata
     不读 PHI 全文。让路由 handler 在真渲染 PHI 数据时显式调本函数, 与
     Node 一致 (audit.ts 是 utility 不是 middleware)。

  2. **Audit fail 不破主请求**: PHI log 写失败 (DB 连接断 / 表暂不存在)
     必须 swallow + log error, 不让用户看到 500。这与 HIPAA 设计哲学的
     "audit trail must not block care" 一致。

Phase 1.7 阶段: ``_write_phi_log`` 是 no-op 占位 (Phase 2 ORM 模型完整后
填 INSERT phi_access_logs 表)。函数签名稳定, 路由层提前接入不会 break。

用法 (Phase 3+ 路由层)::

    from app.middleware.phi_access import record_phi_access

    @router.get("/notes/{note_id}", dependencies=[Depends(require_action(...))])
    async def get_note(
        note_id: str,
        request: Request,
        user: AuthUser = Depends(get_current_user),
        org: OrgContext = Depends(get_org_context),
        db: AsyncSession = Depends(get_db),
    ):
        note = await fetch_note(db, note_id)
        await record_phi_access(
            db=db,
            org_id=org.org_id,
            user_id=user.id,
            client_id=note.client_id,
            resource="case_note",
            action="view",
            resource_id=note.id,
            data_class="phi_full",
            actor_role_snapshot=org.role_v2,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
        return note
"""

from __future__ import annotations

import logging
from typing import Any, Literal

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

PhiAction = Literal["view", "export", "print", "share"]


async def record_phi_access(
    *,
    db: AsyncSession,
    org_id: str,
    user_id: str,
    client_id: str,
    resource: str,
    action: PhiAction,
    resource_id: str | None = None,
    reason: str | None = None,
    data_class: str | None = None,
    actor_role_snapshot: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    """
    写一行 phi_access_logs。任何错误吞掉 + log, 不让审计失败阻塞主请求。

    keyword-only 防参数顺序错位 (10 个 string 字段易混)。
    """
    log_entry: dict[str, Any] = {
        "org_id": org_id,
        "user_id": user_id,
        "client_id": client_id,
        "resource": resource,
        "resource_id": resource_id,
        "action": action,
        "reason": reason,
        "data_class": data_class,
        "actor_role_snapshot": actor_role_snapshot,
        "ip_address": ip_address,
        "user_agent": user_agent,
    }
    try:
        await _write_phi_log(db, log_entry)
    except Exception:
        # 审计写失败必须不破主请求 — 与 Node audit.ts:71 一致。stack trace
        # 走 logger, 后续告警系统从日志拉。
        logger.exception(
            "Failed to write PHI access log: org_id=%s user_id=%s resource=%s/%s action=%s",
            org_id,
            user_id,
            resource,
            resource_id,
            action,
        )


async def _write_phi_log(db: AsyncSession, log_entry: dict[str, Any]) -> None:
    """
    Phase 2 实装::

        from app.db.models.phi_access_logs import PhiAccessLog
        record = PhiAccessLog(**log_entry)
        db.add(record)
        await db.flush()  # 不 commit — 让外层 transaction 决定边界

    Phase 1.7 阶段 no-op — phi_access_logs 表的 SQLAlchemy 模型在 Phase 2
    建。函数签名稳定, 路由层提前接 record_phi_access 不会 break。
    """
    _ = (db, log_entry)
    return None
