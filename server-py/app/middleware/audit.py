"""
Generic audit logging utility — 镜像 server/src/middleware/audit.ts (Node)
的 ``logAudit`` 函数。

每次路由层做"语义动作" (创建/修改/删除/导出/分配 等) 时, 调用 ``record_audit``
记录一行 ``audit_logs``。这是合规 audit trail (回答 "谁在什么时候做了什么")
+ 调试 (异常发生前用户做了什么) 的双用途。

设计原则:
  1. **手动调用** — 不在中间件层自动捕获, 因为 audit row 含语义信息
     (action 名 / resource_id / changes diff), 自动化推断错误率太高。让
     handler 显式声明意图。

  2. **审计写失败不破主请求** — 与 ``record_phi_access`` 同模式 (HIPAA 哲学
     "audit must not block care")。DB 异常 swallow + log 给运维。

  3. **与 ``record_phi_access`` 故意分离** — PHI 访问在国内行业规范 + HIPAA
     里是法律意义不同的类别 (单独表 / 单独保留期 / 单独审计报告)。合并到
     同 utility 会鼓励 caller 用通用 audit 当 PHI audit, fail-open 风险高。
     所以即使 Node ``audit.ts`` 把两个 logging 函数放一个文件, Python 端
     拆开 ``audit.py`` (此处) + ``phi_access.py`` (PHI 专用)。

Phase 1.7 阶段: ``_write_audit_log`` 是 no-op 占位 (Phase 2 ORM 后填 INSERT
``audit_logs`` 表)。函数签名稳定, 路由层提前接入不会 break。

用法 (Phase 3+ 路由层)::

    from app.middleware.audit import record_audit

    @router.post("/courses")
    async def create_course(
        body: CourseCreate,
        request: Request,
        user: AuthUser = Depends(get_current_user),
        org: OrgContext = Depends(get_org_context),
        db: AsyncSession = Depends(get_db),
    ):
        course = await create_course_service(db, body, ...)
        await record_audit(
            db=db,
            org_id=org.org_id,
            user_id=user.id,
            action="course.create",
            resource="course",
            resource_id=course.id,
            ip_address=request.client.host if request.client else None,
        )
        return course
"""

from __future__ import annotations

import logging
import uuid as _uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.audit_logs import AuditLog

logger = logging.getLogger(__name__)


def _coerce_uuid(value: Any) -> _uuid.UUID | None:
    """str/UUID → uuid.UUID; None → None。镜像 phi_access._coerce_uuid 行为。"""
    if value is None or value == "":
        return None
    if isinstance(value, _uuid.UUID):
        return value
    return _uuid.UUID(str(value))


async def record_audit(
    *,
    db: AsyncSession,
    org_id: str | None,
    user_id: str | None,
    action: str,
    resource: str,
    resource_id: str | None = None,
    changes: dict[str, dict[str, Any]] | None = None,
    ip_address: str | None = None,
) -> None:
    """
    写一行 audit_logs。任何错误吞掉 + log, 不让审计失败阻塞主请求。

    Args:
        db:           SQLAlchemy async session (Phase 2 后真插表)
        org_id:       org 上下文; 跨 org 操作 (e.g. system admin) 可为 None
        user_id:      操作人; system 内部任务可为 None
        action:       动作枚举字符串, e.g. "course.create" / "user.invite". 与
                      Node 风格 "<resource>.<verb>" 对齐, 但本函数不强制格式
        resource:     被操作的资源类型 (audit_logs.resource 列)
        resource_id:  被操作资源的 id; bulk action 可为 None
        changes:      diff 详情 ``{field: {old: ..., new: ...}}``, 用于 update
                      操作的 before/after 对比
        ip_address:   request.client.host
    """
    log_entry: dict[str, Any] = {
        "org_id": org_id,
        "user_id": user_id,
        "action": action,
        "resource": resource,
        "resource_id": resource_id,
        "changes": changes,
        "ip_address": ip_address,
    }
    try:
        await _write_audit_log(db, log_entry)
    except Exception:
        logger.exception(
            "Failed to write audit log: org_id=%s user_id=%s action=%s resource=%s/%s",
            org_id,
            user_id,
            action,
            resource,
            resource_id,
        )


async def _write_audit_log(db: AsyncSession, log_entry: dict[str, Any]) -> None:
    """
    Phase 5 P0 fix: 真插 ``audit_logs`` 表。

    ``await db.flush()`` 不 commit — 由外层 handler / get_db 决定边界。
    org_id / user_id / resource_id 容错 None。
    """
    record = AuditLog(
        org_id=_coerce_uuid(log_entry.get("org_id")),
        user_id=_coerce_uuid(log_entry.get("user_id")),
        action=log_entry["action"],
        resource=log_entry["resource"],
        resource_id=_coerce_uuid(log_entry.get("resource_id")),
        changes=log_entry.get("changes"),
        ip_address=log_entry.get("ip_address"),
    )
    db.add(record)
    await db.flush()
