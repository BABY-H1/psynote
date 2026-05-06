"""
PDF generation service — Phase 4 真实装 (WeasyPrint + Jinja2 模板)。

镜像 ``server/src/modules/assessment/pdf.service.ts`` (188 行 PDFKit + archiver)
功能, Python 端走 HTML+CSS → PDF (WeasyPrint) — 中文支持 + 排版/分页都靠浏览器
渲染引擎, 比 PDFKit 手画 ``doc.text(x, y)`` 工程量低 90%。

设计要点:
  - HTML 模板 (Jinja2) 在 ``pdf_templates/``
      - ``base.html``    — 公共样式 + 页脚
      - ``result.html``  — 单 result PDF (姓名 / 测评名 / 得分 / 解读)
      - ``report.html`` — 报告 PDF (4 种 reportType 共用一套结构, 字段按需出现)
  - WeasyPrint ``HTML(string=...).write_pdf()`` 一次性 bytes 输出
  - ZIP 打包 stdlib ``zipfile`` (与 Phase 3 stub 接口完全一致)

WeasyPrint Windows 注意:
  - GTK runtime (libgobject-2.0-0 等) 缺时 import 不挂, 但 ``write_pdf()`` raise OSError
  - 单元测试用 ``monkeypatch.setattr("...write_pdf", ...)`` 不真生成 PDF
  - production docker (Linux) 有完整 fontconfig + cairo, 无此问题; Windows dev
    用 SMTP_DEV_MODE 类似的 mock pattern (caller 测试已 mock pdf_service)
"""

from __future__ import annotations

import io
import logging
import uuid
import zipfile
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.assessment_reports import AssessmentReport
from app.db.models.assessment_results import AssessmentResult
from app.db.models.assessments import Assessment
from app.db.models.users import User
from app.lib.errors import NotFoundError

logger = logging.getLogger(__name__)


_TEMPLATES_DIR: Path = Path(__file__).resolve().parent / "pdf_templates"

# Jinja2 env — autoescape on for HTML 防 XSS (用户名 / 解读文本可能含 <>)。
_jinja_env: Environment = Environment(
    loader=FileSystemLoader(str(_TEMPLATES_DIR)),
    autoescape=select_autoescape(("html", "htm")),
    trim_blocks=True,
    lstrip_blocks=True,
)


# ─── HTML 渲染 helpers ──────────────────────────────────────────


_RISK_LEVEL_TO_CLASS: dict[str, str] = {
    "level_1": "low",
    "level_2": "medium",
    "level_3": "high",
    "level_4": "high",
    "low": "low",
    "medium": "medium",
    "high": "high",
}


def _risk_class(risk_level: str | None) -> str:
    """``risk_level`` (e.g. 'level_3') → CSS class (low/medium/high) for color coding。"""
    if not risk_level:
        return "medium"
    return _RISK_LEVEL_TO_CLASS.get(risk_level.lower(), "medium")


def _render_result_html(
    *,
    result: AssessmentResult,
    assessment_title: str | None = None,
    user_name: str | None = None,
) -> str:
    """渲染单 result 的 HTML, 用 ``result.html`` 模板。"""
    # interpretations: 复用 result 的 dimension_scores + risk_level (PDF 不查 dimensions
    # 表, 那里数据 router 已经组装在 AssessmentReport.content 里; 单 result PDF 用最
    # 简表达 — score per dimensionId, 详细表在 report PDF)
    dim_scores = result.dimension_scores or {}
    interpretations: list[dict[str, Any]] = [
        {
            "dimension": dim_id,
            "score": score,
            "label": "",
            "risk_class": _risk_class(result.risk_level),
            "advice": "",
        }
        for dim_id, score in dim_scores.items()
    ]
    template = _jinja_env.get_template("result.html")
    return template.render(
        result_id=str(result.id),
        assessment_title=assessment_title,
        user_name=user_name,
        created_at=result.created_at.isoformat() if result.created_at else None,
        total_score=str(result.total_score) if result.total_score is not None else None,
        risk_level=result.risk_level,
        risk_class=_risk_class(result.risk_level),
        interpretations=interpretations,
        ai_interpretation=result.ai_interpretation,
    )


_REPORT_TYPE_LABELS: dict[str, str] = {
    "individual_single": "个人单次报告",
    "group_single": "团体单次报告",
    "individual_trend": "个人纵向报告",
    "group_longitudinal": "团体纵向对比报告",
}


def _render_report_html(report: AssessmentReport) -> str:
    """渲染 AssessmentReport 的 HTML, 用 ``report.html`` 模板。

    ``report.content`` 是 dict[str, Any] (4 种 reportType 内容形态各异),
    模板里所有字段都用 ``|default(..., true)`` 兜底, 缺字段不渲染对应 section。
    """
    content = dict(report.content or {})
    template = _jinja_env.get_template("report.html")
    return template.render(
        title=report.title,
        report_type_label=_REPORT_TYPE_LABELS.get(report.report_type, report.report_type),
        created_at=report.created_at.isoformat() if getattr(report, "created_at", None) else None,
        ai_narrative=report.ai_narrative,
        # group_single content
        participant_count=content.get("participantCount"),
        dimension_stats=content.get("dimensionStats"),
        risk_distribution=content.get("riskDistribution"),
        # individual_single content
        interpretations=content.get("interpretationPerDimension"),
        # group_longitudinal content
        assessment_comparisons=content.get("assessmentComparisons"),
    )


# ─── PDF 生成 (WeasyPrint) ──────────────────────────────────────


