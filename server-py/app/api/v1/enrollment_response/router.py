"""
Enrollment response API routers — 镜像
``server/src/modules/enrollment-response/response.routes.ts`` (118 行) +
``response.service.ts`` (299 行)。

两个 APIRouter (与 Node ``app.ts:251-252`` 双 register 一致):

  ``router``         — 咨询师端 (``/api/orgs/{org_id}/enrollment-responses``)
  ``client_router``  — 学员 portal 端 (``/api/orgs/{org_id}/client/enrollment-responses``)

两 router 共用一个 service 层 (Node 的设计), Python 端把所有 service helper
inline 在本文件里 (与 auth / content_block 风格一致, 不分 service.py)。

业务逻辑要点:

  - polymorphic ``enrollment_id``: ``enrollment_type`` 决定指
    course_enrollments / group_enrollments 哪张表 (model 故意不加 FK,
    业务侧分支查询)
  - polymorphic ``block_id``: 同理, ``enrollment_type`` 决定指
    course_content_blocks / group_session_blocks
  - upsert 语义: 同 (enrollment_id, enrollment_type, block_id) 唯一,
    存在 → update, 否则 → insert (与 service.ts:120-161 一致)
  - 安全扫描: 文本内容走 keyword scanner (port 自
    ``server/src/modules/safety/keyword-scanner.ts`` 的中文关键词列表),
    critical / warning 命中时回 ``crisis`` payload 给门户弹危机热线
  - **client ownership 校验**: enrollment_block_responses 不存 user_id,
    所有权通过 enrollment 行的 user_id 间接保证 (routes.ts:48-54 注释说明)
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.enrollment_response.schemas import (
    CrisisInfo,
    CrisisResourceItem,
    EnrollmentResponseRow,
    EnrollmentType,
    PendingSafetyRow,
    SafetySeverity,
    SubmitResponseRequest,
    SubmitResponseResult,
)
from app.core.database import get_db
from app.db.models.course_content_blocks import CourseContentBlock
from app.db.models.course_enrollments import CourseEnrollment
from app.db.models.course_instances import CourseInstance
from app.db.models.enrollment_block_responses import EnrollmentBlockResponse
from app.db.models.group_enrollments import GroupEnrollment
from app.db.models.group_instances import GroupInstance
from app.db.models.group_session_blocks import GroupSessionBlock
from app.lib.errors import ForbiddenError, NotFoundError, ValidationError
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.role_guards import reject_client, require_org

router = APIRouter()
client_router = APIRouter()


# ────────────────────────────────────────────────────────────────
# Safety scanner (镜像 server/src/modules/safety/keyword-scanner.ts)
#
# Python 端尚未独立 port 该模块 (Phase 9α 业务范围, Tier 2 任务尺寸内
# inline 即可避免引入新顶层模块). Phase X 若有更多消费者 (e.g. 评估
# 表单的同款扫描) 可抽到 ``app/lib/safety_scanner.py``.
# ────────────────────────────────────────────────────────────────

# 中文危机词分级 (与 keyword-scanner.ts:26-39 完全一致, 不轻易修改)
_KEYWORDS_CRITICAL: tuple[str, ...] = (
    "自杀",
    "自殺",
    "自残",
    "自殘",
    "自伤",
    "自傷",
    "想死",
    "不想活",
    "活不下去",
    "结束生命",
    "結束生命",
    "了结自己",
    "了結自己",
    "轻生",
    "輕生",
    "寻死",
    "尋死",
    "割腕",
    "跳楼",
    "跳樓",
    "上吊",
    "我要死了",
    "我该死",
    "我該死",
)
_KEYWORDS_WARNING: tuple[str, ...] = (
    "绝望",
    "絕望",
    "毫无希望",
    "毫無希望",
    "没意思",
    "沒意思",
    "活着没意义",
    "活著沒意義",
    "没人在乎",
    "沒人在乎",
    "撑不住了",
    "撐不住了",
    "崩溃",
    "崩潰",
)

# 默认危机干预资源 (镜像 keyword-scanner.ts:123-141, 后续 Phase 9ε 可改成
# org-level 配置)
_DEFAULT_CRISIS_RESOURCES: tuple[CrisisResourceItem, ...] = (
    CrisisResourceItem(
        name="北京心理危机研究与干预中心",
        phone="010-82951332",
        hours="24 小时",
        description="全国范围心理援助热线",
    ),
    CrisisResourceItem(
        name="希望 24 热线",
        phone="400-161-9995",
        hours="24 小时",
        description="全国心理援助热线",
    ),
    CrisisResourceItem(
        name="北京心理援助热线",
        phone="010-82951332",
        hours="24 小时",
    ),
)


def _extract_snippet(text: str, keyword: str, window: int = 20) -> str:
    """关键词周围 ±window 字符的预览片段 (镜像 keyword-scanner.ts:45-53)。"""
    idx = text.find(keyword)
    if idx < 0:
        return ""
    start = max(0, idx - window)
    end = min(len(text), idx + len(keyword) + window)
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(text) else ""
    return prefix + text[start:end] + suffix


def _scan_text(text: str) -> list[dict[str, Any]]:
    """
    单段文字过 critical + warning 关键词 (镜像 keyword-scanner.ts:59-85)。

    同一关键词若已在 critical 命中, 不再 warning 重复加入 (与 Node 一致, 防双计)。
    """
    if not text or not isinstance(text, str):
        return []
    flags: list[dict[str, Any]] = []
    for kw in _KEYWORDS_CRITICAL:
        if kw in text:
            flags.append(
                {"keyword": kw, "severity": "critical", "snippet": _extract_snippet(text, kw)}
            )
    for kw in _KEYWORDS_WARNING:
        if kw in text:
            if any(f["keyword"] == kw for f in flags):
                continue
            flags.append(
                {"keyword": kw, "severity": "warning", "snippet": _extract_snippet(text, kw)}
            )
    return flags


def _scan_response(response: Any) -> list[dict[str, Any]]:
    """
    递归收集 response 里所有 string value 后扫毒 (镜像 keyword-scanner.ts:91-108)。

    支持 worksheet 多字段对象 / quiz 数组等结构, 文本扫毒不漏底层字段。
    """
    texts: list[str] = []

    def _walk(value: Any) -> None:
        if isinstance(value, str):
            texts.append(value)
        elif isinstance(value, list):
            for v in value:
                _walk(v)
        elif isinstance(value, dict):
            for v in value.values():
                _walk(v)

    _walk(response)
    all_flags: list[dict[str, Any]] = []
    for t in texts:
        all_flags.extend(_scan_text(t))
    return all_flags


def _top_severity(flags: list[dict[str, Any]]) -> SafetySeverity | None:
    """flag 列表中最高等级 (镜像 keyword-scanner.ts:111-116)。"""
    if any(f.get("severity") == "critical" for f in flags):
        return "critical"
    if any(f.get("severity") == "warning" for f in flags):
        return "warning"
    if any(f.get("severity") == "info" for f in flags):
        return "info"
    return None


# ────────────────────────────────────────────────────────────────
# Service helpers (inline, 镜像 response.service.ts:30-227)
# ────────────────────────────────────────────────────────────────


async def _assert_enrollment_owned_by_user(
    db: AsyncSession,
    enrollment_id: str,
    enrollment_type: EnrollmentType,
    user_id: str,
) -> None:
    """
    校验该 enrollment 属于当前 user (镜像 service.ts:30-56)。

    enrollment_block_responses 表故意不存 user_id, ownership 通过 enrollment 行
    的 user_id 间接保证。client portal 提交响应 / GET 自己列表前必须 pass 此校验。

    异常路径:
      - enrollment 不存在 → 404 NotFoundError
      - enrollment 的 user_id 不是当前 user → 403 ForbiddenError
    """
    try:
        enrollment_uuid = uuid.UUID(enrollment_id)
        user_uuid = uuid.UUID(user_id)
    except (ValueError, TypeError) as exc:
        # enrollment_id 非 UUID 形态 → 404 (与 Node 一致, 防 PG "invalid input syntax")
        raise NotFoundError(
            "CourseEnrollment" if enrollment_type == "course" else "GroupEnrollment",
            enrollment_id,
        ) from exc

    if enrollment_type == "course":
        q = (
            select(CourseEnrollment.id, CourseEnrollment.user_id)
            .where(CourseEnrollment.id == enrollment_uuid)
            .limit(1)
        )
        row = (await db.execute(q)).first()
        if row is None:
            raise NotFoundError("CourseEnrollment", enrollment_id)
        _, owner_user_id = row
        if owner_user_id != user_uuid:
            raise ForbiddenError("This enrollment does not belong to you")
    else:
        q2 = (
            select(GroupEnrollment.id, GroupEnrollment.user_id)
            .where(GroupEnrollment.id == enrollment_uuid)
            .limit(1)
        )
        row2 = (await db.execute(q2)).first()
        if row2 is None:
            raise NotFoundError("GroupEnrollment", enrollment_id)
        _, owner_user_id2 = row2
        if owner_user_id2 != user_uuid:
            raise ForbiddenError("This enrollment does not belong to you")


async def _get_block_type(
    db: AsyncSession,
    block_id: str,
    enrollment_type: EnrollmentType,
) -> str:
    """
    根据 enrollment_type 查 block 所在表, 返其 ``block_type`` (镜像
    service.ts:59-80) — 该值会 denormalize 写到 enrollment_block_responses 行
    避免日后跨表查 block_type 的额外 round-trip。
    """
    try:
        block_uuid = uuid.UUID(block_id)
    except (ValueError, TypeError) as exc:
        raise NotFoundError(
            "CourseContentBlock" if enrollment_type == "course" else "GroupSessionBlock",
            block_id,
        ) from exc

    if enrollment_type == "course":
        q = (
            select(CourseContentBlock.block_type)
            .where(CourseContentBlock.id == block_uuid)
            .limit(1)
        )
        block_type = (await db.execute(q)).scalar_one_or_none()
        if block_type is None:
            raise NotFoundError("CourseContentBlock", block_id)
        return str(block_type)

    gq = select(GroupSessionBlock.block_type).where(GroupSessionBlock.id == block_uuid).limit(1)
    gblock_type = (await db.execute(gq)).scalar_one_or_none()
    if gblock_type is None:
        raise NotFoundError("GroupSessionBlock", block_id)
    return str(gblock_type)


def _row_to_response(row: EnrollmentBlockResponse) -> EnrollmentResponseRow:
    """ORM → wire shape (镜像 service.ts:163-174)。"""
    return EnrollmentResponseRow(
        id=str(row.id),
        enrollment_id=str(row.enrollment_id),
        enrollment_type=row.enrollment_type,
        block_id=str(row.block_id),
        block_type=row.block_type,
        response=row.response,
        completed_at=row.completed_at.isoformat() if row.completed_at else None,
        safety_flags=list(row.safety_flags) if row.safety_flags else [],
        reviewed_by_counselor=bool(row.reviewed_by_counselor),
        reviewed_at=row.reviewed_at.isoformat() if row.reviewed_at else None,
    )


# ────────────────────────────────────────────────────────────────
# Counselor router endpoints (镜像 routes.ts:23-80)
# ────────────────────────────────────────────────────────────────


@router.get("/", response_model=list[EnrollmentResponseRow])
async def list_responses_for_enrollment(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    enrollment_id: Annotated[str | None, Query(alias="enrollmentId")] = None,
    enrollment_type: Annotated[str | None, Query(alias="enrollmentType")] = None,
) -> list[EnrollmentResponseRow]:
    """
    按 enrollment 列出全部响应 (镜像 routes.ts:39-56 + service.ts:184-198)。

    Client 调时仅看自己的: routes.ts:48-54 注释解释 — enrollment_block_responses
    不存 user_id, 通过校验 enrollment 行的 user_id 间接保证 ownership; 通过后
    返该 enrollment 全部 responses (反正都是这位学员自己的)。

    Counselor / org_admin 不做 ownership 限制 (要看全班学员)。
    """
    org_ctx = require_org(org)

    if enrollment_type not in ("course", "group"):
        raise ValidationError("enrollmentType must be course or group")
    if not enrollment_id:
        raise ValidationError("enrollmentId is required")
    typed_enrollment_type: EnrollmentType = enrollment_type  # type: ignore[assignment]

    # client 角色 — 顶部校验 ownership (与 Node routes.ts:48-54 一致)
    if not user.is_system_admin and org_ctx.role == "client":
        await _assert_enrollment_owned_by_user(db, enrollment_id, typed_enrollment_type, user.id)

    try:
        enrollment_uuid = uuid.UUID(enrollment_id)
    except (ValueError, TypeError) as exc:
        raise NotFoundError(
            "CourseEnrollment" if typed_enrollment_type == "course" else "GroupEnrollment",
            enrollment_id,
        ) from exc

    q = (
        select(EnrollmentBlockResponse)
        .where(
            and_(
                EnrollmentBlockResponse.enrollment_id == enrollment_uuid,
                EnrollmentBlockResponse.enrollment_type == typed_enrollment_type,
            )
        )
        .order_by(desc(EnrollmentBlockResponse.completed_at))
    )
    rows = (await db.execute(q)).scalars().all()
    return [_row_to_response(r) for r in rows]


@router.get("/pending-safety", response_model=list[PendingSafetyRow])
async def list_pending_safety_flags(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
) -> list[PendingSafetyRow]:
    """
    org 内所有待审 safety flag 列表 (镜像 routes.ts:62-66 + service.ts:264-298)。

    Node 端走 raw SQL UNION (跨 course / group enrollment 表 join), Python 端
    用 SQLAlchemy ``select`` + table join 表达同一语义并保留同 wire shape:

      - 仅取 reviewed_by_counselor = false (待审)
      - 仅取 jsonb_array_length(safety_flags) > 0 (有命中词)
      - 通过 course_enrollments → course_instances / group_enrollments →
        group_instances 反查 org_id 过滤当前 org

    org_admin / counselor only。
    """
    org_ctx = reject_client(org, user=user)

    try:
        org_uuid = uuid.UUID(org_ctx.org_id)
    except (ValueError, TypeError) as exc:
        raise ValidationError("Invalid org_id") from exc

    # course 分支 (镜像 service.ts:266-281)
    course_q = (
        select(
            EnrollmentBlockResponse.id,
            EnrollmentBlockResponse.enrollment_id,
            EnrollmentBlockResponse.enrollment_type,
            EnrollmentBlockResponse.block_id,
            EnrollmentBlockResponse.block_type,
            EnrollmentBlockResponse.response,
            EnrollmentBlockResponse.safety_flags,
            EnrollmentBlockResponse.completed_at,
            CourseEnrollment.user_id.label("user_id"),
        )
        .join(
            CourseEnrollment,
            CourseEnrollment.id == EnrollmentBlockResponse.enrollment_id,
        )
        .join(CourseInstance, CourseInstance.id == CourseEnrollment.instance_id)
        .where(
            and_(
                EnrollmentBlockResponse.enrollment_type == "course",
                EnrollmentBlockResponse.reviewed_by_counselor.is_(False),
                func.jsonb_array_length(EnrollmentBlockResponse.safety_flags) > 0,
                CourseInstance.org_id == org_uuid,
            )
        )
    )

    # group 分支 (镜像 service.ts:282-297)
    group_q = (
        select(
            EnrollmentBlockResponse.id,
            EnrollmentBlockResponse.enrollment_id,
            EnrollmentBlockResponse.enrollment_type,
            EnrollmentBlockResponse.block_id,
            EnrollmentBlockResponse.block_type,
            EnrollmentBlockResponse.response,
            EnrollmentBlockResponse.safety_flags,
            EnrollmentBlockResponse.completed_at,
            GroupEnrollment.user_id.label("user_id"),
        )
        .join(
            GroupEnrollment,
            GroupEnrollment.id == EnrollmentBlockResponse.enrollment_id,
        )
        .join(GroupInstance, GroupInstance.id == GroupEnrollment.instance_id)
        .where(
            and_(
                EnrollmentBlockResponse.enrollment_type == "group",
                EnrollmentBlockResponse.reviewed_by_counselor.is_(False),
                func.jsonb_array_length(EnrollmentBlockResponse.safety_flags) > 0,
                GroupInstance.org_id == org_uuid,
            )
        )
    )

    # #7/P1.7: UNION ALL 单 query 替代两次串行 SELECT;
    # SQL 端 ORDER BY 保证 course/group 跨源按 completed_at 全局降序 (而非"先 course 后 group")。
    union_q = course_q.union_all(group_q).order_by(desc(EnrollmentBlockResponse.completed_at))
    rows = (await db.execute(union_q)).all()

    out: list[PendingSafetyRow] = []
    for r in rows:
        out.append(
            PendingSafetyRow(
                id=str(r[0]),
                enrollment_id=str(r[1]),
                enrollment_type=str(r[2]),
                block_id=str(r[3]),
                block_type=str(r[4]),
                response=r[5],
                safety_flags=list(r[6]) if r[6] else [],
                completed_at=r[7].isoformat() if r[7] else None,
                user_id=str(r[8]),
            )
        )
    return out


@router.post("/{response_id}/review", response_model=EnrollmentResponseRow)
async def mark_response_reviewed(
    response_id: str,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
) -> EnrollmentResponseRow:
    """
    标记某响应已被咨询师审 (镜像 routes.ts:72-79 + service.ts:220-228)。

    更新 reviewed_by_counselor=True + reviewed_at=NOW. 同时调 record_audit
    (action='update', resource='enrollment_block_responses').

    org_admin / counselor only。
    """
    org_ctx = reject_client(org, user=user)

    try:
        response_uuid = uuid.UUID(response_id)
    except (ValueError, TypeError) as exc:
        raise NotFoundError("EnrollmentBlockResponse", response_id) from exc

    q = select(EnrollmentBlockResponse).where(EnrollmentBlockResponse.id == response_uuid).limit(1)
    row = (await db.execute(q)).scalar_one_or_none()
    if row is None:
        raise NotFoundError("EnrollmentBlockResponse", response_id)

    now = datetime.now(UTC)
    row.reviewed_by_counselor = True
    row.reviewed_at = now
    # updated_at 由 TimestampMixin onupdate 自动写, 但显式赋值让 mock_db 测试能直接 assert
    row.updated_at = now
    await db.commit()
    await db.refresh(row)

    await record_audit(
        db=db,
        org_id=org_ctx.org_id,
        user_id=user.id,
        action="update",
        resource="enrollment_block_responses",
        resource_id=response_id,
        ip_address=request.client.host if request.client else None,
    )
    return _row_to_response(row)


# ────────────────────────────────────────────────────────────────
# Client portal router endpoints (镜像 routes.ts:86-118)
# ────────────────────────────────────────────────────────────────


@client_router.post("/", response_model=SubmitResponseResult, status_code=status.HTTP_201_CREATED)
async def submit_response(
    body: SubmitResponseRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
) -> SubmitResponseResult:
    """
    学员提交某 block 的响应 (镜像 routes.ts:95-117 + service.ts:112-179)。

    Upsert 语义: 同 (enrollment_id, enrollment_type, block_id) 唯一, 已存在时
    update + 刷 completed_at, 否则 insert. ownership 由
    ``_assert_enrollment_owned_by_user`` 保证.

    safety scan: 文本类内容 (reflection / worksheet / check_in) 走关键词扫毒,
    critical / warning 命中时返 ``crisis`` payload (危机热线), 让门户立刻弹提示。
    """
    # 不需要 staff role / 不需要 reject_client (本路由就是给 client portal 用的)
    org = require_org(org)

    # ownership: 只有 enrollment 主人才能为它提响应
    await _assert_enrollment_owned_by_user(db, body.enrollment_id, body.enrollment_type, user.id)

    # block_type denormalize 到 response 行
    block_type = await _get_block_type(db, body.block_id, body.enrollment_type)

    # safety scan — response is None 表示 "已观看", 不扫
    flags = _scan_response(body.response) if body.response is not None else []
    severity = _top_severity(flags)

    try:
        enrollment_uuid = uuid.UUID(body.enrollment_id)
        block_uuid = uuid.UUID(body.block_id)
    except (ValueError, TypeError) as exc:
        raise ValidationError("Invalid enrollment_id or block_id") from exc

    # Upsert: 先查唯一约束, 命中 → update, 否则 → insert (镜像 service.ts:121-161)
    existing_q = (
        select(EnrollmentBlockResponse)
        .where(
            and_(
                EnrollmentBlockResponse.enrollment_id == enrollment_uuid,
                EnrollmentBlockResponse.enrollment_type == body.enrollment_type,
                EnrollmentBlockResponse.block_id == block_uuid,
            )
        )
        .limit(1)
    )
    existing = (await db.execute(existing_q)).scalar_one_or_none()

    now = datetime.now(UTC)
    if existing is not None:
        existing.response = body.response
        existing.completed_at = now
        existing.safety_flags = flags
        existing.updated_at = now
        await db.commit()
        await db.refresh(existing)
        row: EnrollmentBlockResponse = existing
    else:
        new_row = EnrollmentBlockResponse(
            enrollment_id=enrollment_uuid,
            enrollment_type=body.enrollment_type,
            block_id=block_uuid,
            block_type=block_type,
            response=body.response,
            completed_at=now,
            safety_flags=flags,
            reviewed_by_counselor=False,
        )
        db.add(new_row)
        await db.commit()
        await db.refresh(new_row)
        row = new_row

    crisis: CrisisInfo | None
    if severity in ("critical", "warning"):
        # mypy: severity 此时一定是 'critical'/'warning' 之一, list comprehension 即可
        crisis_severity: SafetySeverity = severity
        crisis = CrisisInfo(severity=crisis_severity, resources=list(_DEFAULT_CRISIS_RESOURCES))
    else:
        crisis = None

    return SubmitResponseResult(response=_row_to_response(row), crisis=crisis)


# 静态分析提示: ``Literal`` import 留作 schemas re-export 用 (mypy 见证 EnrollmentType 是 Literal)
__all__: list[Literal["router", "client_router"]] = ["client_router", "router"]
