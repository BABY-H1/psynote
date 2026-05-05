"""
Counseling API 请求 / 响应 schemas (Pydantic v2)。

镜像 ``server/src/modules/counseling/*.routes.ts`` 的 JSON shape — client / portal
仍调旧合约 (camelCase), 故所有 schema 走 ``CamelModel`` (alias_generator=to_camel +
populate_by_name=True + serialize_by_alias=True): 内部 Python 用 snake_case, JSON
wire 用 camelCase。

涵盖 13 个 sub-router 的全部 schemas (集中一处, 与 course/schemas.py / assessment/schemas.py
风格一致):
  - episode (CRUD + triage + close/reopen + timeline)
  - appointment (CRUD + status)
  - availability (CRUD + slots)
  - session_note (CRUD)
  - note_template (CRUD + built-in)
  - treatment_plan (CRUD + goal-status)
  - client_profile (PUT upsert + summary)
  - client_assignment (CRUD)
  - client_access_grant (CRUD)
  - goal_library (CRUD)
  - ai_conversation (CRUD)
  - public (info + register)
"""

from __future__ import annotations

from datetime import date as date_type
from datetime import datetime
from typing import Any

from pydantic import EmailStr, Field

from app.api.v1._schema_base import CamelModel
from app.lib.phone_utils import CN_PHONE_REGEX

# ─── 通用 ─────────────────────────────────────────────────────────


class OkResponse(CamelModel):
    """统一 OK 信封."""

    success: bool = True


# ─── Episode (episode.routes.ts) ─────────────────────────────────


class EpisodeCreateRequest(CamelModel):
    """``POST /``创建个案 body。镜像 episode.routes.ts:19-25。"""

    client_id: str = Field(min_length=1)
    counselor_id: str | None = None
    chief_complaint: str | None = None
    current_risk: str | None = None
    intervention_type: str | None = None


class EpisodeUpdateRequest(CamelModel):
    """``PATCH /{episode_id}`` body — 部分字段。"""

    counselor_id: str | None = None
    status: str | None = None
    chief_complaint: str | None = None
    current_risk: str | None = None
    intervention_type: str | None = None


class TriageRequest(CamelModel):
    """``PATCH /{episode_id}/triage`` body — 分流决定确认。"""

    current_risk: str = Field(min_length=1)
    intervention_type: str = Field(min_length=1)
    note: str | None = None


class CloseRequest(CamelModel):
    """``POST /{episode_id}/close`` body — 可选 reason。"""

    reason: str | None = None


class ClientEmbed(CamelModel):
    """List 项中嵌入的来访者基本信息 (name + email)。"""

    name: str | None = None
    email: str | None = None


class EpisodeOutput(CamelModel):
    """单个 episode 输出 (base shape, 列表+详情共用)。"""

    id: str
    org_id: str
    client_id: str
    counselor_id: str | None = None
    status: str = "active"
    chief_complaint: str | None = None
    current_risk: str = "level_1"
    intervention_type: str | None = None
    opened_at: datetime | None = None
    closed_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class EpisodeDetail(EpisodeOutput):
    """``GET /{episode_id}`` 详情 — 嵌入 client。"""

    client: ClientEmbed = Field(default_factory=ClientEmbed)


class EpisodeListItem(EpisodeDetail):
    """``GET /`` 列表项 — episode + client + nextAppointment + sessionCount。"""

    next_appointment: str | None = None
    session_count: int = 0


class TimelineEvent(CamelModel):
    """``care_timeline`` 单行 — ``GET /{episode_id}/timeline`` 返回项。"""

    id: str
    care_episode_id: str
    event_type: str
    ref_id: str | None = None
    title: str
    summary: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_by: str | None = None
    created_at: datetime | None = None


class TimelineRef(CamelModel):
    """enriched timeline item 内嵌 ref 信息。"""

    type: str
    id: str | None = None


class EnrichedTimelineItem(CamelModel):
    """``GET /{episode_id}/timeline/enriched`` 返回项。

    一个统一形状的事件项 — kind 区分来源 (event / session_note / assessment_result /
    group_enrollment / course_enrollment / referral / follow_up_review)。
    """

    id: str
    kind: str
    occurred_at: datetime | None = None
    title: str
    summary: str | None = None
    ref: TimelineRef


# ─── Appointment (appointment.routes.ts) ─────────────────────────


