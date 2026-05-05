"""
AI module 请求 / 响应 schemas (Pydantic v2 + CamelModel)。

镜像 ``server/src/modules/ai/*.routes.ts`` 的 body 形状。Phase 3 阶段大量
``dict[str, Any]`` —— 因为 33 pipelines 业务结构复杂, 路由层只做 envelope 校验,
具体 JSON 形状交给 pipeline 内部 (Phase 5 接 LLM 时校验)。
"""

from __future__ import annotations

from typing import Any

from pydantic import Field

from app.api.v1._schema_base import CamelModel

# ── Common chat envelope ────────────────────────────────────────


class ChatMessageItem(CamelModel):
    """一条 chat message (镜像 Node ChatMessage = {role, content})。"""

    role: str = Field(min_length=1)  # 'user' | 'assistant' (含 'system' for some pipelines)
    content: str


# ── Assessment routes (ai-assessment.routes.ts) ─────────────────


class DimensionItem(CamelModel):
    name: str
    score: float
    label: str
    risk_level: str | None = None
    advice: str | None = None


class InterpretResultRequest(CamelModel):
    scale_name: str = Field(min_length=1)
    dimensions: list[DimensionItem] = Field(default_factory=list)
    total_score: float = 0
    risk_level: str | None = None


class RiskAssessRequest(CamelModel):
    dimensions: list[DimensionItem] = Field(default_factory=list)
    total_score: float = 0
    rule_based_risk: str | None = None
    demographics: dict[str, Any] | None = None
    chief_complaint: str | None = None


class TriageRequest(CamelModel):
    risk_level: str = Field(min_length=1)
    dimensions: list[DimensionItem] = Field(default_factory=list)
    chief_complaint: str | None = None
    available_interventions: list[str] | None = None


class AnalyzeSessionRequest(CamelModel):
    subjective: str | None = None
    objective: str | None = None
    assessment: str | None = None
    plan: str | None = None
    session_type: str | None = None
    duration: int | None = None
    previous_notes: str | None = None


class ProgressReportComparison(CamelModel):
    date: str
    total_score: float
    risk_level: str
    dimension_scores: dict[str, float] = Field(default_factory=dict)


class ProgressReportRequest(CamelModel):
    client_name: str | None = None
    comparisons: list[ProgressReportComparison] = Field(default_factory=list)
    dimension_names: dict[str, str] = Field(default_factory=dict)
    intervention_type: str | None = None


class ReferralSummaryRequest(CamelModel):
    reason: str = Field(min_length=1)
    risk_level: str
    dimensions: list[DimensionItem] = Field(default_factory=list)
    chief_complaint: str | None = None
    session_history: str | None = None
    target_type: str | None = None


# ── Treatment routes (ai-treatment.routes.ts) ───────────────────


class TreatmentPlanRequest(CamelModel):
    chief_complaint: str | None = None
    risk_level: str | None = None
    assessment_summary: str | None = None
    session_notes: str | None = None
    client_context: dict[str, Any] | None = None


class ClientSummaryRequest(CamelModel):
    client_id: str = Field(min_length=1)
    episode_id: str = Field(min_length=1)


class CaseProgressRequest(CamelModel):
    episode_id: str = Field(min_length=1)


class ChatRequest(CamelModel):
    """通用 chat request — messages + 可选 context。"""

    messages: list[ChatMessageItem] = Field(default_factory=list)
    context: dict[str, Any] | None = None


class RecommendationsRequest(CamelModel):
    risk_level: str = Field(min_length=1)
    dimensions: list[DimensionItem] = Field(default_factory=list)
    intervention_type: str | None = None
    available_courses: list[dict[str, Any]] | None = None
    available_groups: list[dict[str, Any]] | None = None


# ── Templates routes (ai-templates.routes.ts) ──────────────────


class ScreeningRulesRequest(CamelModel):
    messages: list[ChatMessageItem] = Field(default_factory=list)
    context: dict[str, Any]


class RefineRequest(CamelModel):
    content: str = Field(min_length=1)
    instruction: str = Field(min_length=1)


class ContentExtractRequest(CamelModel):
    content: str = Field(min_length=1)


class MessagesOnlyRequest(CamelModel):
    messages: list[ChatMessageItem] = Field(default_factory=list)


class PosterCopyRequest(CamelModel):
    title: str = Field(min_length=1)
    description: str | None = None
    schedule: str | None = None
    location: str | None = None


# ── Scales/material routes ──────────────────────────────────────


class AnalyzeMaterialRequest(CamelModel):
    content: str = Field(min_length=1)
    input_type: str | None = None  # 'text' | 'transcribed_audio' | 'transcribed_image'


class AnalyzeMaterialFormattedRequest(CamelModel):
    content: str = Field(min_length=1)
    format: str = Field(min_length=1)
    field_definitions: list[dict[str, Any]] = Field(default_factory=list)
    input_type: str | None = None


# ── Course-authoring routes ─────────────────────────────────────


class CourseBlueprintRequest(CamelModel):
    requirements: dict[str, Any]


class RefineCourseBlueprintRequest(CamelModel):
    current_blueprint: dict[str, Any]
    instruction: str = Field(min_length=1)
    requirements: dict[str, Any] | None = None


class GenerateLessonBlocksRequest(CamelModel):
    blueprint: dict[str, Any]
    session_index: int
    requirements: dict[str, Any] | None = None


class GenerateSingleLessonBlockRequest(CamelModel):
    blueprint: dict[str, Any]
    session_index: int = 0
    block_type: str = Field(min_length=1)
    existing_blocks: list[dict[str, Any]] | None = None


class RefineLessonBlockRequest(CamelModel):
    block_content: str = Field(min_length=1)
    instruction: str = Field(min_length=1)
    blueprint: dict[str, Any] | None = None
    session_index: int | None = None


# ── Group-schemes routes ────────────────────────────────────────


class GenerateSchemeRequest(CamelModel):
    prompt: str = Field(min_length=1)


class GenerateSchemeOverallRequest(CamelModel):
    prompt: str = Field(min_length=1)


class GenerateSessionDetailRequest(CamelModel):
    overall_scheme: dict[str, Any]
    session_index: int
    prompt: str | None = None


class RefineSchemeOverallRequest(CamelModel):
    current_scheme: dict[str, Any]
    instruction: str = Field(min_length=1)


class RefineSessionDetailRequest(CamelModel):
    current_session: dict[str, Any]
    overall_scheme: dict[str, Any]
    session_index: int
    instruction: str = Field(min_length=1)


__all__ = [
    "AnalyzeMaterialFormattedRequest",
    "AnalyzeMaterialRequest",
    "AnalyzeSessionRequest",
    "CaseProgressRequest",
    "ChatMessageItem",
    "ChatRequest",
    "ClientSummaryRequest",
    "ContentExtractRequest",
    "CourseBlueprintRequest",
    "DimensionItem",
    "GenerateLessonBlocksRequest",
    "GenerateSchemeOverallRequest",
    "GenerateSchemeRequest",
    "GenerateSessionDetailRequest",
    "GenerateSingleLessonBlockRequest",
    "InterpretResultRequest",
    "MessagesOnlyRequest",
    "PosterCopyRequest",
    "ProgressReportComparison",
    "ProgressReportRequest",
    "RecommendationsRequest",
    "ReferralSummaryRequest",
    "RefineCourseBlueprintRequest",
    "RefineLessonBlockRequest",
    "RefineRequest",
    "RefineSchemeOverallRequest",
    "RefineSessionDetailRequest",
    "RiskAssessRequest",
    "ScreeningRulesRequest",
    "TreatmentPlanRequest",
    "TriageRequest",
]
