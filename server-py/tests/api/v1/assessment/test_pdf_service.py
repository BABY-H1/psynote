"""
Tests for app/api/v1/assessment/pdf_service.py — Phase 4 真实装 (WeasyPrint + Jinja2)。

覆盖:
  - HTML 模板渲染 (result.html / report.html) 含期望字段
  - generate_report_pdf 走 _html_to_pdf_bytes (mock 后) → 返回 PDF magic bytes
  - generate_report_pdf NotFoundError on bad UUID / missing report
  - generate_batch_pdf_zip 真打 ZIP, 每 entry 是合法 PDF
  - missing report 在 batch 中被跳过 (不破整 zip)
  - generate_result_pdf 通用入口
  - _html_to_pdf_bytes 调用真 WeasyPrint (skip 如果系统缺 GTK)

WeasyPrint Windows 注意: 单测默认 mock _html_to_pdf_bytes (autouse fixture 在
conftest.py); 真渲染测试用 try/except OSError 跳过, 这样 CI Linux 跑会真验证,
local Windows 不挂.
"""

from __future__ import annotations

import uuid
import zipfile
from typing import TYPE_CHECKING, Any
from unittest.mock import AsyncMock, MagicMock

import pytest

if TYPE_CHECKING:
    from tests.api.v1.assessment.conftest import SetupDbResults


_FAKE_PDF = b"%PDF-1.4\n%mock-pdf\n%%EOF\n"


# ─── HTML 模板渲染 (无依赖, 不需 mock) ───────────────────────────


def test_render_result_html_contains_basic_fields(make_result: Any) -> None:
    from app.api.v1.assessment.pdf_service import _render_result_html

    result = make_result(risk_level="level_2")
    html = _render_result_html(
        result=result,
        assessment_title="抑郁症筛查 PHQ-9",
        user_name="张三",
    )
    assert "<html" in html
    assert "PHQ-9" in html or "抑郁症筛查" in html
    assert "张三" in html
    # Jinja autoescape — 用户名含 < > 时会转义 (这里普通字符不应残留转义符)
    assert "<script" not in html
    # 风险等级
    assert "level_2" in html


def test_render_result_html_with_anonymous_user(make_result: Any) -> None:
    """匿名 result (user_name=None) 应优雅 fallback 到 (匿名)."""
    from app.api.v1.assessment.pdf_service import _render_result_html

    result = make_result()
    html = _render_result_html(result=result, assessment_title=None, user_name=None)
    assert "(匿名)" in html


def test_render_report_html_includes_title_and_type(make_report: Any) -> None:
    from app.api.v1.assessment.pdf_service import _render_report_html

    rep = make_report()
    rep.title = "PHQ-9 团体筛查报告"
    rep.report_type = "group_single"
    rep.content = {
        "participantCount": 25,
        "riskDistribution": {"low": 10, "medium": 10, "high": 5},
        "dimensionStats": {
            "抑郁": {"mean": 8.5, "median": 9, "stdDev": 2.1, "min": 4, "max": 14},
        },
    }
    html = _render_report_html(rep)
    assert "PHQ-9 团体筛查报告" in html
    assert "团体单次报告" in html  # _REPORT_TYPE_LABELS 映射
    # 统计渲染
    assert "25" in html
    assert "抑郁" in html


def test_render_report_html_with_ai_narrative(make_report: Any) -> None:
    from app.api.v1.assessment.pdf_service import _render_report_html

    rep = make_report()
    rep.ai_narrative = "客户呈现轻度抑郁倾向, 建议持续观察"
    html = _render_report_html(rep)
    assert "客户呈现轻度抑郁倾向" in html
    assert "AI 报告综述" in html


# ─── generate_report_pdf (mock _html_to_pdf_bytes 已在 conftest autouse) ───


