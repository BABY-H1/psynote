"""
Course API 请求 / 响应 schemas (Pydantic v2)。

镜像 server/src/modules/course/{course,instance,course-enrollment,feedback,homework,
public-course-enroll}.routes.ts 的 JSON shape — client / portal 仍调旧合约
(camelCase), 故所有 schema 走 ``alias_generator=to_camel`` + ``populate_by_name=True``:
内部 Python 用 snake_case, JSON wire 用 camelCase。

涵盖 6 个 sub-router 的全部 schemas (集中在一处, 与 auth/schemas.py + org/schemas.py
风格一致):
  - courses (CRUD + lifecycle + clone + blueprint + lesson_blocks + tags)
  - instances (CRUD + lifecycle + candidates)
  - enrollment (list + assign + batch-enroll + approval)
  - feedback (forms CRUD + responses + stats)
  - homework (defs CRUD + submissions + review)
  - public-enroll (info + apply, no auth)
"""

from __future__ import annotations

from datetime import date as date_type
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    """所有 course schema 的基类 — wire camelCase, Python snake_case。"""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        # 防 dump 时多写 alias key (e.g. 既 access_token 又 accessToken)
        serialize_by_alias=True,
    )


# ─── 通用 ─────────────────────────────────────────────────────────


class OkResponse(_CamelModel):
    """统一 OK 信封."""

    ok: bool = True


# ─── Course CRUD ─────────────────────────────────────────────────


class ChapterInput(_CamelModel):
    """``POST /courses`` body 内嵌的 chapter 定义 (镜像 course.routes.ts:58-68)."""

    title: str = Field(min_length=1)
    content: str | None = None
    video_url: str | None = None
    duration: str | None = None
    sort_order: int | None = None
    related_assessment_id: str | None = None
    session_goal: str | None = None
    core_concepts: str | None = None
    interaction_suggestions: str | None = None
    homework_suggestion: str | None = None


class CourseCreateRequest(_CamelModel):
    """``POST /api/orgs/{org_id}/courses`` body. 镜像 course.routes.ts:42-69."""

    title: str = Field(min_length=1)
    description: str | None = None
    category: str | None = None
    cover_url: str | None = None
    duration: str | None = None
    is_public: bool | None = None
    status: str | None = None
    course_type: str | None = None
    target_audience: str | None = None
    scenario: str | None = None
    is_template: bool | None = None
    creation_mode: str | None = None
    requirements_config: dict[str, Any] | None = None
    blueprint_data: dict[str, Any] | None = None
    tags: list[str] | None = None
    chapters: list[ChapterInput] | None = None


class CourseUpdateRequest(_CamelModel):
    """``PATCH /api/orgs/{org_id}/courses/{course_id}`` body (部分字段)."""

    title: str | None = None
    description: str | None = None
    category: str | None = None
    cover_url: str | None = None
    duration: str | None = None
    is_public: bool | None = None
    status: str | None = None
    course_type: str | None = None
    target_audience: str | None = None
    scenario: str | None = None
    responsible_id: str | None = None
    is_template: bool | None = None
    requirements_config: dict[str, Any] | None = None
    blueprint_data: dict[str, Any] | None = None
    tags: list[str] | None = None


class ChapterOutput(_CamelModel):
    """章节输出 (course detail 嵌入)。"""

    id: str
    course_id: str
    title: str
    content: str | None = None
    video_url: str | None = None
    duration: str | None = None
    sort_order: int = 0
    related_assessment_id: str | None = None
    session_goal: str | None = None
    core_concepts: str | None = None
    interaction_suggestions: str | None = None
    homework_suggestion: str | None = None


class CourseSummary(_CamelModel):
    """``GET /courses`` 列表项 (与 detail 同字段, 但不含 chapters)."""

    id: str
    org_id: str | None = None
    title: str
    description: str | None = None
    category: str | None = None
    cover_url: str | None = None
    duration: str | None = None
    is_public: bool = False
    status: str = "draft"
    creation_mode: str = "manual"
    course_type: str | None = None
    target_audience: str | None = None
    scenario: str | None = None
    responsible_id: str | None = None
    is_template: bool = False
    source_template_id: str | None = None
    requirements_config: dict[str, Any] = Field(default_factory=dict)
    blueprint_data: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    created_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class CourseDetail(CourseSummary):
    """``GET /courses/{id}`` 详情 — summary + chapters."""

    chapters: list[ChapterOutput] = Field(default_factory=list)


class BlueprintSession(_CamelModel):
    """``POST /confirm-blueprint`` body 内嵌的 session shape."""

    title: str = Field(min_length=1)
    goal: str
    core_concepts: str
    interaction_suggestions: str
    homework_suggestion: str


class ConfirmBlueprintRequest(_CamelModel):
    """``POST /courses/{id}/confirm-blueprint`` body."""

    sessions: list[BlueprintSession] = Field(min_length=1)


