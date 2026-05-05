"""
Assessment API 请求 / 响应 schemas (Pydantic v2).

镜像 server/src/modules/assessment/{assessment,scale,batch,distribution,report,result}.routes.ts
的 JSON shape — client / portal 仍调旧合约 (camelCase), 故所有 schema 走
``alias_generator=to_camel`` + ``populate_by_name=True``: 内部 Python 用
snake_case, JSON wire 用 camelCase。

涵盖 6 个 sub-router 的全部 schemas (集中在一处, 与 org/auth schemas.py 风格一致):
  - assessment core (CRUD + restore)
  - scale + dimensions + items + rules (嵌套巨结构)
  - batch (批量发放 + stats)
  - distribution (分发任务)
  - report (4 种 type, content shape varies — 用 dict[str, Any] 透传)
  - result (PHI 核心 — submit / list / trajectory / clientVisible / recommendations)
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    """所有 assessment schema 的基类 — wire camelCase, Python snake_case."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
    )


# ─── 通用 ─────────────────────────────────────────────────────────


class OkResponse(_CamelModel):
    ok: bool = True


class SuccessResponse(_CamelModel):
    success: bool = True


# ─── assessment core ──────────────────────────────────────────────


class AssessmentCreateRequest(_CamelModel):
    """``POST /api/orgs/{org_id}/assessments`` body. 镜像 assessment.routes.ts:30-41."""

    title: str = Field(min_length=1)
    description: str | None = None
    assessment_type: str | None = None  # screening / monitoring / discharge
    demographics: list[Any] | None = None
    blocks: list[dict[str, Any]] | None = None
    screening_rules: dict[str, Any] | None = None
    collect_mode: str | None = None  # anonymous / named / linked_to_user
    result_display: dict[str, Any] | None = None
    status: str | None = None
    scale_ids: list[str] | None = None


class AssessmentUpdateRequest(_CamelModel):
    """``PATCH /api/orgs/{org_id}/assessments/{assessment_id}`` body."""

    title: str | None = None
    description: str | None = None
    assessment_type: str | None = None
    demographics: list[Any] | None = None
    blocks: list[dict[str, Any]] | None = None
    screening_rules: dict[str, Any] | None = None
    collect_mode: str | None = None
    result_display: dict[str, Any] | None = None
    status: str | None = None
    is_active: bool | None = None
    scale_ids: list[str] | None = None


class AssessmentRow(_CamelModel):
    """``GET /api/orgs/{org_id}/assessments/`` 列表项 / 创建/更新返回。"""

    id: str
    org_id: str
    title: str
    description: str | None = None
    assessment_type: str = "screening"
    demographics: list[Any] = Field(default_factory=list)
    blocks: list[dict[str, Any]] = Field(default_factory=list)
    screening_rules: dict[str, Any] = Field(default_factory=dict)
    collect_mode: str = "anonymous"
    result_display: dict[str, Any] = Field(default_factory=dict)
    share_token: str | None = None
    allow_client_report: bool = False
    status: str = "draft"
    is_active: bool = True
    created_by: str | None = None
    deleted_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AssessmentScaleRef(_CamelModel):
    """``GET /api/orgs/{org_id}/assessments/{assessment_id}`` 嵌套 scale 简表."""

    id: str
    title: str
    description: str | None = None
    sort_order: int = 0


class AssessmentDetail(AssessmentRow):
    """单个 assessment 详情, 比 AssessmentRow 多 scales + dimensionNameMap。"""

    scales: list[AssessmentScaleRef] = Field(default_factory=list)
    dimension_name_map: dict[str, str] = Field(default_factory=dict)


# ─── scale + dimensions + items + rules ──────────────────────────


class DimensionRuleInput(_CamelModel):
    """``dimensions[].rules[]`` create/update body 子对象。"""

    min_score: float
    max_score: float
    label: str = Field(min_length=1)
    description: str | None = None
    advice: str | None = None
    risk_level: str | None = None  # level_1 / level_2 / level_3 / level_4


class DimensionInput(_CamelModel):
    """``POST /api/orgs/{org_id}/scales`` ``dimensions[]`` 子对象。"""

    name: str = Field(min_length=1)
    description: str | None = None
    calculation_method: str | None = None  # sum / average / max
    sort_order: int | None = None
    rules: list[DimensionRuleInput] | None = None


class ItemOptionInput(_CamelModel):
    """``items[].options[]`` Likert 选项。"""

    label: str
    value: float


class ItemInput(_CamelModel):
    """``POST /api/orgs/{org_id}/scales`` ``items[]`` 子对象。"""

    text: str = Field(min_length=1)
    dimension_index: int  # index into the dimensions array
    is_reverse_scored: bool | None = None
    options: list[ItemOptionInput] = Field(min_length=1)
    sort_order: int | None = None


