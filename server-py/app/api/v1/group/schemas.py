"""
Group API 请求 / 响应 schemas (Pydantic v2)。

镜像 ``server/src/modules/group/`` 下 5 个 routes 文件
(scheme / instance / session / enrollment / public-enroll) 的 JSON shape。
client / portal 仍调旧合约 (camelCase), 故所有 schema 走
``alias_generator=to_camel`` + ``populate_by_name=True``: 内部 Python 用 snake_case,
JSON wire 用 camelCase。

涵盖:
  - scheme  (CRUD + sessions 子表 phases / related_goals / ...)
  - instance (CRUD + assessment_config 生命周期评估配置)
  - session (records + attendance)
  - enrollment (admin batch / approve / reject)
  - public-enroll (申请 + 自助签到)
"""

from __future__ import annotations

from datetime import date as date_type
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    """所有 group schema 的基类 — wire camelCase, Python snake_case."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        # 防 dump 时多写 alias key (e.g. 既 access_token 又 accessToken)
        serialize_by_alias=True,
    )


# ─── 通用 ─────────────────────────────────────────────────────


class OkResponse(_CamelModel):
    ok: bool = True


class SuccessResponse(_CamelModel):
    success: bool = True


# ─── Scheme — group_schemes 模板 ──────────────────────────────────


class SchemeSessionInput(_CamelModel):
    """嵌入 SchemeCreateRequest 的 session 设计 (与 group_scheme_sessions 列对应).

    镜像 scheme.service.ts:85-98 的 SessionInput interface.
    """

    title: str
    goal: str | None = None
    phases: list[dict[str, Any]] | None = None
    materials: str | None = None
    duration: str | None = None
    homework: str | None = None
    assessment_notes: str | None = None
    related_goals: list[int] | None = None
    session_theory: str | None = None
    session_evaluation: str | None = None
    sort_order: int | None = None
    related_assessments: list[str] | None = None


class SchemeCreateRequest(_CamelModel):
    """``POST /``. 镜像 scheme.routes.ts:24-38 的 body."""

    title: str = Field(min_length=1)
    description: str | None = None
    theory: str | None = None
    overall_goal: str | None = None
    specific_goals: list[str] | None = None
    target_audience: str | None = None
    age_range: str | None = None
    selection_criteria: str | None = None
    recommended_size: str | None = None
    total_sessions: int | None = None
    session_duration: str | None = None
    frequency: str | None = None
    facilitator_requirements: str | None = None
    evaluation_method: str | None = None
    notes: str | None = None
    recruitment_assessments: list[str] | None = None
    overall_assessments: list[str] | None = None
    screening_notes: str | None = None
    visibility: str | None = None
    sessions: list[SchemeSessionInput] | None = None


class SchemeUpdateRequest(_CamelModel):
    """``PATCH /:schemeId``. 镜像 scheme.routes.ts:40-50 — 所有字段可选."""

    title: str | None = None
    description: str | None = None
    theory: str | None = None
    overall_goal: str | None = None
    specific_goals: list[str] | None = None
    target_audience: str | None = None
    age_range: str | None = None
    selection_criteria: str | None = None
    recommended_size: str | None = None
    total_sessions: int | None = None
    session_duration: str | None = None
    frequency: str | None = None
    facilitator_requirements: str | None = None
    evaluation_method: str | None = None
    notes: str | None = None
    recruitment_assessments: list[str] | None = None
    overall_assessments: list[str] | None = None
    screening_notes: str | None = None
    visibility: str | None = None
    sessions: list[SchemeSessionInput] | None = None


class SchemeSessionRow(_CamelModel):
    id: str
    scheme_id: str
    title: str
    goal: str | None = None
    phases: list[dict[str, Any]] = Field(default_factory=list)
    materials: str | None = None
    duration: str | None = None
    homework: str | None = None
    assessment_notes: str | None = None
    related_goals: list[int] = Field(default_factory=list)
    session_theory: str | None = None
    session_evaluation: str | None = None
    sort_order: int = 0
    related_assessments: list[str] = Field(default_factory=list)


class SchemeRow(_CamelModel):
    """``GET / / :schemeId``  + ``POST /`` / ``PATCH /:schemeId`` 响应."""

    id: str
    org_id: str | None = None
    title: str
    description: str | None = None
    theory: str | None = None
    overall_goal: str | None = None
    specific_goals: list[str] = Field(default_factory=list)
    target_audience: str | None = None
    age_range: str | None = None
    selection_criteria: str | None = None
    recommended_size: str | None = None
    total_sessions: int | None = None
    session_duration: str | None = None
    frequency: str | None = None
    facilitator_requirements: str | None = None
    evaluation_method: str | None = None
    notes: str | None = None
    recruitment_assessments: list[str] = Field(default_factory=list)
    overall_assessments: list[str] = Field(default_factory=list)
    screening_notes: str | None = None
    visibility: str = "personal"
    created_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    sessions: list[SchemeSessionRow] = Field(default_factory=list)


# ─── Instance — group_instances 实例化 ─────────────────────────────


class InstanceCreateRequest(_CamelModel):
    """``POST /``. 镜像 instance.routes.ts:45-76."""

    title: str = Field(min_length=1)
    description: str | None = None
    scheme_id: str | None = None
    category: str | None = None
    leader_id: str | None = None
    schedule: str | None = None
    duration: str | None = None
    start_date: date_type | None = None
    location: str | None = None
    status: str | None = None
    capacity: int | None = None
    recruitment_assessments: list[str] | None = None
    overall_assessments: list[str] | None = None
    screening_notes: str | None = None
    assessment_config: dict[str, Any] | None = None


class InstanceUpdateRequest(_CamelModel):
    """``PATCH /:instanceId``. 镜像 instance.routes.ts:78-102."""

    title: str | None = None
    description: str | None = None
    category: str | None = None
    leader_id: str | None = None
    schedule: str | None = None
    duration: str | None = None
    start_date: date_type | None = None
    location: str | None = None
    status: str | None = None
    capacity: int | None = None
    recruitment_assessments: list[str] | None = None
    overall_assessments: list[str] | None = None
    screening_notes: str | None = None
    assessment_config: dict[str, Any] | None = None


class InstanceRow(_CamelModel):
    """``GET /`` 列表项 / ``POST /`` / ``PATCH /:instanceId`` 响应."""

    id: str
    org_id: str
    scheme_id: str | None = None
    title: str
    description: str | None = None
    category: str | None = None
    leader_id: str | None = None
    schedule: str | None = None
    duration: str | None = None
    start_date: date_type | None = None
    location: str | None = None
    status: str = "draft"
    capacity: int | None = None
    recruitment_assessments: list[str] = Field(default_factory=list)
    overall_assessments: list[str] = Field(default_factory=list)
    screening_notes: str | None = None
    assessment_config: dict[str, Any] = Field(default_factory=dict)
    created_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class InstanceUserSummary(_CamelModel):
    name: str | None = None
    email: str | None = None


class InstanceEnrollmentRow(_CamelModel):
    """instance detail 中的 enrollment 项 (含 user 摘要)."""

    id: str
    instance_id: str
    user_id: str
    care_episode_id: str | None = None
    status: str
    screening_result_id: str | None = None
    enrolled_at: datetime | None = None
    created_at: datetime | None = None
    user: InstanceUserSummary


class InstanceDetail(InstanceRow):
    """``GET /:instanceId`` 详情 (含 enrollments 用户摘要)."""

    enrollments: list[InstanceEnrollmentRow] = Field(default_factory=list)


# ─── Session — records + attendance ────────────────────────────────


class SessionRecordCreateRequest(_CamelModel):
    """``POST /:instanceId/sessions`` ad-hoc 创建. 镜像 session.routes.ts:36-54."""

    title: str = Field(min_length=1)
    session_number: int = Field(ge=1)
    date: date_type | None = None


class SessionRecordUpdateRequest(_CamelModel):
    """``PATCH /:instanceId/sessions/:sessionId``. 镜像 session.routes.ts:57-71."""

    status: str | None = None
    date: date_type | None = None
    notes: str | None = None
    title: str | None = None


class SessionRecordRow(_CamelModel):
    """``GET / / POST / PATCH`` 单条 record 响应."""

    id: str
    instance_id: str
    scheme_session_id: str | None = None
    session_number: int
    title: str
    date: date_type | None = None
    status: str = "planned"
    notes: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class SessionRecordListItem(SessionRecordRow):
    """``GET /:instanceId/sessions`` 列表项 (附出勤计数)."""

    attendance_count: int = 0
    total_attendance: int = 0


class SessionAttendanceUserSummary(_CamelModel):
    id: str | None = None
    name: str | None = None
    email: str | None = None


class SessionAttendanceItem(_CamelModel):
    id: str
    session_record_id: str
    enrollment_id: str
    status: str
    note: str | None = None
    created_at: datetime | None = None
    user: SessionAttendanceUserSummary


class SessionRecordDetail(SessionRecordRow):
    """``GET /:instanceId/sessions/:sessionId`` 详情 (含出勤名单)."""

    attendance: list[SessionAttendanceItem] = Field(default_factory=list)


class AttendanceInputItem(_CamelModel):
    """``POST /:instanceId/sessions/:sessionId/attendance`` 子项."""

    enrollment_id: str
    status: str
    note: str | None = None


class AttendanceBatchRequest(_CamelModel):
    attendances: list[AttendanceInputItem]


class AttendanceRow(_CamelModel):
    id: str
    session_record_id: str
    enrollment_id: str
    status: str
    note: str | None = None


# ─── Enrollment — admin/portal ────────────────────────────────────


class EnrollMemberInput(_CamelModel):
    user_id: str | None = None
    name: str | None = None
    email: str | None = None
    phone: str | None = None


class EnrollBatchRequest(_CamelModel):
    members: list[EnrollMemberInput]


class EnrollBatchErrorEntry(_CamelModel):
    index: int
    message: str


class EnrollBatchResponse(_CamelModel):
    enrolled: int
    errors: list[EnrollBatchErrorEntry] = Field(default_factory=list)


class EnrollSelfRequest(_CamelModel):
    """``POST /:instanceId/enroll``. 镜像 enrollment.routes.ts:65-82."""

    user_id: str | None = None
    care_episode_id: str | None = None
    screening_result_id: str | None = None


class EnrollmentRow(_CamelModel):
    id: str
    instance_id: str
    user_id: str
    care_episode_id: str | None = None
    status: str
    screening_result_id: str | None = None
    enrolled_at: datetime | None = None
    created_at: datetime | None = None


class EnrollmentStatusUpdateRequest(_CamelModel):
    """``PATCH /enrollments/:enrollmentId``. 镜像 enrollment.routes.ts:85-101."""

    status: str = Field(min_length=1)


# ─── Public Enroll — 公开 (无 auth) ───────────────────────────────


class PublicSchemeInfo(_CamelModel):
    title: str
    description: str | None = None
    theory: str | None = None
    overall_goal: str | None = None
    target_audience: str | None = None
    age_range: str | None = None
    recommended_size: str | None = None
    total_sessions: int | None = None
    session_duration: str | None = None
    frequency: str | None = None
    session_count: int = 0


class PublicInstanceInfo(_CamelModel):
    """``GET /:instanceId`` (无 auth) 招募页用.

    注: 这个 schema 不强制由 router 用 — router 直接 dict 返回, 与 Node 端的 ``error: 'not_found'`` 错误信封一致.
    保留 schema 仅作文档. 实际 router 走 dict, 让错误分支 (not_recruiting / not_found) 灵活."""

    id: str
    title: str
    description: str | None = None
    location: str | None = None
    start_date: date_type | None = None
    schedule: str | None = None
    duration: str | None = None
    capacity: int | None = None
    approved_count: int
    pending_count: int
    spots_left: int | None = None
    recruitment_assessments: list[str] = Field(default_factory=list)
    scheme: PublicSchemeInfo | None = None


class PublicApplyRequest(_CamelModel):
    """``POST /:instanceId/apply`` 公开申请."""

    name: str = Field(min_length=1)
    email: str | None = None
    phone: str | None = None


class PublicCheckinRequest(_CamelModel):
    """``POST /:instanceId/checkin/:sessionId``."""

    enrollment_id: str = Field(min_length=1)