class LessonBlockInput(_CamelModel):
    """``PUT /courses/{id}/chapters/{chapterId}/blocks`` body 内 block."""

    id: str | None = None
    block_type: str = Field(min_length=1)
    content: str | None = None
    sort_order: int = 0
    ai_generated: bool | None = None
    last_ai_instruction: str | None = None


class LessonBlocksUpsertRequest(_CamelModel):
    """``PUT /courses/{id}/chapters/{chapterId}/blocks`` body."""

    blocks: list[LessonBlockInput] = Field(default_factory=list)


class LessonBlockUpdateRequest(_CamelModel):
    """``PATCH /courses/{id}/chapters/{chapterId}/blocks/{blockId}`` body."""

    content: str | None = None
    ai_generated: bool | None = None
    last_ai_instruction: str | None = None


class LessonBlockOutput(_CamelModel):
    id: str
    chapter_id: str
    block_type: str
    content: str | None = None
    sort_order: int = 0
    ai_generated: bool = False
    last_ai_instruction: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


# ─── Enrollment (course.routes.ts:191-228) ────────────────────────


class EnrollSelfRequest(_CamelModel):
    """``POST /courses/{id}/enroll`` body (可选 careEpisodeId)."""

    care_episode_id: str | None = None


class AssignToClientRequest(_CamelModel):
    """``POST /courses/{id}/assign`` body (counselor 指派课程给来访者)."""

    client_user_id: str = Field(min_length=1)
    care_episode_id: str | None = None


class CourseProgressRequest(_CamelModel):
    """``PATCH /courses/enrollments/{enrollmentId}/progress`` body."""

    chapter_id: str = Field(min_length=1)
    completed: bool


class EnrollmentOutput(_CamelModel):
    """单个 enrollment 输出 (course.service.ts 返回的 row + user info)."""

    id: str
    course_id: str
    instance_id: str | None = None
    user_id: str
    care_episode_id: str | None = None
    assigned_by: str | None = None
    enrollment_source: str | None = "self_enroll"
    approval_status: str | None = "auto_approved"
    approved_by: str | None = None
    progress: dict[str, Any] = Field(default_factory=dict)
    status: str = "enrolled"
    enrolled_at: datetime | None = None
    completed_at: datetime | None = None
    user_name: str | None = None
    user_email: str | None = None


# ─── Template Tags (course.routes.ts:230-251) ─────────────────────


class TemplateTagCreateRequest(_CamelModel):
    """``POST /courses/template-tags`` body."""

    name: str = Field(min_length=1)
    color: str | None = None


class TemplateTagOutput(_CamelModel):
    id: str
    org_id: str
    name: str
    color: str | None = None
    created_at: datetime | None = None


# ─── Instances ────────────────────────────────────────────────────


class InstanceCreateRequest(_CamelModel):
    """``POST /api/orgs/{org_id}/course-instances`` body. 镜像 instance.routes.ts:53-67."""

    course_id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    description: str | None = None
    publish_mode: str = Field(min_length=1)
    status: str | None = None
    capacity: int | None = None
    target_group_label: str | None = None
    responsible_id: str | None = None
    assessment_config: dict[str, Any] | None = None
    location: str | None = None
    start_date: date_type | None = None
    schedule: str | None = None


class InstanceUpdateRequest(_CamelModel):
    title: str | None = None
    description: str | None = None
    publish_mode: str | None = None
    status: str | None = None
    capacity: int | None = None
    target_group_label: str | None = None
    responsible_id: str | None = None
    assessment_config: dict[str, Any] | None = None
    location: str | None = None
    start_date: date_type | None = None
    schedule: str | None = None


class InstanceOutput(_CamelModel):
    """单个 instance 输出 (列表 / 详情共用基础形状)."""

    id: str
    org_id: str
    course_id: str
    title: str
    description: str | None = None
    publish_mode: str = "assign"
    status: str = "draft"
    capacity: int | None = None
    target_group_label: str | None = None
    responsible_id: str | None = None
    assessment_config: dict[str, Any] = Field(default_factory=dict)
    location: str | None = None
    start_date: date_type | None = None
    schedule: str | None = None
    created_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class InstanceListItem(InstanceOutput):
    """``GET /course-instances`` 列表项 (含 join 出的 course + 报名计数)。"""

    course_type: str | None = None
    target_audience: str | None = None
    course_category: str | None = None
    enrollment_count: int = 0


class CourseEmbed(_CamelModel):
    """instance detail 里嵌入的简略 course."""

    title: str | None = None
    category: str | None = None


class EnrollmentStats(_CamelModel):
    total: int
    completed: int


class InstanceDetail(InstanceOutput):
    """``GET /course-instances/{id}`` 详情 — instance + course embed + stats."""

    course: CourseEmbed = Field(default_factory=CourseEmbed)
    enrollment_stats: EnrollmentStats = Field(
        default_factory=lambda: EnrollmentStats(total=0, completed=0)
    )


# ─── Enrollment Routes (course-enrollment.routes.ts) ──────────────


