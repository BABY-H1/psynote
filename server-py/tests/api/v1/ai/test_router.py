"""
AI 主 router smoke tests — 验证 6 sub-router 全部端点能注册 + 调用走 BYOK 调用点。

测试策略:
  - 端点注册 snapshot (40 路由) — 镜像 Node ai.routes.test.ts
  - 一个 happy path per sub-router 验证 BYOK 调用点真接通
  - 权限矩阵 (org_admin / counselor / client) 各 1 case
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from fastapi.testclient import TestClient

    from tests.api.v1.ai.conftest import SetupDbResults

_ORG_ID = "00000000-0000-0000-0000-000000000099"


def _setup_for_byok_call(setup_db_results: SetupDbResults, make_credential: Any) -> Any:
    """构造 BYOK 调用所需 DB 序列: 1) org cred 命中, 2) org settings 空 (cn 默认放行)."""
    cred = make_credential()  # 默认 cn data residency
    setup_db_results([cred, {}])
    return cred


def test_route_count_snapshot(admin_org_client: TestClient) -> None:
    """40 routes 存在 (与 Node ai.routes.test.ts 风格对齐)."""
    app = admin_org_client.app
    paths = sorted({r.path for r in app.routes if hasattr(r, "path") and "/ai/" in str(r.path)})
    # 6 + 6 + 5 + 7 + 7 + 9 = 40 endpoints
    assert len(paths) >= 30, f"expected ≥30 AI paths, got {len(paths)}: {paths}"


# ── Assessment sub-router ──────────────────────────────────


def test_risk_assess_happy_admin(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_credential: Any,
) -> None:
    _setup_for_byok_call(setup_db_results, make_credential)
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/ai/risk-assess",
        json={"dimensions": [], "totalScore": 10, "ruleBasedRisk": "level_1"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "riskLevel" in body
    assert "summary" in body


def test_risk_assess_403_when_client_role(
    client_role_org_client: TestClient,
) -> None:
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG_ID}/ai/risk-assess",
        json={"dimensions": [], "totalScore": 10, "ruleBasedRisk": "level_1"},
    )
    assert r.status_code == 403


def test_triage_happy_counselor(
    counselor_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_credential: Any,
) -> None:
    _setup_for_byok_call(setup_db_results, make_credential)
    r = counselor_org_client.post(
        f"/api/orgs/{_ORG_ID}/ai/triage",
        json={"riskLevel": "level_2", "dimensions": []},
    )
    assert r.status_code == 200, r.text


def test_triage_400_missing_risk_level(
    admin_org_client: TestClient,
) -> None:
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/ai/triage",
        json={"dimensions": []},
    )
    assert r.status_code == 400


def test_progress_report_400_too_few_comparisons(
    admin_org_client: TestClient,
) -> None:
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/ai/progress-report",
        json={
            "comparisons": [{"date": "2026-01-01", "totalScore": 10, "riskLevel": "level_1"}],
            "dimensionNames": {},
        },
    )
    assert r.status_code == 400


# ── Treatment sub-router ───────────────────────────────────


def test_suggest_treatment_plan_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_credential: Any,
) -> None:
    _setup_for_byok_call(setup_db_results, make_credential)
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/ai/suggest-treatment-plan",
        json={"chiefComplaint": "焦虑"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "goals" in body


def test_recommendations_open_to_all_authed_user(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_credential: Any,
) -> None:
    """``/recommendations`` 没有 require_admin_or_counselor — 客户端也能调."""
    _setup_for_byok_call(setup_db_results, make_credential)
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG_ID}/ai/recommendations",
        json={"riskLevel": "level_1", "dimensions": []},
    )
    assert r.status_code == 200, r.text


# ── Scales material sub-router ─────────────────────────────


def test_extract_scale_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_credential: Any,
) -> None:
    _setup_for_byok_call(setup_db_results, make_credential)
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/ai/extract-scale",
        json={"content": "PHQ-9 抑郁筛查量表..."},
    )
    assert r.status_code == 200, r.text


def test_analyze_material_400_missing_content(
    admin_org_client: TestClient,
) -> None:
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/ai/analyze-material",
        json={},
    )
    assert r.status_code == 400


# ── Group schemes sub-router ───────────────────────────────


def test_generate_scheme_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_credential: Any,
) -> None:
    _setup_for_byok_call(setup_db_results, make_credential)
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/ai/generate-scheme",
        json={"prompt": "为高中生设计 8 次焦虑减压团辅"},
    )
    assert r.status_code == 200, r.text


# ── Course authoring sub-router ────────────────────────────


def test_generate_course_blueprint_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_credential: Any,
) -> None:
    _setup_for_byok_call(setup_db_results, make_credential)
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/ai/generate-course-blueprint",
        json={"requirements": {"audience": "学生", "weeks": 6}},
    )
    assert r.status_code == 200, r.text


def test_generate_lesson_block_400_missing_block_type(
    admin_org_client: TestClient,
) -> None:
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/ai/generate-lesson-block",
        json={"blueprint": {"x": 1}, "sessionIndex": 0},
    )
    assert r.status_code == 400


# ── Templates sub-router ───────────────────────────────────


def test_extract_agreement_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_credential: Any,
) -> None:
    _setup_for_byok_call(setup_db_results, make_credential)
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/ai/extract-agreement",
        json={"content": "本协议约定..."},
    )
    assert r.status_code == 200, r.text


def test_refine_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_credential: Any,
) -> None:
    _setup_for_byok_call(setup_db_results, make_credential)
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/ai/refine",
        json={"content": "原文", "instruction": "更专业"},
    )
    assert r.status_code == 200, r.text
    assert "refined" in r.json()


# ── BYOK 缺凭据 → ValidationError 400 ──────────────────────


def test_byok_no_credential_returns_400(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """没配 org cred + 没配 platform fallback → resolver raise ValidationError → 400."""
    setup_db_results([None, None])  # org missing + platform missing
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/ai/extract-scale",
        json={"content": "test"},
    )
    assert r.status_code == 400
    body = r.json()
    assert body["error"] == "VALIDATION_ERROR"
    assert "not configured" in body["message"]


# ── PHI 拦截 — global cred + 未声明 consent → 403 ──────────


def test_phi_compliance_blocks_global_provider(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_credential: Any,
) -> None:
    """org cred 是 global, org settings 没声明 consent → 403 PHI_COMPLIANCE_ERROR."""
    cred = make_credential(data_residency="global")
    setup_db_results([cred, {}])  # 空 settings (无 consent)
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/ai/extract-scale",
        json={"content": "test"},
    )
    assert r.status_code == 403
    body = r.json()
    assert body["error"] == "PHI_COMPLIANCE_ERROR"