def _html_to_pdf_bytes(html: str) -> bytes:
    """HTML → PDF bytes. 测试可 monkeypatch 此函数 mock WeasyPrint。

    封装在独立函数让单测 mock 更精确 — patch 这一个函数比 patch ``weasyprint.HTML``
    类更稳定 (不影响 jinja_env / errors 路径)。

    WeasyPrint import 延迟到调用时 — Windows dev 机器缺 GTK runtime 时
    ``import weasyprint`` 不挂 (lazy load), 但 ``write_pdf()`` 抛 OSError。
    单测都 monkeypatch 此函数避免依赖 system libs; production Linux 容器内
    GTK + cairo + fontconfig 完整, 真实生成无问题。
    """
    from weasyprint import HTML

    pdf = HTML(string=html).write_pdf()
    if pdf is None:
        # WeasyPrint 在某些 corner case (e.g. target_type 非默认) 返 None
        raise RuntimeError("WeasyPrint returned None — PDF rendering failed")
    return bytes(pdf)


# ─── 公开 API (与 Phase 3 stub 接口 1:1 兼容) ────────────────────


async def generate_result_pdf(db: AsyncSession, *, org_id: str, result_id: str) -> bytes:
    """生成单个 ``AssessmentResult`` 的 PDF bytes (Phase 4 新增, Phase 3 不存在)。

    用于 result_router 直接 download 单条结果 PDF — 与 report 不同, 不需要先
    POST /reports 生成报告记录。前端 / Node 当前没用此端点, 但接口先备好。

    **安全 (Phase 5 P0 Fix 2 加固, 2026-05-06)**: 必须传 ``org_id``, SQL 强制
    ``AssessmentResult.org_id == 调用方 org`` 过滤防跨 org PHI 提取。
    """
    try:
        rid = uuid.UUID(result_id)
    except (ValueError, TypeError) as exc:
        raise NotFoundError("AssessmentResult", result_id) from exc

    try:
        oid = uuid.UUID(org_id)
    except (ValueError, TypeError) as exc:
        raise NotFoundError("AssessmentResult", result_id) from exc

    q = (
        select(AssessmentResult)
        .where(and_(AssessmentResult.id == rid, AssessmentResult.org_id == oid))
        .limit(1)
    )
    result = (await db.execute(q)).scalar_one_or_none()
    if result is None:
        raise NotFoundError("AssessmentResult", result_id)

    # 取 assessment 标题 (可选)
    assessment_title: str | None = None
    if result.assessment_id:
        a_q = select(Assessment.title).where(Assessment.id == result.assessment_id).limit(1)
        a_row = (await db.execute(a_q)).scalar_one_or_none()
        if a_row:
            assessment_title = a_row

    # 取 user name (可选, 匿名则空)
    user_name: str | None = None
    if result.user_id:
        u_q = select(User.name).where(User.id == result.user_id).limit(1)
        u_row = (await db.execute(u_q)).scalar_one_or_none()
        if u_row:
            user_name = u_row

    html = _render_result_html(
        result=result,
        assessment_title=assessment_title,
        user_name=user_name,
    )
    return _html_to_pdf_bytes(html)


async def generate_report_pdf(db: AsyncSession, *, org_id: str, report_id: str) -> bytes:
    """生成单个 ``AssessmentReport`` 的 PDF bytes. Phase 4 真实装 (WeasyPrint)。

    **安全 (Phase 5 P0 Fix 2 加固, 2026-05-06)**: 必须传 ``org_id``, SQL 强制
    ``AssessmentReport.org_id == 调用方 org`` 过滤。Report 引用多份 PHI
    (results / session_notes / dimensions), 跨 org 提取风险与 results 同等。

    Raises:
        NotFoundError: report_id 不存在 (与 Node 一致).
    """
    try:
        rid = uuid.UUID(report_id)
    except (ValueError, TypeError) as exc:
        raise NotFoundError("AssessmentReport", report_id) from exc

    try:
        oid = uuid.UUID(org_id)
    except (ValueError, TypeError) as exc:
        raise NotFoundError("AssessmentReport", report_id) from exc

    q = (
        select(AssessmentReport)
        .where(and_(AssessmentReport.id == rid, AssessmentReport.org_id == oid))
        .limit(1)
    )
    report = (await db.execute(q)).scalar_one_or_none()
    if report is None:
        raise NotFoundError("AssessmentReport", report_id)

    logger.info(
        "[pdf] generating PDF report_id=%s type=%s title=%s",
        report_id,
        report.report_type,
        report.title,
    )
    html = _render_report_html(report)
    return _html_to_pdf_bytes(html)


async def generate_batch_pdf_zip(db: AsyncSession, *, org_id: str, report_ids: list[str]) -> bytes:
    """生成多 report 的 ZIP bytes. Phase 4: 内部 generate_report_pdf 真实装。

    缺失的 report 跳过 (NotFoundError → continue), 不破整 zip — 与 Node 一致。

    **安全 (Phase 5 P0 Fix 2 加固, 2026-05-06)**: 必须传 ``org_id`` 透传到
    ``generate_report_pdf``, 跨 org 报告自然变成 NotFoundError 跳过, 不会被打包。
    """
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for idx, rid in enumerate(report_ids, start=1):
            try:
                pdf_bytes = await generate_report_pdf(db, org_id=org_id, report_id=rid)
                z.writestr(f"report_{idx}.pdf", pdf_bytes)
            except NotFoundError:
                logger.warning("[pdf] skip missing report_id=%s", rid)
                continue
    return buf.getvalue()


__all__ = [
    "generate_batch_pdf_zip",
    "generate_report_pdf",
    "generate_result_pdf",
]