class AssignUsersRequest(_CamelModel):
    """``POST /course-instances/{id}/assign`` body."""

    user_ids: list[str] = Field(min_length=1)
    care_episode_id: str | None = None


class BatchEnrollRequest(_CamelModel):
    """``POST /course-instances/{id}/batch-enroll`` body."""

    user_ids: list[str] = Field(min_length=1)
    group_label: str | None = None


class AssignResultEntry(_CamelModel):
    """assign / batch-enroll 单条结果 (skipped 重复, 否则新建)."""

    user_id: str
    skipped: bool
    enrollment_id: str


class AssignResponse(_CamelModel):
    results: list[AssignResultEntry]


class BatchEnrollResponse(_CamelModel):
    results: list[AssignResultEntry]
    group_label: str | None = None


class EnrollmentApprovalRequest(_CamelModel):
    """``PATCH /course-instances/{id}/enrollments/{enrollmentId}`` body."""

    approval_status: str = Field(min_length=1)


# ─── Feedback Routes (feedback.routes.ts + service.ts) ────────────


class FeedbackFormCreateRequest(_CamelModel):
    """``POST /course-instances/{id}/feedback-forms`` body."""

    chapter_id: str | None = None
    title: str | None = None
    questions: Any = None  # JSON 透传 (questions array)


class FeedbackFormUpdateRequest(_CamelModel):
    title: str | None = None
    questions: Any = None
    is_active: bool | None = None


class FeedbackFormOutput(_CamelModel):
    id: str
    instance_id: str
    chapter_id: str | None = None
    title: str | None = None
    questions: list[Any] = Field(default_factory=list)
    is_active: bool = True
    created_at: datetime | None = None


class FeedbackResponseSubmitRequest(_CamelModel):
    """``POST /course-instances/{id}/feedback/{formId}/submit`` body."""

    answers: Any = None


class FeedbackResponseOutput(_CamelModel):
    id: str
    form_id: str
    enrollment_id: str
    answers: list[Any] = Field(default_factory=list)
    submitted_at: datetime | None = None
    user_name: str | None = None
    user_email: str | None = None


class FeedbackStatsItem(_CamelModel):
    """``GET /feedback-stats`` 单条记录."""

    form_id: str | None = None
    form_title: str | None = None
    response_count: int = 0


# ─── Homework Routes (homework.routes.ts + service.ts) ────────────


class HomeworkDefCreateRequest(_CamelModel):
    """``POST /course-instances/{id}/homework-defs`` body."""

    chapter_id: str | None = None
    title: str | None = None
    description: str | None = None
    question_type: str = Field(min_length=1)
    options: Any = None
    is_required: bool | None = None
    sort_order: int | None = None


class HomeworkDefUpdateRequest(_CamelModel):
    title: str | None = None
    description: str | None = None
    question_type: str | None = None
    options: Any = None
    is_required: bool | None = None
    sort_order: int | None = None


class HomeworkDefOutput(_CamelModel):
    id: str
    instance_id: str
    chapter_id: str | None = None
    title: str | None = None
    description: str | None = None
    question_type: str = "text"
    options: Any = None
    is_required: bool = True
    sort_order: int = 0
    created_at: datetime | None = None


class HomeworkSubmitRequest(_CamelModel):
    """``POST /course-instances/{id}/homework/{defId}/submit`` body."""

    content: str | None = None
    selected_options: Any = None


class HomeworkSubmissionOutput(_CamelModel):
    id: str
    homework_def_id: str
    enrollment_id: str
    content: str | None = None
    selected_options: Any = None
    status: str = "submitted"
    review_comment: str | None = None
    reviewed_by: str | None = None
    reviewed_at: datetime | None = None
    submitted_at: datetime | None = None
    updated_at: datetime | None = None
    user_name: str | None = None
    user_email: str | None = None


class HomeworkReviewRequest(_CamelModel):
    """``PATCH /course-instances/{id}/homework/submissions/{subId}/review`` body."""

    review_comment: str = Field(min_length=1)


# ─── Public Course Enroll (public-course-enroll.routes.ts) ────────


class PublicCourseInfo(_CamelModel):
    """``GET /api/public/courses/{instanceId}`` 公开课程信息 (无 auth)."""

    id: str
    title: str
    description: str | None = None
    course_title: str | None = None
    course_description: str | None = None
    capacity: int | None = None
    approved_count: int
    pending_count: int
    spots_left: int | None = None


class PublicEnrollApplyRequest(_CamelModel):
    """``POST /api/public/courses/{instanceId}/apply`` body. 镜像 routes.ts:78-82."""

    name: str = Field(min_length=1)
    email: EmailStr
    phone: str | None = None


class PublicEnrollApplyResponse(_CamelModel):
    """``POST /apply`` 201 返回."""

    success: bool = True
    enrollment_id: str
    approval_status: str = "pending"
    message: str = "报名成功!请等待审核。"
