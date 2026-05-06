"""
FastAPI app entry — Phase 0 阶段只暴露 /health。

后续 phase 在此挂上 middleware (auth/data_scope/phi_access) +
26 个业务路由模块 (auth/user/org/.../workflow)。

启动顺序:
  1. get_settings() — 校验 env, 任何字段非法立刻 sys.exit(1) (W0.3)
  2. FastAPI 实例化 + lifespan (Phase 0 暂无 startup 任务)
  3. include_router (Phase 1+ 加)

注: 读 pyproject.toml 中 [project].version 作为 /health 返回的版本号,
让 Phase 6 shadow 流量对比 (Node 4000 vs Python 8001) 能区分版本来源。
"""

from __future__ import annotations

from functools import lru_cache
from importlib.metadata import PackageNotFoundError, version
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

# Phase 3 Tier 4 imports (admin / ai / ai_credentials + 9 后台模块)
from app.api.v1.admin import dashboard_router as admin_dashboard_router
from app.api.v1.admin import library_router as admin_library_router
from app.api.v1.admin import license_router as admin_license_router
from app.api.v1.admin import router as admin_router
from app.api.v1.admin import tenant_router as admin_tenant_router
from app.api.v1.ai import assessment_router as ai_assessment_router
from app.api.v1.ai import course_authoring_router as ai_course_authoring_router
from app.api.v1.ai import group_schemes_router as ai_group_schemes_router
from app.api.v1.ai import router as ai_router
from app.api.v1.ai import scales_material_router as ai_scales_material_router
from app.api.v1.ai import templates_router as ai_templates_router
from app.api.v1.ai import treatment_router as ai_treatment_router
from app.api.v1.ai_credentials import org_router as ai_credentials_org_router
from app.api.v1.ai_credentials import system_router as ai_credentials_system_router
from app.api.v1.assessment import (
    batch_router as assessment_batch_router,
)
from app.api.v1.assessment import (
    distribution_router as assessment_distribution_router,
)
from app.api.v1.assessment import (
    public_result_router,
)
from app.api.v1.assessment import (
    report_router as assessment_report_router,
)
from app.api.v1.assessment import (
    result_router as assessment_result_router,
)
from app.api.v1.assessment import router as assessment_router
from app.api.v1.assessment import (
    scale_router as assessment_scale_router,
)
from app.api.v1.auth import router as auth_router

# Phase 3 Tier 3 imports (counseling / eap / school / client_portal / parent_binding)
from app.api.v1.client_portal import router as client_portal_router
from app.api.v1.collaboration import router as collaboration_router
from app.api.v1.compliance import consent_router as compliance_consent_router
from app.api.v1.compliance import review_router as compliance_review_router
from app.api.v1.content_block import router as content_block_router
from app.api.v1.counseling import (
    ai_conversation_router,
    appointment_router,
    availability_router,
    client_access_grant_router,
    client_assignment_router,
    client_profile_router,
    goal_library_router,
    note_template_router,
    session_note_router,
    treatment_plan_router,
)
from app.api.v1.counseling import public_router as counseling_public_router
from app.api.v1.counseling import router as counseling_episode_router
from app.api.v1.course import (
    enrollment_router as course_enrollment_router,
)
from app.api.v1.course import (
    feedback_router as course_feedback_router,
)
from app.api.v1.course import (
    homework_router as course_homework_router,
)
from app.api.v1.course import (
    instance_router as course_instance_router,
)
from app.api.v1.course import (
    public_enroll_router as course_public_enroll_router,
)
from app.api.v1.course import router as course_router
from app.api.v1.crisis import router as crisis_router
from app.api.v1.delivery import person_archive_router as delivery_person_archive_router
from app.api.v1.delivery import router as delivery_router
from app.api.v1.eap import analytics_router as eap_analytics_router
from app.api.v1.eap import assignment_router as eap_assignment_router
from app.api.v1.eap import partnership_router as eap_partnership_router
from app.api.v1.eap import public_router as eap_public_router
from app.api.v1.enrollment_response import (
    client_router as enrollment_response_client_router,
)
from app.api.v1.enrollment_response import router as enrollment_response_router
from app.api.v1.follow_up import router as follow_up_router
from app.api.v1.group import (
    enrollment_router as group_enrollment_router,
)
from app.api.v1.group import (
    instance_router as group_instance_router,
)
from app.api.v1.group import (
    public_enroll_router as group_public_enroll_router,
)
from app.api.v1.group import (
    scheme_router as group_scheme_router,
)
from app.api.v1.group import (
    session_router as group_session_router,
)
from app.api.v1.notification import (
    public_appointments_router,
    reminder_settings_router,
)
from app.api.v1.notification import router as notification_router
from app.api.v1.org import (
    branding_router,
    dashboard_router,
    intake_router,
    license_router,
    public_services_router,
    subscription_router,
)
from app.api.v1.org import router as org_router
from app.api.v1.parent_binding import admin_router as parent_binding_admin_router
from app.api.v1.parent_binding import portal_children_router
from app.api.v1.parent_binding import public_router as parent_binding_public_router
from app.api.v1.referral import public_router as referral_public_router
from app.api.v1.referral import router as referral_router
from app.api.v1.school import analytics_router as school_analytics_router
from app.api.v1.school import class_router as school_class_router
from app.api.v1.school import student_router as school_student_router
from app.api.v1.triage import router as triage_router
from app.api.v1.upload import router as upload_router
from app.api.v1.user import router as user_router
from app.api.v1.workflow import router as workflow_router
from app.core.config import get_settings
from app.middleware.error_handler import register_error_handlers
from app.middleware.rate_limit import limiter