class ScaleCreateRequest(_CamelModel):
    """``POST /api/orgs/{org_id}/scales`` body。"""

    title: str = Field(min_length=1)
    description: str | None = None
    instructions: str | None = None
    scoring_mode: str | None = None  # sum / average / max
    is_public: bool | None = None
    dimensions: list[DimensionInput] = Field(min_length=1)
    items: list[ItemInput] = Field(min_length=1)


class ScaleUpdateRequest(_CamelModel):
    """``PATCH /api/orgs/{org_id}/scales/{scale_id}`` body. 任一字段可省。"""

    title: str | None = None
    description: str | None = None
    instructions: str | None = None
    scoring_mode: str | None = None
    is_public: bool | None = None
    # dimensions/items 必须同送或同省, router 校验
    dimensions: list[DimensionInput] | None = None
    items: list[ItemInput] | None = None


class ScaleListRow(_CamelModel):
    """``GET /api/orgs/{org_id}/scales/`` 列表项 (含 dimensionCount/itemCount)。"""

    id: str
    org_id: str | None = None
    title: str
    description: str | None = None
    instructions: str | None = None
    scoring_mode: str = "sum"
    is_public: bool = False
    created_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    dimension_count: int = 0
    item_count: int = 0


class DimensionRuleOut(_CamelModel):
    id: str
    min_score: str
    max_score: str
    label: str
    description: str | None = None
    advice: str | None = None
    risk_level: str | None = None


class DimensionOut(_CamelModel):
    id: str
    name: str
    description: str | None = None
    calculation_method: str = "sum"
    sort_order: int = 0
    rules: list[DimensionRuleOut] = Field(default_factory=list)


class ScaleItemOut(_CamelModel):
    id: str
    dimension_id: str | None = None
    text: str
    is_reverse_scored: bool = False
    options: list[dict[str, Any]] = Field(default_factory=list)
    sort_order: int = 0


class ScaleDetail(_CamelModel):
    """``GET /api/orgs/{org_id}/scales/{scale_id}`` 嵌套全结构。"""

    id: str
    org_id: str | None = None
    title: str
    description: str | None = None
    instructions: str | None = None
    scoring_mode: str = "sum"
    is_public: bool = False
    created_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    dimensions: list[DimensionOut] = Field(default_factory=list)
    items: list[ScaleItemOut] = Field(default_factory=list)


# ─── batch ─────────────────────────────────────────────────────────


class BatchCreateRequest(_CamelModel):
    """``POST /api/orgs/{org_id}/assessment-batches`` body. 镜像 batch.routes.ts:28-35."""

    assessment_id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    target_type: str | None = None
    target_config: dict[str, Any] | None = None
    deadline: datetime | None = None
    total_targets: int = Field(ge=1)


class BatchRow(_CamelModel):
    """``GET .../assessment-batches/`` 列表项 / 创建返回。"""

    id: str
    org_id: str
    assessment_id: str
    title: str
    target_type: str | None = None
    target_config: dict[str, Any] = Field(default_factory=dict)
    deadline: datetime | None = None
    status: str = "active"
    stats: dict[str, Any] = Field(default_factory=dict)
    created_by: str | None = None
    created_at: datetime | None = None


class BatchStats(_CamelModel):
    """getBatchById 实时统计的 stats sub-object (覆盖 batch.stats)。"""

    total: int = 0
    completed: int = 0
    risk_distribution: dict[str, int] = Field(default_factory=dict)


class BatchDetail(BatchRow):
    """``GET .../assessment-batches/{batch_id}`` — 在 BatchRow 上覆盖 stats。"""

    stats: dict[str, Any] = Field(default_factory=dict)


# ─── distribution ──────────────────────────────────────────────────


class DistributionCreateRequest(_CamelModel):
    """``POST .../assessments/{assessment_id}/distributions`` body."""

    mode: str | None = None  # public / invite / embed
    batch_label: str | None = None
    targets: list[Any] | None = None
    schedule: dict[str, Any] | None = None


class DistributionStatusUpdateRequest(_CamelModel):
    """``PATCH .../distributions/{distribution_id}/status`` body."""

    status: str = Field(min_length=1)


class DistributionRow(_CamelModel):
    """``GET .../distributions/`` 列表项 / 创建返回。"""

    id: str
    org_id: str
    assessment_id: str
    mode: str = "public"
    batch_label: str | None = None
    targets: list[Any] = Field(default_factory=list)
    schedule: dict[str, Any] = Field(default_factory=dict)
    status: str = "active"
    completed_count: int = 0
    created_by: str | None = None
    created_at: datetime | None = None


# ─── report ────────────────────────────────────────────────────────


ReportType = Literal["individual_single", "group_single", "group_longitudinal", "individual_trend"]


class ReportCreateRequest(_CamelModel):
    """``POST /api/orgs/{org_id}/assessment-reports`` body. 镜像 report.routes.ts:29-40."""

    report_type: ReportType
    result_id: str | None = None
    result_ids: list[str] | None = None
    assessment_id: str | None = None
    user_id: str | None = None
    title: str | None = None
    instance_id: str | None = None
    instance_type: Literal["group", "course"] | None = None