class AppointmentCreateRequest(CamelModel):
    """``POST /`` 创建预约 body。镜像 appointment.routes.ts:43-53。"""

    care_episode_id: str | None = None
    client_id: str = Field(min_length=1)
    counselor_id: str | None = None
    start_time: datetime
    end_time: datetime
    type: str | None = None
    source: str | None = None
    notes: str | None = None


class AppointmentStatusRequest(CamelModel):
    """``PATCH /{appointment_id}/status`` body — 单字段更新 status。"""

    status: str = Field(min_length=1)


class AppointmentOutput(CamelModel):
    """单个 appointment 输出。"""

    id: str
    org_id: str
    care_episode_id: str | None = None
    client_id: str
    counselor_id: str
    start_time: datetime | None = None
    end_time: datetime | None = None
    status: str = "pending"
    type: str | None = None
    source: str | None = None
    notes: str | None = None
    reminder_sent_24h: bool = False
    reminder_sent_1h: bool = False
    client_confirmed_at: datetime | None = None
    confirm_token: str | None = None
    created_at: datetime | None = None


class AppointmentListItem(AppointmentOutput):
    """``GET /`` 列表项 — appointment + clientName。"""

    client_name: str | None = None


# ─── Availability (availability.routes.ts) ───────────────────────


class AvailabilityCreateRequest(CamelModel):
    """``POST /`` 创建排班 body。"""

    counselor_id: str | None = None
    day_of_week: int
    start_time: str = Field(min_length=1)
    end_time: str = Field(min_length=1)
    session_type: str | None = None


class AvailabilityUpdateRequest(CamelModel):
    """``PATCH /{slot_id}`` 部分更新。"""

    start_time: str | None = None
    end_time: str | None = None
    session_type: str | None = None
    is_active: bool | None = None


class AvailabilityOutput(CamelModel):
    """单个 availability slot 输出。"""

    id: str
    org_id: str
    counselor_id: str
    day_of_week: int
    start_time: str
    end_time: str
    session_type: str | None = None
    is_active: bool = True
    created_at: datetime | None = None


class FreeWindowOutput(CamelModel):
    """``GET /slots`` 返回的空闲时段 (减去已预约后的)。"""

    start: str
    end: str
    session_type: str | None = None


# ─── Session Note (session-note.routes.ts) ───────────────────────


class SessionNoteCreateRequest(CamelModel):
    """``POST /`` 创建会谈记录 body。镜像 session-note.routes.ts:46-63。"""

    care_episode_id: str | None = None
    appointment_id: str | None = None
    client_id: str = Field(min_length=1)
    note_format: str | None = None
    template_id: str | None = None
    session_date: date_type
    duration: int | None = None
    session_type: str | None = None
    subjective: str | None = None
    objective: str | None = None
    assessment: str | None = None
    plan: str | None = None
    fields: dict[str, str] | None = None
    summary: str | None = None
    tags: list[str] | None = None


class SessionNoteUpdateRequest(CamelModel):
    """``PATCH /{note_id}`` 部分更新。"""

    subjective: str | None = None
    objective: str | None = None
    assessment: str | None = None
    plan: str | None = None
    fields: dict[str, str] | None = None
    summary: str | None = None
    tags: list[str] | None = None


class SessionNoteOutput(CamelModel):
    """单个 session_note 输出。"""

    id: str
    org_id: str
    care_episode_id: str | None = None
    appointment_id: str | None = None
    client_id: str
    counselor_id: str
    note_format: str = "soap"
    template_id: str | None = None
    session_date: date_type | None = None
    duration: int | None = None
    session_type: str | None = None
    subjective: str | None = None
    objective: str | None = None
    assessment: str | None = None
    plan: str | None = None
    fields: dict[str, Any] = Field(default_factory=dict)
    summary: str | None = None
    tags: list[str] = Field(default_factory=list)
    status: str = "draft"
    supervisor_annotation: str | None = None
    submitted_for_review_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


# ─── Note Template (note-template.routes.ts) ─────────────────────


class FieldDefinitionInput(CamelModel):
    """``POST /`` body 内嵌字段定义 (custom 格式用)。"""

    key: str = Field(min_length=1)
    label: str = Field(min_length=1)
    placeholder: str | None = None
    required: bool = False
    order: int = 0