@lru_cache(maxsize=1)
def _resolve_version() -> str:
    """取 pyproject 声明的版本号; 安装/dev 模式都能拿到。

    `importlib.metadata.version` 每次调用要扫 sys.path 找 *.dist-info,
    /health 是热路径(Caddy/k8s readiness 每 10s 一次), 所以 lru_cache 锁住。
    """
    try:
        return version("psynote-server")
    except PackageNotFoundError:
        # uv sync 之前 / 测试 cwd 不包含安装时回落
        return "0.1.0-dev"


def create_app() -> FastAPI:
    """工厂函数 — 测试可以构造独立实例; 生产用 module-level `app`。"""
    settings = get_settings()  # 启动期校验, 失败立即 sys.exit(1)
    app_version = _resolve_version()  # closure 复用, 避免 /health 每次重算

    fastapi_app = FastAPI(
        title="psynote API (FastAPI)",
        description=(
            "Psynote 心理服务管理平台 — Python/FastAPI 实现 "
            "(Fastify→FastAPI 全量迁移目标, Option C). "
            "完整迁移计划见 ~/.claude/plans/optimized-swimming-sunset.md."
        ),
        version=app_version,
        # Phase 1 起 docs 需要 auth 保护; Phase 0 暂开放
        docs_url="/docs",
        redoc_url=None,
    )

    # Phase 1.7: AppError / RequestValidationError / 未知异常的统一映射
    # → JSON {error, message} 格式, 与 Node 端 error-handler.ts 对齐
    register_error_handlers(fastapi_app)

    # Phase 5 P0 fix (Fix 8, 2026-05-04 安全审计): slowapi rate limit.
    # 防 login 暴破 / forgot-password 邮箱枚举 / 公开注册灌水 / parent-bind token 重放。
    # 装饰器在各 router 端点上 (5-10/minute), 这里只挂全局 default 兜底 + exception handler。
    #
    # slowapi handler 签名 (Request, RateLimitExceeded) 比 Starlette 期望的
    # (Request, Exception) 更窄, mypy 标 incompatible — 实际 RateLimitExceeded 是
    # Exception 子类, 跨库类型 narrow 是行业惯例 (FastAPI / slowapi).
    fastapi_app.state.limiter = limiter
    fastapi_app.add_exception_handler(
        RateLimitExceeded,
        _rate_limit_exceeded_handler,  # type: ignore[arg-type]
    )

    # Phase 5 P0 fix (2026-05-04 安全审计): 加 CORS middleware. Phase 6 切流到 Python 时
    # 前端 (CLIENT_URL) 跨域到后端必坏 — 必须显式白名单允许. allow_origins=["*"] 严禁
    # 与 allow_credentials=True 共用 (浏览器会拒). production 由 Caddy 收口, dev 用此中间件。
    fastapi_app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.CLIENT_URL] if settings.CLIENT_URL else [],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )

    # ─── Phase 3 routers ─────────────────────────────────────
    # 路径前缀 /api/auth 与 Node 一致, Caddy /api/* → app-py 切流时 0 改动。
    fastapi_app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
    # /api/users — 自服务用户 (镜像 Node app.ts:149)
    fastapi_app.include_router(user_router, prefix="/api/users", tags=["user"])
    # /api/orgs/{org_id}/upload — org-scoped 文件上传 (镜像 Node app.ts:214)
    fastapi_app.include_router(upload_router, prefix="/api/orgs/{org_id}/upload", tags=["upload"])
    # /api/orgs/{org_id}/content-blocks — 内容块 CRUD (镜像 Node app.ts:250)
    fastapi_app.include_router(
        content_block_router,
        prefix="/api/orgs/{org_id}/content-blocks",
        tags=["content-block"],
    )
    # /api/orgs/{org_id}/notifications — 用户通知 (镜像 Node app.ts:221)
    fastapi_app.include_router(
        notification_router,
        prefix="/api/orgs/{org_id}/notifications",
        tags=["notification"],
    )
    # /api/orgs/{org_id}/reminder-settings — 机构级提醒配置 (镜像 Node app.ts:224)
    fastapi_app.include_router(
        reminder_settings_router,
        prefix="/api/orgs/{org_id}/reminder-settings",
        tags=["notification"],
    )
    # /api/public/appointments — 邮件链接 confirm/cancel (无 auth, 镜像 Node app.ts:227)
    fastapi_app.include_router(
        public_appointments_router,
        prefix="/api/public/appointments",
        tags=["notification"],
    )
    # ─── Org module (6 sub-routers, 与 Node app.ts:150 / 201 / 203 / 205 / 207 / 209 / 211 对齐) ─
    # /api/orgs — org CRUD + members + triage (镜像 Node app.ts:150)
    fastapi_app.include_router(org_router, prefix="/api/orgs", tags=["org"])
    # /api/orgs/{org_id}/branding — 品牌 (镜像 Node app.ts:201)
    fastapi_app.include_router(
        branding_router,
        prefix="/api/orgs/{org_id}/branding",
        tags=["org-branding"],
    )
    # /api/orgs/{org_id}/subscription + /ai-usage (镜像 Node app.ts:203)
    fastapi_app.include_router(
        subscription_router,
        prefix="/api/orgs/{org_id}",
        tags=["org-subscription"],
    )
    # /api/orgs/{org_id}/license — 激活/移除 license (镜像 Node app.ts:205)
    fastapi_app.include_router(
        license_router,
        prefix="/api/orgs/{org_id}/license",
        tags=["org-license"],
    )
    # /api/orgs/{org_id}/dashboard/{stats,kpi-delta} (镜像 Node app.ts:207)
    fastapi_app.include_router(
        dashboard_router,
        prefix="/api/orgs/{org_id}/dashboard",
        tags=["org-dashboard"],
    )
    # /api/orgs/{org_id}/service-intakes — 已认证 intake 列表 + 分配 (镜像 Node app.ts:209)
    fastapi_app.include_router(
        intake_router,
        prefix="/api/orgs/{org_id}/service-intakes",
        tags=["org-intake"],
    )
    # /api/public — 公开 services + intake submit (无 auth, 镜像 Node app.ts:211)
    fastapi_app.include_router(
        public_services_router,
        prefix="/api/public",
        tags=["org-public"],
    )

    # ─── Phase 3 Tier 2: Course module (6 sub-routers) ───────
    # 镜像 Node app.ts:189-193 + :233 公开报名
    fastapi_app.include_router(course_router, prefix="/api/orgs/{org_id}/courses", tags=["course"])
    fastapi_app.include_router(
        course_instance_router,
        prefix="/api/orgs/{org_id}/course-instances",
        tags=["course"],
    )
    fastapi_app.include_router(
        course_enrollment_router,
        prefix="/api/orgs/{org_id}/course-instances",
        tags=["course"],
    )
    fastapi_app.include_router(
        course_feedback_router,
        prefix="/api/orgs/{org_id}/course-instances",
        tags=["course"],
    )
    fastapi_app.include_router(
        course_homework_router,
        prefix="/api/orgs/{org_id}/course-instances",
        tags=["course"],
    )
    fastapi_app.include_router(
        course_public_enroll_router,
        prefix="/api/public/courses",
        tags=["course-public"],
    )

    # ─── Phase 3 Tier 2: Group module (5 sub-routers) ────────
    # 镜像 Node app.ts:183-186 + :230 公开报名
    fastapi_app.include_router(
        group_scheme_router,
        prefix="/api/orgs/{org_id}/group-schemes",
        tags=["group"],
    )
    fastapi_app.include_router(
        group_instance_router,
        prefix="/api/orgs/{org_id}/group-instances",
        tags=["group"],
    )
    fastapi_app.include_router(
        group_enrollment_router,
        prefix="/api/orgs/{org_id}/group-instances",
        tags=["group"],
    )
    fastapi_app.include_router(
        group_session_router,
        prefix="/api/orgs/{org_id}/group-instances",
        tags=["group"],
    )
    fastapi_app.include_router(
        group_public_enroll_router,
        prefix="/api/public/groups",
        tags=["group-public"],
    )

    # ─── Phase 3 Tier 2: Assessment module (7 sub-routers) ───
    # 镜像 Node app.ts:153-158 + :161 公开匿名提交
    fastapi_app.include_router(
        assessment_router,
        prefix="/api/orgs/{org_id}/assessments",
        tags=["assessment"],
    )
    fastapi_app.include_router(
        assessment_scale_router,
        prefix="/api/orgs/{org_id}/scales",
        tags=["assessment"],
    )
    fastapi_app.include_router(
        assessment_result_router,
        prefix="/api/orgs/{org_id}/results",
        tags=["assessment"],
    )
    fastapi_app.include_router(
        assessment_batch_router,
        prefix="/api/orgs/{org_id}/assessment-batches",
        tags=["assessment"],
    )
    fastapi_app.include_router(
        assessment_report_router,
        prefix="/api/orgs/{org_id}/reports",
        tags=["assessment"],
    )
    fastapi_app.include_router(
        assessment_distribution_router,
        prefix="/api/orgs/{org_id}/assessments/{assessment_id}/distributions",
        tags=["assessment"],
    )
    fastapi_app.include_router(
        public_result_router,
        prefix="/api/public/assessments",
        tags=["assessment-public"],
    )

    # ─── Phase 3 Tier 2: Enrollment-response module (2 routers) ───
    # 镜像 Node app.ts:251-252
    fastapi_app.include_router(
        enrollment_response_router,
        prefix="/api/orgs/{org_id}/enrollment-responses",
        tags=["enrollment-response"],
    )
    fastapi_app.include_router(
        enrollment_response_client_router,
        prefix="/api/orgs/{org_id}/client/enrollment-responses",
        tags=["enrollment-response"],
    )

    # ─── Phase 3 Tier 3: Counseling module (12 sub-routers) ───
    # 镜像 Node app.ts:164-172 + :246-247 + :270 公开注册
    fastapi_app.include_router(
        counseling_episode_router,
        prefix="/api/orgs/{org_id}/episodes",
        tags=["counseling"],
    )
    fastapi_app.include_router(
        appointment_router, prefix="/api/orgs/{org_id}/appointments", tags=["counseling"]
    )
    fastapi_app.include_router(
        availability_router, prefix="/api/orgs/{org_id}/availability", tags=["counseling"]
    )
    fastapi_app.include_router(
        session_note_router, prefix="/api/orgs/{org_id}/session-notes", tags=["counseling"]
    )
    fastapi_app.include_router(
        note_template_router, prefix="/api/orgs/{org_id}/note-templates", tags=["counseling"]
    )
    fastapi_app.include_router(
        goal_library_router, prefix="/api/orgs/{org_id}/goal-library", tags=["counseling"]
    )
    fastapi_app.include_router(
        client_profile_router, prefix="/api/orgs/{org_id}/clients", tags=["counseling"]
    )
    fastapi_app.include_router(
        treatment_plan_router, prefix="/api/orgs/{org_id}/treatment-plans", tags=["counseling"]
    )
    fastapi_app.include_router(
        ai_conversation_router,
        prefix="/api/orgs/{org_id}/ai-conversations",
        tags=["counseling"],
    )
    fastapi_app.include_router(
        client_assignment_router,
        prefix="/api/orgs/{org_id}/client-assignments",
        tags=["counseling"],
    )
    fastapi_app.include_router(
        client_access_grant_router,
        prefix="/api/orgs/{org_id}/client-access-grants",
        tags=["counseling"],
    )
    fastapi_app.include_router(
        counseling_public_router,
        prefix="/api/public/counseling",
        tags=["counseling-public"],
    )

    # ─── Phase 3 Tier 3: EAP module (4 routers) ───
    # 镜像 Node app.ts:266-269
    fastapi_app.include_router(
        eap_partnership_router,
        prefix="/api/orgs/{org_id}/eap/partnerships",
        tags=["eap"],
    )
    fastapi_app.include_router(
        eap_assignment_router,
        prefix="/api/orgs/{org_id}/eap/assignments",
        tags=["eap"],
    )
    fastapi_app.include_router(
        eap_analytics_router,
        prefix="/api/orgs/{org_id}/eap/analytics",
        tags=["eap"],
    )
    fastapi_app.include_router(eap_public_router, prefix="/api/public/eap", tags=["eap-public"])

    # ─── Phase 3 Tier 3: School module (3 routers) ───
    # 镜像 Node app.ts:273-275
    fastapi_app.include_router(
        school_class_router,
        prefix="/api/orgs/{org_id}/school/classes",
        tags=["school"],
    )
    fastapi_app.include_router(
        school_student_router,
        prefix="/api/orgs/{org_id}/school/students",
        tags=["school"],
    )
    fastapi_app.include_router(
        school_analytics_router,
        prefix="/api/orgs/{org_id}/school/analytics",
        tags=["school"],
    )

    # ─── Phase 3 Tier 3: Client portal (1 主 router 含 9 sub-router 聚合) ───
    # 镜像 Node app.ts:236
    fastapi_app.include_router(
        client_portal_router,
        prefix="/api/orgs/{org_id}/client",
        tags=["client-portal"],
    )

    # ─── Phase 3 Tier 3: Parent binding (3 routers) ───
    # 镜像 Node app.ts:278-280
    fastapi_app.include_router(
        parent_binding_admin_router,
        prefix="/api/orgs/{org_id}/school/classes/{class_id}/parent-invite-tokens",
        tags=["parent-binding"],
    )
    fastapi_app.include_router(
        portal_children_router,
        prefix="/api/orgs/{org_id}/client/children",
        tags=["parent-binding"],
    )
    fastapi_app.include_router(
        parent_binding_public_router,
        prefix="/api/public/parent-bind",
        tags=["parent-binding-public"],
    )

    # ─── Phase 3 Tier 4: admin 后台 (5 sub-routers, system_admin) ───
    # 镜像 Node app.ts:239-243
    fastapi_app.include_router(admin_router, prefix="/api/admin", tags=["admin"])
    fastapi_app.include_router(
        admin_dashboard_router, prefix="/api/admin/dashboard", tags=["admin"]
    )
    fastapi_app.include_router(admin_library_router, prefix="/api/admin/library", tags=["admin"])
    fastapi_app.include_router(admin_license_router, prefix="/api/admin/licenses", tags=["admin"])
    fastapi_app.include_router(admin_tenant_router, prefix="/api/admin/tenants", tags=["admin"])

    # ─── Phase 3 Tier 4: ai (BYOK 关键, 7 sub-routers + 2 ai_credentials) ───
    # 镜像 Node app.ts:177 (单 aiRoutes, Python 拆 7 个 sub 同 prefix)
    fastapi_app.include_router(ai_router, prefix="/api/orgs/{org_id}/ai", tags=["ai"])
    fastapi_app.include_router(ai_assessment_router, prefix="/api/orgs/{org_id}/ai", tags=["ai"])
    fastapi_app.include_router(ai_treatment_router, prefix="/api/orgs/{org_id}/ai", tags=["ai"])
    fastapi_app.include_router(ai_templates_router, prefix="/api/orgs/{org_id}/ai", tags=["ai"])
    fastapi_app.include_router(
        ai_scales_material_router, prefix="/api/orgs/{org_id}/ai", tags=["ai"]
    )
    fastapi_app.include_router(
        ai_course_authoring_router, prefix="/api/orgs/{org_id}/ai", tags=["ai"]
    )
    fastapi_app.include_router(ai_group_schemes_router, prefix="/api/orgs/{org_id}/ai", tags=["ai"])
    # ai_credentials BYOK CRUD (system_admin + org_admin)
    fastapi_app.include_router(
        ai_credentials_system_router,
        prefix="/api/ai-credentials",
        tags=["ai-credentials"],
    )
    fastapi_app.include_router(
        ai_credentials_org_router,
        prefix="/api/orgs/{org_id}/ai-credentials",
        tags=["ai-credentials"],
    )

    # ─── Phase 3 Tier 4: 后台业务模块 ───
    # crisis (镜像 Node app.ts:260)
    fastapi_app.include_router(crisis_router, prefix="/api/orgs/{org_id}/crisis", tags=["crisis"])
    # workflow (镜像 Node app.ts:259)
    fastapi_app.include_router(
        workflow_router, prefix="/api/orgs/{org_id}/workflow", tags=["workflow"]
    )
    # triage (镜像 Node app.ts:261)
    fastapi_app.include_router(triage_router, prefix="/api/orgs/{org_id}/triage", tags=["triage"])
    # collaboration (镜像 Node app.ts:258)
    fastapi_app.include_router(
        collaboration_router,
        prefix="/api/orgs/{org_id}/collaboration",
        tags=["collaboration"],
    )
    # compliance (consent + review, 镜像 Node app.ts:217-218)
    fastapi_app.include_router(
        compliance_consent_router,
        prefix="/api/orgs/{org_id}/compliance",
        tags=["compliance"],
    )
    fastapi_app.include_router(
        compliance_review_router,
        prefix="/api/orgs/{org_id}/compliance",
        tags=["compliance"],
    )
    # delivery + person-archive (镜像 Node app.ts:196 + :198, 都 root /api/orgs/{org_id})
    fastapi_app.include_router(delivery_router, prefix="/api/orgs/{org_id}", tags=["delivery"])
    fastapi_app.include_router(
        delivery_person_archive_router,
        prefix="/api/orgs/{org_id}",
        tags=["delivery"],
    )
    # follow-up (镜像 Node app.ts:174)
    fastapi_app.include_router(
        follow_up_router,
        prefix="/api/orgs/{org_id}/follow-up",
        tags=["follow-up"],
    )
    # referral (镜像 Node app.ts:173 + :255 公开)
    fastapi_app.include_router(
        referral_router,
        prefix="/api/orgs/{org_id}/referrals",
        tags=["referral"],
    )
    fastapi_app.include_router(
        referral_public_router,
        prefix="/api/public/referrals",
        tags=["referral-public"],
    )

    @fastapi_app.get("/health", tags=["meta"])
    async def health() -> dict[str, Any]:
        """
        Liveness/readiness probe.

        Caddy / Docker / k8s 用此判定容器是否健康。Phase 6 shadow 流量
        对比 (Node :4000/health vs Python :8001/health) 也走这条。
        """
        return {
            "status": "ok",
            "version": app_version,
            "environment": settings.NODE_ENV,
        }

    return fastapi_app


app = create_app()
