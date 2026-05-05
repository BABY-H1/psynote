"""
PDF generation service — Phase 3 STUB.

镜像 ``server/src/modules/assessment/pdf.service.ts`` (188 行 PDFKit + archiver) 的
**接口** —— Python Phase 3 仅提供占位实现, 真接 WeasyPrint 等在 Phase 4 / Phase 5.

为什么 stub:
  - PDFKit 是 Node 生态, Python 端不可能"翻译"; 等价方案 (WeasyPrint / ReportLab) 需要
    完整的 HTML 模板 / CSS / 字体 (中文支持) 工程, 与 Phase 3 "1:1 镜像 endpoint" 目标
    不匹配. 拆 Phase 4 单独 ticket.
  - 但 ``report.routes.ts`` 的 endpoint 必须保留 — 前端 button 调用不要 404.
  - 当前实现: 返回最小有效 PDF bytes (一行 logger.info "would generate pdf"), HTTP
    Content-Type / Content-Disposition header 完整, 让前端 download flow 不破.

Phase 4 实装注:
  实战推荐 WeasyPrint (HTML+CSS → PDF, 内置中文支持只需 system fonts).
  ZIP 走 stdlib ``zipfile.ZipFile``, 内存 buffer + 完整 PDF iter.

  ::

      import io, zipfile
      from weasyprint import HTML
      from jinja2 import Template

      async def generate_report_pdf(db, report_id) -> bytes:
          report = await get_report(db, report_id)
          html = render_report_html(report)  # Jinja2 模板
          return HTML(string=html).write_pdf()

      async def generate_batch_pdf_zip(db, report_ids) -> bytes:
          buf = io.BytesIO()
          with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
              for rid in report_ids:
                  pdf = await generate_report_pdf(db, rid)
                  z.writestr(f'report_{rid[:8]}.pdf', pdf)
          return buf.getvalue()
"""

from __future__ import annotations

import io
import logging
import uuid
import zipfile

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.assessment_reports import AssessmentReport
from app.lib.errors import NotFoundError

logger = logging.getLogger(__name__)


# 最小合法 PDF 文件 — 1 页空白. 让前端 ``new Blob([buf], {type: 'application/pdf'})``
# + ``window.open`` 不破 (不会显示 "无效 PDF" 错误). 真实生成在 Phase 4.
_STUB_PDF_BYTES = (
    b"%PDF-1.4\n"
    b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
    b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
    b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n"
    b"xref\n0 4\n"
    b"0000000000 65535 f \n"
    b"0000000009 00000 n \n"
    b"0000000054 00000 n \n"
    b"0000000101 00000 n \n"
    b"trailer\n<< /Size 4 /Root 1 0 R >>\n"
    b"startxref\n160\n%%EOF\n"
)


async def generate_report_pdf(db: AsyncSession, report_id: str) -> bytes:
    """
    生成单个 report 的 PDF bytes. **Phase 3 stub** — 返回最小空白 PDF.

    Phase 4 实装时: 取 report content + render Jinja2 模板 + WeasyPrint.

    Raises:
        NotFoundError: report_id 不存在 (与 Node 一致).
    """
    try:
        rid = uuid.UUID(report_id)
    except (ValueError, TypeError) as exc:
        raise NotFoundError("AssessmentReport", report_id) from exc

    q = select(AssessmentReport).where(AssessmentReport.id == rid).limit(1)
    report = (await db.execute(q)).scalar_one_or_none()
    if report is None:
        raise NotFoundError("AssessmentReport", report_id)

    logger.info(
        "[pdf-stub] would generate pdf for report_id=%s type=%s title=%s",
        report_id,
        report.report_type,
        report.title,
    )
    return _STUB_PDF_BYTES


async def generate_batch_pdf_zip(db: AsyncSession, report_ids: list[str]) -> bytes:
    """
    生成多 report 的 ZIP bytes. **Phase 3 stub** — 每 report 一个空白 PDF, 真 ZIP.

    Phase 4 改实装时无需改接口, 内部 generate_report_pdf 替换即可.
    """
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for idx, rid in enumerate(report_ids, start=1):
            try:
                pdf_bytes = await generate_report_pdf(db, rid)
                z.writestr(f"report_{idx}.pdf", pdf_bytes)
            except NotFoundError:
                # 与 Node 一致: 失败的 report 跳过, 不破整 zip
                logger.warning("[pdf-stub] skip missing report_id=%s", rid)
                continue
    return buf.getvalue()


__all__ = ["generate_batch_pdf_zip", "generate_report_pdf"]