class NoteTemplateCreateRequest(CamelModel):
    """``POST /`` 创建模板 body。"""

    title: str = Field(min_length=1)
    format: str = Field(min_length=1)
    field_definitions: list[Any] = Field(min_length=1)
    visibility: str | None = None
    is_default: bool | None = None


class NoteTemplateUpdateRequest(CamelModel):
    """``PATCH /{template_id}`` 部分更新。"""

    title: str | None = None
    field_definitions: list[Any] | None = None
    visibility: str | None = None
    is_default: bool | None = None


class NoteTemplateOutput(CamelModel):
    """单个 note_template 输出 (含内置 + 自定义)。"""

    id: str
    title: str
    format: str
    field_definitions: list[Any] = Field(default_factory=list)
    is_default: bool = False
    visibility: str = "personal"
    org_id: str | None = None
    created_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


# ─── Treatment Plan (treatment-plan.routes.ts) ───────────────────


class TreatmentPlanCreateRequest(CamelModel):
    """``POST /`` 创建治疗计划 body。"""

    care_episode_id: str = Field(min_length=1)
    title: str | None = None
    approach: str | None = None
    goals: list[Any] | None = None
    interventions: list[Any] | None = None
    session_plan: str | None = None
    progress_notes: str | None = None
    review_date: date_type | None = None
    status: str | None = None


class TreatmentPlanUpdateRequest(CamelModel):
    """``PATCH /{plan_id}`` 部分更新。"""

    title: str | None = None
    approach: str | None = None
    goals: list[Any] | None = None
    interventions: list[Any] | None = None
    session_plan: str | None = None
    progress_notes: str | None = None
    review_date: date_type | None = None
    status: str | None = None


class GoalStatusRequest(CamelModel):
    """``PATCH /{plan_id}/goals/{goal_id}`` body — 仅更新某 goal 的 status。"""

    status: str = Field(min_length=1)


class TreatmentPlanOutput(CamelModel):
    """单个 treatment_plan 输出。"""

    id: str
    org_id: str
    care_episode_id: str
    counselor_id: str
    status: str = "draft"
    title: str | None = None
    approach: str | None = None
    goals: list[Any] = Field(default_factory=list)
    interventions: list[Any] = Field(default_factory=list)
    session_plan: str | None = None
    progress_notes: str | None = None
    review_date: date_type | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


# ─── Client Profile (client-profile.routes.ts) ───────────────────


class EmergencyContactInput(CamelModel):
    """profile 嵌入 emergency_contact JSONB 的形状。"""

    name: str
    phone: str
    relationship: str


class ClientProfileUpsertRequest(CamelModel):
    """``PUT /{user_id}/profile`` body — upsert 人口学+主诉档案。"""

    phone: str | None = None
    gender: str | None = None
    date_of_birth: date_type | None = None
    address: str | None = None
    occupation: str | None = None
    education: str | None = None
    marital_status: str | None = None
    emergency_contact: EmergencyContactInput | None = None
    medical_history: str | None = None
    family_background: str | None = None
    presenting_issues: list[str] | None = None
    notes: str | None = None


class ClientProfileOutput(CamelModel):
    """单个 client_profile 输出 (PHI 全, 仅授权后返回)。"""

    id: str
    org_id: str
    user_id: str
    phone: str | None = None
    gender: str | None = None
    date_of_birth: date_type | None = None
    address: str | None = None
    occupation: str | None = None
    education: str | None = None
    marital_status: str | None = None
    emergency_contact: dict[str, Any] | None = None
    medical_history: str | None = None
    family_background: str | None = None
    presenting_issues: list[str] = Field(default_factory=list)
    notes: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class UserBasicEmbed(CamelModel):
    """summary 里的用户基本信息嵌入。"""

    name: str | None = None
    email: str | None = None
    avatar_url: str | None = None


class AssessmentResultEmbed(CamelModel):
    """summary 里的最近 assessment 结果嵌入 (5 条)。"""

    id: str
    total_score: float | None = None
    risk_level: str | None = None
    created_at: datetime | None = None


class ClientSummaryOutput(CamelModel):
    """``GET /{user_id}/summary`` — 个案档案 + 活跃 episodes + 最近 5 测评。"""

    user: UserBasicEmbed | None = None
    profile: ClientProfileOutput | None = None
    active_episodes: list[EpisodeOutput] = Field(default_factory=list)
    recent_results: list[AssessmentResultEmbed] = Field(default_factory=list)


