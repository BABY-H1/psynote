"""
Report router tests — 镜像 ``server/src/modules/assessment/report.routes.ts``.

6 endpoint:
  GET   /api/orgs/{org_id}/assessment-reports/                  — 列表
  GET   /api/orgs/{org_id}/assessment-reports/{rid}             — 详情
  POST  /api/orgs/{org_id}/assessment-reports/                  — 生成 (4 reportType)
  PATCH /api/orgs/{org_id}/assessment-reports/{rid}/narrative   — 更新 narrative
  GET   /api/orgs/{org_id}/assessment-reports/{rid}/pdf         — 单 PDF (stub)
  POST  /api/orgs/{org_id}/assessment-reports/batch-pdf         — 批量 ZIP (stub)
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.assessment.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"
_RID = "00000000-0000-0000-0000-000000000666"
_RES_ID = "00000000-0000-0000-0000-000000000555"
_AID = "00000000-0000-0000-0000-000000000111"
_USER_ID = "00000000-0000-0000-0000-000000000010"


def test_list_reports_happy(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
    make_report: object,
) -> None:
    rep = make_report()  # type: ignore[operator]
    setup_db_results([[rep]])
    r = staff_client.get(f"/api/orgs/{_ORG_ID}/assessment-reports/")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_list_reports_rejects_client_role(client_role_client: TestClient) -> None:
    r = client_role_client.get(f"/api/orgs/{_ORG_ID}/assessment-reports/")
    assert r.status_code == 403


def test_get_report_happy(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
    make_report: object,
) -> None:
    rep = make_report()  # type: ignore[operator]
    setup_db_results([rep])
    r = staff_client.get(f"/api/orgs/{_ORG_ID}/assessment-reports/{_RID}")
    assert r.status_code == 200
    assert r.json()["title"] == "Test Report"


def test_get_report_404(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = staff_client.get(f"/api/orgs/{_ORG_ID}/assessment-reports/{_RID}")
    assert r.status_code == 404


def test_create_individual_single_happy(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
    make_result: object,
) -> None:
    """生成 individual_single 报告.

    FIFO: 1) load result, (2) load dimensions=[], (3) load rules=[]  — 无 dim 时跳过
    其实有维度处理逻辑只在 dim_uuids 非空时查 — 我们用空 dim_scores 让其跳两步.
    """
    res = make_result(risk_level="level_2")  # type: ignore[operator]
    res.dimension_scores = {}  # 空 dict 让 dim_uuids 为空, 跳查 dims/rules
    setup_db_results([res])
    r = staff_client.post(
        f"/api/orgs/{_ORG_ID}/assessment-reports/",
        json={
            "reportType": "individual_single",
            "resultId": _RES_ID,
        },
    )
    assert r.status_code == 201, r.text


def test_create_individual_single_missing_resultid(
    staff_client: TestClient,
) -> None:
    r = staff_client.post(
        f"/api/orgs/{_ORG_ID}/assessment-reports/",
        json={"reportType": "individual_single"},
    )
    assert r.status_code == 400


def test_create_unsupported_report_type(
    staff_client: TestClient,
) -> None:
    """非 Literal 值 → 400 (Pydantic schema 校验, error_handler 转 400 VALIDATION_ERROR)."""
    r = staff_client.post(
        f"/api/orgs/{_ORG_ID}/assessment-reports/",
        json={"reportType": "wat", "resultId": "x"},
    )
    assert r.status_code == 400
    assert r.json()["error"] == "VALIDATION_ERROR"


def test_create_rejects_client_role(client_role_client: TestClient) -> None:
    r = client_role_client.post(
        f"/api/orgs/{_ORG_ID}/assessment-reports/",
        json={"reportType": "individual_single", "resultId": _RES_ID},
    )
    assert r.status_code == 403


def test_update_narrative_happy(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
    make_report: object,
) -> None:
    rep = make_report()  # type: ignore[operator]
    setup_db_results([rep])
    r = staff_client.patch(
        f"/api/orgs/{_ORG_ID}/assessment-reports/{_RID}/narrative",
        json={"narrative": "AI 总结: 风险偏高..."},
    )
    assert r.status_code == 200
    assert rep.ai_narrative == "AI 总结: 风险偏高..."


def test_update_narrative_404(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = staff_client.patch(
        f"/api/orgs/{_ORG_ID}/assessment-reports/{_RID}/narrative",
        json={"narrative": "x"},
    )
    assert r.status_code == 404


def test_get_report_pdf_stub(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
    make_report: object,
) -> None:
    rep = make_report()  # type: ignore[operator]
    setup_db_results([rep])
    r = staff_client.get(f"/api/orgs/{_ORG_ID}/assessment-reports/{_RID}/pdf")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF-")


def test_get_report_pdf_404(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = staff_client.get(f"/api/orgs/{_ORG_ID}/assessment-reports/{_RID}/pdf")
    assert r.status_code == 404


def test_batch_pdf_admin_happy(
    admin_client: TestClient,
    setup_db_results: SetupDbResults,
    make_report: object,
) -> None:
    rep = make_report()  # type: ignore[operator]
    # batch-pdf 内部 generate_report_pdf 会查每个 report id (我们传 1 个)
    setup_db_results([rep])
    r = admin_client.post(
        f"/api/orgs/{_ORG_ID}/assessment-reports/batch-pdf",
        json={"reportIds": [_RID]},
    )
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/zip"


def test_batch_pdf_rejects_client_role(client_role_client: TestClient) -> None:
    r = client_role_client.post(
        f"/api/orgs/{_ORG_ID}/assessment-reports/batch-pdf",
        json={"reportIds": [_RID]},
    )
    assert r.status_code == 403