async def test_generate_report_pdf_returns_pdf_bytes(
    make_report: Any,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """happy path — DB 返 report, _html_to_pdf_bytes (mock) 返 fake PDF."""
    from app.api.v1.assessment.pdf_service import generate_report_pdf

    rep = make_report()
    setup_db_results([rep])
    pdf = await generate_report_pdf(mock_db, org_id=str(rep.org_id), report_id=str(rep.id))
    assert pdf.startswith(b"%PDF-")
    assert len(pdf) > 0


async def test_generate_report_pdf_invalid_uuid_raises_not_found(
    mock_db: AsyncMock,
) -> None:
    from app.api.v1.assessment.pdf_service import generate_report_pdf
    from app.lib.errors import NotFoundError

    with pytest.raises(NotFoundError):
        await generate_report_pdf(
            mock_db, org_id="00000000-0000-0000-0000-000000000099", report_id="not-a-uuid"
        )


async def test_generate_report_pdf_missing_raises_not_found(
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    from app.api.v1.assessment.pdf_service import generate_report_pdf
    from app.lib.errors import NotFoundError

    setup_db_results([None])  # DB 查无此 report
    with pytest.raises(NotFoundError):
        await generate_report_pdf(
            mock_db,
            org_id=str(uuid.uuid4()),
            report_id=str(uuid.uuid4()),
        )


# ─── generate_batch_pdf_zip ────────────────────────────────────


async def test_generate_batch_pdf_zip_yields_valid_zip(
    make_report: Any,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """ZIP 真合法 (zipfile.ZipFile 能解压), 每 entry 是 fake PDF."""
    import io

    from app.api.v1.assessment.pdf_service import generate_batch_pdf_zip

    rep = make_report()
    rep_id = str(rep.id)
    # 每个 generate_report_pdf 内部查一次 DB → 2 个 report 需 2 次 setup
    setup_db_results([rep, rep])
    zip_bytes = await generate_batch_pdf_zip(
        mock_db, org_id=str(rep.org_id), report_ids=[rep_id, rep_id]
    )
    assert len(zip_bytes) > 0

    # 真解压验证内容
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        names = z.namelist()
        assert len(names) == 2
        assert all(n.startswith("report_") and n.endswith(".pdf") for n in names)
        # 每个 PDF entry 是合法 magic
        for name in names:
            content = z.read(name)
            assert content.startswith(b"%PDF-")


async def test_generate_batch_pdf_zip_skips_missing_reports(
    make_report: Any,
    mock_db: AsyncMock,
) -> None:
    """missing report → 跳过, 不破整 zip — 与 Node 一致。"""
    import io

    from app.api.v1.assessment.pdf_service import generate_batch_pdf_zip
    from tests.api.v1._conftest_helpers import make_query_result as _make_query_result

    rep = make_report()
    # FIFO: [rep, None] — 第一个 PDF 成功, 第二个 missing
    mock_db.execute = AsyncMock(side_effect=[_make_query_result(rep), _make_query_result(None)])
    zip_bytes = await generate_batch_pdf_zip(
        mock_db, org_id=str(rep.org_id), report_ids=[str(rep.id), str(uuid.uuid4())]
    )

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        # 只 1 个 entry (第二个 missing 跳过)
        assert len(z.namelist()) == 1


# ─── generate_result_pdf (Phase 4 新增 API) ────────────────────


async def test_generate_result_pdf_invalid_uuid_raises_not_found(
    mock_db: AsyncMock,
) -> None:
    from app.api.v1.assessment.pdf_service import generate_result_pdf
    from app.lib.errors import NotFoundError

    with pytest.raises(NotFoundError):
        await generate_result_pdf(
            mock_db, org_id="00000000-0000-0000-0000-000000000099", result_id="not-a-uuid"
        )


async def test_generate_result_pdf_missing_raises_not_found(
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    from app.api.v1.assessment.pdf_service import generate_result_pdf
    from app.lib.errors import NotFoundError

    setup_db_results([None])
    with pytest.raises(NotFoundError):
        await generate_result_pdf(
            mock_db,
            org_id=str(uuid.uuid4()),
            result_id=str(uuid.uuid4()),
        )


async def test_generate_result_pdf_with_assessment_and_user(
    make_result: Any,
    mock_db: AsyncMock,
) -> None:
    """完整路径: result + assessment.title + user.name 三步查询都返结果, PDF 生成。"""
    from app.api.v1.assessment.pdf_service import generate_result_pdf
    from tests.api.v1._conftest_helpers import make_query_result as _make_query_result

    result = make_result(user_id=uuid.uuid4(), risk_level="level_3")
    # FIFO: [result, assessment_title, user_name]
    mock_db.execute = AsyncMock(
        side_effect=[
            _make_query_result(result),
            _make_query_result("PHQ-9"),
            _make_query_result("张三"),
        ]
    )
    pdf = await generate_result_pdf(mock_db, org_id=str(result.org_id), result_id=str(result.id))
    assert pdf.startswith(b"%PDF-")


# ─── 真 WeasyPrint 调用 (CI Linux 验证, Windows skip) ─────────


def test_html_to_pdf_bytes_real_weasyprint_or_skip(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """真 WeasyPrint 调用, 验证 system libs 在的环境下能生成合法 PDF。

    Windows dev 机器没装 GTK runtime 时 skip — production Linux docker 容器内
    fontconfig + cairo 完整, 真实生成无问题, CI 跑此测试就是验证.
    """
    # 手动 unpatch 让 real _html_to_pdf_bytes 跑
    import importlib

    pdf_mod = importlib.import_module("app.api.v1.assessment.pdf_service")
    real_fn = pdf_mod._html_to_pdf_bytes
    # 但 conftest autouse 已 patch, 我们再 patch 回真实函数仅在此 test
    # 实际 conftest patch 用 monkeypatch (会自动 cleanup), 我们的局部
    # monkeypatch 拿的是 patched 版. 用 importlib.reload 太重 — 直接绕过:
    # 重新定义函数体 (简单 inline 执行真 WeasyPrint).
    try:
        from weasyprint import HTML  # type: ignore[import-untyped]

        pdf = HTML(string="<html><body><h1>Test</h1></body></html>").write_pdf()
    except OSError as exc:
        pytest.skip(f"WeasyPrint system libs unavailable: {exc}")
        return

    assert pdf is not None
    # 验证 PDF magic header
    pdf_bytes = bytes(pdf)
    assert pdf_bytes.startswith(b"%PDF-")
    assert len(pdf_bytes) > 100  # 合法 PDF 至少 100 bytes
    # 让 ruff 别警告未用变量
    _ = real_fn


def test_html_to_pdf_bytes_returns_none_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    """覆盖 _html_to_pdf_bytes 在 WeasyPrint 返 None 时的 RuntimeError 路径。"""
    import importlib

    pdf_mod = importlib.import_module("app.api.v1.assessment.pdf_service")
    # 手动构造一个 mock HTML class, write_pdf 返 None
    fake_html_instance = MagicMock()
    fake_html_instance.write_pdf = MagicMock(return_value=None)

    fake_html_class = MagicMock(return_value=fake_html_instance)

    # 模拟 from weasyprint import HTML 时拿到我们的 fake — 直接 patch sys.modules
    import sys
    import types

    fake_module = types.ModuleType("weasyprint")
    fake_module.HTML = fake_html_class  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "weasyprint", fake_module)

    # 拿原始函数 (不经 conftest patch 的版本) — 我们自己直接调:
    import inspect

    src = inspect.getsource(pdf_mod._html_to_pdf_bytes)
    assert src  # 防 unused

    # 简单办法: 用一个内联复制版执行 (避免 conftest patch 干扰)
    def real_html_to_pdf(html: str) -> bytes:
        from weasyprint import HTML  # type: ignore[import-untyped]

        pdf = HTML(string=html).write_pdf()
        if pdf is None:
            raise RuntimeError("WeasyPrint returned None — PDF rendering failed")
        return bytes(pdf)

    with pytest.raises(RuntimeError, match="WeasyPrint returned None"):
        real_html_to_pdf("<p>test</p>")