# ─── Client Assignment (client-assignment.routes.ts) ─────────────


class ClientAssignmentCreateRequest(CamelModel):
    """``POST /`` 创建 client ↔ counselor 分配 body。"""

    client_id: str = Field(min_length=1)
    counselor_id: str | None = None
    is_primary: bool | None = None


class ClientAssignmentOutput(CamelModel):
    """单个 client_assignment 输出。"""

    id: str
    org_id: str
    client_id: str
    counselor_id: str
    is_primary: bool = True
    created_at: datetime | None = None


# ─── Client Access Grant (client-access-grant.routes.ts) ─────────


class ClientAccessGrantCreateRequest(CamelModel):
    """``POST /`` 创建临时授权 body。"""

    client_id: str = Field(min_length=1)
    granted_to_counselor_id: str = Field(min_length=1)
    reason: str = Field(min_length=1)
    expires_at: datetime | None = None


class ClientAccessGrantOutput(CamelModel):
    """单个 client_access_grant 输出。"""

    id: str
    org_id: str
    client_id: str
    granted_to_counselor_id: str
    granted_by: str
    reason: str
    expires_at: datetime | None = None
    revoked_at: datetime | None = None
    created_at: datetime | None = None


# ─── Goal Library (goal-library.routes.ts) ───────────────────────


class GoalLibraryCreateRequest(CamelModel):
    """``POST /`` 创建治疗目标模板 body。"""

    title: str = Field(min_length=1)
    description: str | None = None
    problem_area: str = Field(min_length=1)
    category: str | None = None
    objectives_template: list[str] | None = None
    intervention_suggestions: list[str] | None = None
    visibility: str | None = None


class GoalLibraryUpdateRequest(CamelModel):
    """``PATCH /{goal_id}`` 部分更新。"""

    title: str | None = None
    description: str | None = None
    problem_area: str | None = None
    category: str | None = None
    objectives_template: list[str] | None = None
    intervention_suggestions: list[str] | None = None
    visibility: str | None = None


class GoalLibraryOutput(CamelModel):
    """单个 treatment_goal_library 输出。"""

    id: str
    org_id: str | None = None
    title: str
    description: str | None = None
    problem_area: str
    category: str | None = None
    objectives_template: list[Any] = Field(default_factory=list)
    intervention_suggestions: list[Any] = Field(default_factory=list)
    visibility: str = "personal"
    created_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


# ─── AI Conversation (ai-conversation.routes.ts) ─────────────────


class AIConversationCreateRequest(CamelModel):
    """``POST /`` 创建 AI 对话 body。"""

    care_episode_id: str = Field(min_length=1)
    mode: str = Field(min_length=1)
    title: str | None = None


class AIConversationUpdateRequest(CamelModel):
    """``PATCH /{id}`` 部分更新 — append messages / 改 title / 关联 sessionNoteId。"""

    messages: list[Any] | None = None
    title: str | None = None
    summary: str | None = None
    session_note_id: str | None = None


class AIConversationOutput(CamelModel):
    """单个 ai_conversation 输出。"""

    id: str
    org_id: str
    care_episode_id: str
    counselor_id: str
    mode: str
    title: str | None = None
    messages: list[Any] = Field(default_factory=list)
    summary: str | None = None
    session_note_id: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


# ─── Public (counseling-public.routes.ts) ────────────────────────


class CounselingPublicOrgInfo(CamelModel):
    """``GET /{org_slug}/info`` 返回的公开机构基本信息 (仅 counseling 类暴露)。"""

    name: str
    slug: str
    logo_url: str | None = None
    theme_color: str | None = None


class CounselingPublicRegisterRequest(CamelModel):
    """``POST /{org_slug}/register`` body — 来访者自助注册。

    Phase 5 (2026-05-04): 国内市场切手机号, phone 必填 (中国大陆 11 位),
    email 可选 (留作通知 / legacy 兼容)。
    """

    name: str = Field(min_length=1)
    phone: str = Field(pattern=CN_PHONE_REGEX)
    email: EmailStr | None = None
    password: str = Field(min_length=1)


class CounselingPublicRegisterResponse(CamelModel):
    """``POST /{org_slug}/register`` 201 返回 — 含 access/refresh tokens。"""

    status: str = "registered"
    org_id: str
    user_id: str
    is_new_user: bool
    access_token: str
    refresh_token: str
