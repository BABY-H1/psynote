"""
School API 请求 / 响应 schemas (Pydantic v2)。

镜像 ``server/src/modules/school/`` 下 3 个 routes 文件
(school-class / school-student / school-analytics) 的 JSON shape。

⚠ 校领导 aggregate-only 守门 (合规约束):
  analytics 端点全部走 ``school_student_profiles`` + ``assessment_results``
  聚合, 但**不返回原始测评数据**, 仅返回部门/班级层面的统计 + high-risk
  学生姓名 (校长本来就能看到学生姓名, 与 EAP 不同 — Node 注释明确说明).
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field

from app.api.v1._schema_base import CamelModel

# ─── 通用 ─────────────────────────────────────────────────────


class OkResponse(CamelModel):
    ok: bool = True


class SuccessResponse(CamelModel):
    success: bool = True


# ─── Class CRUD ──────────────────────────────────────────────────


class ClassRow(CamelModel):
    """``GET /`` / ``POST /`` / ``PATCH /:id`` 单条 class. 镜像 school-class.routes.ts:32-43."""

    id: str
    grade: str
    class_name: str
    homeroom_teacher_id: str | None = None
    student_count: int = 0
    created_at: datetime | None = None
    teacher_name: str | None = None  # left-join users.name


class ClassListResponse(CamelModel):
    """``GET /`` 响应 — 平铺 + 按 grade 分组."""

    classes: list[ClassRow]
    grouped: dict[str, list[ClassRow]] = Field(default_factory=dict)


class ClassCreateRequest(CamelModel):
    """``POST /`` body. 镜像 school-class.routes.ts:62-66."""

    grade: str = Field(min_length=1)
    class_name: str = Field(min_length=1)
    homeroom_teacher_id: str | None = None


class ClassUpdateRequest(CamelModel):
    """``PATCH /:class_id`` body — 全字段可选."""

    grade: str | None = None
    class_name: str | None = None
    homeroom_teacher_id: str | None = None


class ClassCreateResponse(CamelModel):
    """``POST /`` 201 响应."""

    class_: ClassRow = Field(alias="class")


class ClassUpdateResponse(CamelModel):
    """``PATCH /:id`` 响应."""

    class_: ClassRow = Field(alias="class")


# ─── Student CRUD ────────────────────────────────────────────────


class StudentRow(CamelModel):
    """``GET /`` 单条 student. 镜像 school-student.routes.ts:34-46."""

    id: str
    user_id: str
    student_id: str | None = None
    grade: str | None = None
    class_name: str | None = None
    parent_name: str | None = None
    parent_phone: str | None = None
    created_at: datetime | None = None
    user_name: str | None = None
    user_email: str | None = None


class StudentListResponse(CamelModel):
    """``GET /`` 响应 (含可选 grade / className / search 过滤)."""

    students: list[StudentRow]


class StudentGradeStatsEntry(CamelModel):
    name: str
    count: int


class StudentStatsResponse(CamelModel):
    """``GET /stats`` 响应. 镜像 school-student.routes.ts:81-86."""

    total: int
    grades: list[StudentGradeStatsEntry] = Field(default_factory=list)


class StudentImportItem(CamelModel):
    """``POST /import`` body 单条 student input."""

    name: str = Field(min_length=1)
    student_id: str | None = None
    grade: str | None = None
    class_name: str | None = None
    parent_name: str | None = None
    parent_phone: str | None = None
    parent_email: str | None = None


class StudentImportRequest(CamelModel):
    """``POST /import`` body (max 500). 镜像 school-student.routes.ts:93-104."""

    students: list[StudentImportItem] = Field(min_length=1)


class StudentImportResultEntry(CamelModel):
    """单条结果."""

    name: str
    status: Literal["created", "existing", "error"]
    error: str | None = None


class StudentImportSummary(CamelModel):
    total: int
    created: int
    existing: int
    errors: int


class StudentImportResponse(CamelModel):
    """``POST /import`` 响应. 镜像 school-student.routes.ts:197."""

    summary: StudentImportSummary
    results: list[StudentImportResultEntry]


class StudentUpdateRequest(CamelModel):
    """``PATCH /:student_profile_id`` body — 全字段可选. 镜像 school-student.routes.ts:206-214."""

    student_id: str | None = None
    grade: str | None = None
    class_name: str | None = None
    parent_name: str | None = None
    parent_phone: str | None = None
    parent_email: str | None = None


class StudentUpdateResponse(CamelModel):
    """``PATCH /:id`` 响应."""

    student: StudentRow


# ─── Analytics (校领导 aggregate, 不读 PHI) ──────────────────────


class AnalyticsOverviewResponse(CamelModel):
    """``GET /overview`` 响应. 镜像 school-analytics.routes.ts:97-102.

    Header 卡片 (替代旧硬编码 "测评完成=0/预警关注=0").
    """

    assessments_this_month: int
    risk_level_distribution: dict[str, int] = Field(
        default_factory=lambda: {"level_1": 0, "level_2": 0, "level_3": 0, "level_4": 0}
    )
    open_crisis_count: int
    pending_sign_off_count: int


class RiskByClassEntry(CamelModel):
    """单个 (grade, className) 行 (含 risk × 4)."""

    grade: str
    class_name: str
    risk_counts: dict[str, int] = Field(default_factory=dict)
    total_assessed: int = 0
    total_students: int = 0


class HighRiskStudentEntry(CamelModel):
    """top N 高风险学生条目 (level_3/level_4)."""

    user_id: str
    name: str
    student_id: str | None = None
    grade: str | None = None
    class_name: str | None = None
    risk_level: str
    latest_assessment_at: str | None = None
    has_open_crisis: bool = False


class CrisisByClassEntry(CamelModel):
    """单条 crisis × class 聚合."""

    grade: str
    class_name: str
    open_count: int
    pending_sign_off_count: int
    closed_count: int
    total: int


__all__ = [
    "AnalyticsOverviewResponse",
    "ClassCreateRequest",
    "ClassCreateResponse",
    "ClassListResponse",
    "ClassRow",
    "ClassUpdateRequest",
    "ClassUpdateResponse",
    "CrisisByClassEntry",
    "HighRiskStudentEntry",
    "OkResponse",
    "RiskByClassEntry",
    "StudentGradeStatsEntry",
    "StudentImportItem",
    "StudentImportRequest",
    "StudentImportResponse",
    "StudentImportResultEntry",
    "StudentImportSummary",
    "StudentListResponse",
    "StudentRow",
    "StudentStatsResponse",
    "StudentUpdateRequest",
    "StudentUpdateResponse",
    "SuccessResponse",
]
