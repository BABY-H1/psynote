"""
Public course enrollment router — 镜像
``server/src/modules/course/public-course-enroll.routes.ts`` (168 行)。

挂在 ``/api/public/courses`` prefix (无 auth!)。

2 个 endpoint:

  GET  /{instance_id}                — 公开课程信息 (status=active + publishMode=public)
  POST /{instance_id}/apply          — 提交报名申请 (transactional)

⚠ 安全: W0.4 audit (2026-05-03) 修复 — 创建 placeholder user 时 ``password_hash = NULL``
(不是 ``randomUUID()``):
  - fake hash (UUID 格式) 永久占用 email, 真实主人无法用同邮箱注册
  - auth.routes.py:117-118 已对 ``password_hash IS NULL / ''`` 做 fail-closed 处理
  - 配合 counseling-public.routes 的 claim flow, 真实主人来时可以认领并设密码

Transactional 边界:
  POST /apply 一次创建 (user 找不到时) + course_enrollment, 单 try/except + rollback。
  与 Node 端不同: Node 是分开 db.insert(users) + db.insert(courseEnrollments),
  没有显式 transaction. Python 端用单 try/except 让两者原子.

镜像 6 个 Node test cases (public-course-enroll.routes.test.ts):
  1. 新邮箱 → password_hash 必须为 null
  2. 已存在用户 → 复用, 不再 insert users
  3. 实例不存在 → 404
  4. status != active → 400
  5. publishMode != public → 403
  6. 缺 name 或 email → 400
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.course.schemas import (
    PublicCourseInfo,
    PublicEnrollApplyRequest,
    PublicEnrollApplyResponse,
)
from app.core.database import get_db
from app.db.models.course_enrollments import CourseEnrollment
from app.db.models.course_instances import CourseInstance
from app.db.models.courses import Course
from app.db.models.users import User
from app.lib.errors import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from app.lib.uuid_utils import parse_uuid_or_raise

router = APIRouter()


# ─── GET /{instance_id} 公开课程信息 ────────────────────────────


@router.get("/{instance_id}", response_model=PublicCourseInfo)
async def get_public_course_info(
    instance_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PublicCourseInfo:
    """``GET /{instance_id}`` 公开课程信息 (镜像 routes.ts:14-73, 无 auth).

    校验:
      - 实例存在 (404)
      - status == 'active' (400, 含 specific message: closed/archived/其它)
      - publishMode == 'public' (403)

    返回容量信息 (capacity / approvedCount / pendingCount / spotsLeft).
    """
    instance_uuid = parse_uuid_or_raise(instance_id, field="instanceId")
    iq = select(CourseInstance).where(CourseInstance.id == instance_uuid).limit(1)
    instance = (await db.execute(iq)).scalar_one_or_none()
    if instance is None:
        raise NotFoundError("Course", instance_id)

    inst_status = instance.status or ""
    if inst_status != "active":
        if inst_status == "closed":
            msg = "该课程已结束"
        elif inst_status == "archived":
            msg = "该课程已归档"
        else:
            msg = "该课程暂未开放"
        raise ValidationError(msg)

    if (instance.publish_mode or "") != "public":
        raise ForbiddenError("该课程不接受公开报名")

    # 取 course title + description (#3: 仅取 2 列, 别 hydrate 整行)
    cq = select(Course.title, Course.description).where(Course.id == instance.course_id).limit(1)
    course_row = (await db.execute(cq)).first()

    # 报名计数 — 单 query 聚合 (#3: 公开端点高 QPS, 不要 hydrate 全表)
    cnt_q = select(
        func.count()
        .filter(CourseEnrollment.approval_status.in_(("approved", "auto_approved")))
        .label("approved"),
        func.count().filter(CourseEnrollment.approval_status == "pending").label("pending"),
    ).where(CourseEnrollment.instance_id == instance_uuid)
    cnt_row = (await db.execute(cnt_q)).first()
    approved_count = int(cnt_row[0]) if cnt_row else 0
    pending_count = int(cnt_row[1]) if cnt_row else 0

    spots_left: int | None = None
    if instance.capacity is not None:
        spots_left = max(0, instance.capacity - approved_count)

    return PublicCourseInfo(
        id=str(instance.id),
        title=instance.title,
        description=instance.description,
        course_title=course_row[0] if course_row else None,
        course_description=course_row[1] if course_row else None,
        capacity=instance.capacity,
        approved_count=approved_count,
        pending_count=pending_count,
        spots_left=spots_left,
    )


# ─── POST /{instance_id}/apply 公开报名 ─────────────────────────


@router.post(
    "/{instance_id}/apply",
    response_model=PublicEnrollApplyResponse,
    status_code=status.HTTP_201_CREATED,
)
async def apply_public_enrollment(
    instance_id: str,
    body: PublicEnrollApplyRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PublicEnrollApplyResponse:
    """``POST /{instance_id}/apply`` 提交公开报名 (镜像 routes.ts:76-167, 无 auth).

    校验序列 (与 Node 行为完全对齐):
      1. 实例存在 (404)
      2. status == 'active' (400)
      3. publishMode == 'public' (403)
      4. body.name / body.email 必填 (Pydantic 已校验, 漏填 → 422 → error_handler 转 400)

    Transactional 单 try/except + rollback:
      a. 找/建 user (不存在时建 placeholder, ``password_hash = NULL`` — W0.4 安全修复)
      b. 检查是否已报名 (返 400 already_enrolled)
      c. 创建 enrollment
    """
    instance_uuid = parse_uuid_or_raise(instance_id, field="instanceId")
    iq = select(CourseInstance).where(CourseInstance.id == instance_uuid).limit(1)
    instance = (await db.execute(iq)).scalar_one_or_none()
    if instance is None:
        raise NotFoundError("Course", instance_id)

    if (instance.status or "") != "active":
        raise ValidationError("该课程暂未开放报名")

    if (instance.publish_mode or "") != "public":
        raise ForbiddenError("该课程不接受公开报名")

    try:
        # 找/建 user — Phase 5b 起注册改 phone-first (手机号验证码登录 / 真注册都
        # 走 phone), email 在 users 表是可空字段。公开报名遵循同一原则:
        #   - 查找优先级: phone > email (phone 是真实身份 anchor)
        #   - 创建匿名 user: email=None (即使 form 收到 email 也不占 UNIQUE)
        #
        # 这样的好处:
        #   1. 真注册时 phone 一致 → claim 同一行 (设 password + 加 org)
        #   2. 即使攻击者反复用受害者 email 报名, 也不会占 users.email UNIQUE,
        #      受害者真注册时 (phone-based) 不被拦
        #   3. email 作为辅助通信渠道留给 user 自己后续完善
        user = None
        if body.phone:
            phone_q = select(User).where(User.phone == body.phone).limit(1)
            user = (await db.execute(phone_q)).scalar_one_or_none()
        if user is None and body.email:
            email_q = select(User).where(User.email == body.email).limit(1)
            user = (await db.execute(email_q)).scalar_one_or_none()

        if user is None:
            # 公开报名建匿名 User: ``email=None`` 防 squat, ``password_hash=None`` 防接管。
            #
            # ⚠ W0.4 安全审计 (2026-05-03): password_hash 必须 NULL, 历史 bug 写
            # randomUUID() (UUID v4 格式) 让攻击者占了 account 即使无法登录, 真主
            # 走 claim 流时被拦 — 不能回去。
            user = User(
                name=body.name,
                email=None,  # 不占 email UNIQUE (phone-first 设计)
                phone=body.phone,
                password_hash=None,
            )
            db.add(user)
            await db.flush()  # 取 user.id 给后续 enrollment 用

        # 检查是否已报名
        dup_q = (
            select(CourseEnrollment.approval_status)
            .where(
                and_(
                    CourseEnrollment.instance_id == instance_uuid,
                    CourseEnrollment.user_id == user.id,
                )
            )
            .limit(1)
        )
        dup_row = (await db.execute(dup_q)).first()
        if dup_row is not None:
            raise ConflictError("您已报名此课程")

        # 创建 enrollment
        enrollment = CourseEnrollment(
            course_id=instance.course_id,
            instance_id=instance_uuid,
            user_id=user.id,
            enrollment_source="public_apply",
            approval_status="pending",
        )
        db.add(enrollment)
        await db.commit()
    except (ConflictError, ForbiddenError, ValidationError, NotFoundError):
        # 业务异常: rollback 但不吞 (让 error_handler 正常转 HTTP)
        await db.rollback()
        raise
    except Exception:
        # 未知异常: rollback + 抛
        await db.rollback()
        raise

    return PublicEnrollApplyResponse(
        success=True,
        enrollment_id=str(enrollment.id),
        approval_status="pending",
        message="报名成功!请等待审核。",
    )


__all__ = ["router"]