class ReportRow(_CamelModel):
    """``GET /api/orgs/{org_id}/assessment-reports/`` 列表项 / 创建返回。"""

    id: str
    org_id: str
    title: str
    report_type: str
    result_ids: list[str] | None = None
    batch_id: str | None = None
    assessment_id: str | None = None
    scale_id: str | None = None
    content: dict[str, Any] = Field(default_factory=dict)
    ai_narrative: str | None = None
    generated_by: str | None = None
    created_at: datetime | None = None


class ReportNarrativeUpdateRequest(_CamelModel):
    """``PATCH .../assessment-reports/{report_id}/narrative`` body."""

    narrative: str


class BatchPDFRequest(_CamelModel):
    """``POST .../assessment-reports/batch-pdf`` body."""

    report_ids: list[str] = Field(min_length=1)


# ─── result (PHI) ─────────────────────────────────────────────────


class ResultSubmitRequest(_CamelModel):
    """``POST /api/orgs/{org_id}/assessment-results`` body. 镜像 result.routes.ts:51-59."""

    assessment_id: str = Field(min_length=1)
    user_id: str | None = None
    care_episode_id: str | None = None
    batch_id: str | None = None
    demographic_data: dict[str, Any] | None = None
    answers: dict[str, float] = Field(min_length=1)


class PublicResultSubmitRequest(_CamelModel):
    """``POST /api/public/assessments/{assessment_id}/submit`` (no auth)."""

    demographic_data: dict[str, Any] | None = None
    answers: dict[str, float] = Field(min_length=1)


class ResultRow(_CamelModel):
    """``GET .../assessment-results/`` 列表项 / 单条详情。

    PHI level: phi_full (含 answers / demographic_data / dimensionScores / aiInterpretation).
    """

    id: str
    org_id: str
    assessment_id: str
    user_id: str | None = None
    care_episode_id: str | None = None
    demographic_data: dict[str, Any] = Field(default_factory=dict)
    answers: dict[str, Any] = Field(default_factory=dict)
    custom_answers: dict[str, Any] = Field(default_factory=dict)
    dimension_scores: dict[str, Any] = Field(default_factory=dict)
    total_score: Decimal | None = None
    risk_level: str | None = None
    ai_interpretation: str | None = None
    client_visible: bool = False
    recommendations: list[Any] = Field(default_factory=list)
    ai_provenance: dict[str, Any] | None = None
    batch_id: str | None = None
    created_by: str | None = None
    deleted_at: datetime | None = None
    created_at: datetime | None = None


class ResultInterpretation(_CamelModel):
    """list 端点 enrich 用的维度解读。"""

    dimension: str
    score: float
    label: str


class ResultListItem(ResultRow):
    """list 端点专用 — 在 ResultRow 上加 enrich 字段 (assessmentTitle / scaleTitles /
    interpretations)。"""

    assessment_title: str | None = None
    scale_titles: list[str] = Field(default_factory=list)
    interpretations: list[ResultInterpretation] = Field(default_factory=list)


class ResultClientVisibleRequest(_CamelModel):
    """``PATCH .../assessment-results/{result_id}/client-visible`` body. Phase 9β."""

    visible: bool


class ResultRecommendationsRequest(_CamelModel):
    """``PATCH .../assessment-results/{result_id}/recommendations`` body. Phase 9β."""

    recommendations: list[dict[str, Any]]


class TrajectoryPoint(_CamelModel):
    """``GET .../assessment-results/trajectory`` 单点。Phase 9β."""

    id: str
    assessment_id: str
    total_score: Decimal | None = None
    risk_level: str | None = None
    dimension_scores: dict[str, Any] = Field(default_factory=dict)
    client_visible: bool = False
    created_at: datetime | None = None


__all__ = [
    "AssessmentCreateRequest",
    "AssessmentDetail",
    "AssessmentRow",
    "AssessmentScaleRef",
    "AssessmentUpdateRequest",
    "BatchCreateRequest",
    "BatchDetail",
    "BatchPDFRequest",
    "BatchRow",
    "BatchStats",
    "DimensionInput",
    "DimensionOut",
    "DimensionRuleInput",
    "DimensionRuleOut",
    "DistributionCreateRequest",
    "DistributionRow",
    "DistributionStatusUpdateRequest",
    "ItemInput",
    "ItemOptionInput",
    "OkResponse",
    "PublicResultSubmitRequest",
    "ReportCreateRequest",
    "ReportNarrativeUpdateRequest",
    "ReportRow",
    "ReportType",
    "ResultClientVisibleRequest",
    "ResultInterpretation",
    "ResultListItem",
    "ResultRecommendationsRequest",
    "ResultRow",
    "ResultSubmitRequest",
    "ScaleCreateRequest",
    "ScaleDetail",
    "ScaleItemOut",
    "ScaleListRow",
    "ScaleUpdateRequest",
    "SuccessResponse",
    "TrajectoryPoint",
]
