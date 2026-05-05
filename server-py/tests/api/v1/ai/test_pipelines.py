"""
Pipelines smoke tests — 验证每个 pipeline:
  1. 真调 ``resolve_ai_credential`` (失败时抛 ValidationError / PHIComplianceError)
  2. 真调 ``log_ai_usage`` (写 ai_call_logs 一行)
  3. 返回 stub_result (Phase 5 替换)

这里挑代表性 pipeline 而非 33 全测 (那是 router 端到端测试覆盖).
"""

from __future__ import annotations

import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

_FAKE_ORG_ID = uuid.UUID("00000000-0000-0000-0000-000000000099")
_FAKE_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


@pytest.fixture(autouse=True)
def _pipeline_test_env(base_env: pytest.MonkeyPatch) -> None:
    base_env.setenv("NODE_ENV", "test")


def _make_cred(*, plaintext: str = "sk-x", residency: str = "cn") -> Any:
    from app.db.models.ai_credentials import AICredential
    from app.lib.crypto import encrypt

    enc, iv, tag = encrypt(plaintext, "org", str(_FAKE_ORG_ID))
    c = AICredential()
    c.id = uuid.uuid4()
    c.scope = "org"
    c.scope_id = _FAKE_ORG_ID
    c.provider = "openai-compatible"
    c.base_url = "https://api.example.com"
    c.model = "test-model"
    c.encrypted_key = enc
    c.encryption_iv = iv
    c.encryption_tag = tag
    c.data_residency = residency
    c.is_default = True
    c.is_disabled = False
    c.label = None
    c.created_by = uuid.uuid4()
    c.rotated_at = None
    c.last_used_at = None
    c.last_error_at = None
    return c


def _setup_db(rows: list[Any]) -> AsyncMock:
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.flush = AsyncMock()

    def wrap(v: Any) -> Any:
        m = MagicMock()
        m.scalar_one_or_none = MagicMock(return_value=v)
        m.scalar = MagicMock(return_value=v)
        m.first = MagicMock(return_value=v)
        scalars = MagicMock()
        scalars.all = MagicMock(return_value=v if isinstance(v, list) else [])
        m.scalars = MagicMock(return_value=scalars)
        return m

    db.execute = AsyncMock(side_effect=[wrap(r) for r in rows])
    return db


@pytest.mark.asyncio
async def test_assess_risk_byok_plumbing() -> None:
    """assess_risk 调用 → resolver 解密 → log_ai_usage 写库 → 返 stub."""
    from app.api.v1.ai.pipelines import assess_risk

    cred = _make_cred()
    db = _setup_db([cred, {}])
    result = await assess_risk(
        db, org_id=_FAKE_ORG_ID, user_id=_FAKE_USER_ID, input_={"dimensions": []}
    )
    assert "riskLevel" in result
    # ai_call_logs row 写了 (db.add 调用)
    assert db.add.call_count == 1
    log_record = db.add.call_args[0][0]
    assert log_record.pipeline == "risk-detection"
    assert log_record.org_id == _FAKE_ORG_ID


@pytest.mark.asyncio
async def test_recommend_triage_returns_dict() -> None:
    from app.api.v1.ai.pipelines import recommend_triage

    cred = _make_cred()
    db = _setup_db([cred, {}])
    result = await recommend_triage(
        db, org_id=_FAKE_ORG_ID, user_id=_FAKE_USER_ID, input_={"riskLevel": "level_1"}
    )
    assert isinstance(result, dict)


@pytest.mark.asyncio
async def test_interpret_result_returns_string() -> None:
    """interpret_result 是 stub_kind='string', 应返字符串."""
    from app.api.v1.ai.pipelines import interpret_result

    cred = _make_cred()
    db = _setup_db([cred, {}])
    result = await interpret_result(
        db, org_id=_FAKE_ORG_ID, user_id=_FAKE_USER_ID, input_={"scaleName": "PHQ-9"}
    )
    assert isinstance(result, str)


@pytest.mark.asyncio
async def test_pipeline_propagates_phi_compliance() -> None:
    """global cred + 无 consent → PHIComplianceError 从 pipeline 透出."""
    from app.api.v1.ai.pipelines import assess_risk
    from app.lib.errors import PHIComplianceError

    cred = _make_cred(residency="global")
    db = _setup_db([cred, {}])  # 空 settings — 没 consent
    with pytest.raises(PHIComplianceError):
        await assess_risk(db, org_id=_FAKE_ORG_ID, user_id=_FAKE_USER_ID, input_={"dimensions": []})


@pytest.mark.asyncio
async def test_pipeline_no_credential_raises() -> None:
    """没配 cred → ValidationError."""
    from app.api.v1.ai.pipelines import recommend_triage
    from app.lib.errors import ValidationError

    db = _setup_db([None, None])  # org 无, platform 无
    with pytest.raises(ValidationError):
        await recommend_triage(db, org_id=_FAKE_ORG_ID, user_id=_FAKE_USER_ID, input_={})


@pytest.mark.asyncio
async def test_extract_pipelines_run() -> None:
    """extract-* 系列 stub_result 是 dict."""
    from app.api.v1.ai.pipelines import (
        extract_agreement,
        extract_course,
        extract_goal,
        extract_note_template,
        extract_scale,
        extract_scheme,
    )

    for fn in (
        extract_agreement,
        extract_course,
        extract_goal,
        extract_note_template,
        extract_scale,
        extract_scheme,
    ):
        cred = _make_cred()
        db = _setup_db([cred, {}])
        result = await fn(db, org_id=_FAKE_ORG_ID, user_id=_FAKE_USER_ID, content="x")
        assert isinstance(result, dict)


@pytest.mark.asyncio
async def test_chat_create_pipelines_run() -> None:
    """create-*-chat 系列 stub_result 是 dict."""
    from app.api.v1.ai.pipelines import (
        chat_create_agreement,
        chat_create_course,
        chat_create_goal,
        chat_create_note_template,
        chat_create_scale,
        chat_create_scheme,
    )

    for fn in (
        chat_create_agreement,
        chat_create_course,
        chat_create_goal,
        chat_create_note_template,
        chat_create_scale,
        chat_create_scheme,
    ):
        cred = _make_cred()
        db = _setup_db([cred, {}])
        result = await fn(
            db,
            org_id=_FAKE_ORG_ID,
            user_id=_FAKE_USER_ID,
            messages=[{"role": "user", "content": "hi"}],
        )
        assert isinstance(result, dict)


@pytest.mark.asyncio
async def test_course_authoring_helpers_run() -> None:
    from app.api.v1.ai.pipelines import (
        generate_all_lesson_blocks,
        generate_course_blueprint,
        generate_single_lesson_block,
        refine_course_blueprint,
        refine_lesson_block,
    )

    cred = _make_cred()
    db = _setup_db([cred, {}])
    bp = await generate_course_blueprint(
        db, org_id=_FAKE_ORG_ID, user_id=_FAKE_USER_ID, requirements={"x": 1}
    )
    assert isinstance(bp, dict)

    cred2 = _make_cred()
    db2 = _setup_db([cred2, {}])
    refined = await refine_course_blueprint(
        db2,
        org_id=_FAKE_ORG_ID,
        user_id=_FAKE_USER_ID,
        current_blueprint={"a": 1},
        instruction="改进",
    )
    assert isinstance(refined, dict)

    cred3 = _make_cred()
    db3 = _setup_db([cred3, {}])
    blocks = await generate_all_lesson_blocks(
        db3,
        org_id=_FAKE_ORG_ID,
        user_id=_FAKE_USER_ID,
        blueprint={"x": 1},
        session_index=0,
    )
    assert isinstance(blocks, list)

    cred4 = _make_cred()
    db4 = _setup_db([cred4, {}])
    one = await generate_single_lesson_block(
        db4,
        org_id=_FAKE_ORG_ID,
        user_id=_FAKE_USER_ID,
        blueprint={"x": 1},
        session_index=0,
        block_type="warmup",
    )
    assert isinstance(one, str)

    cred5 = _make_cred()
    db5 = _setup_db([cred5, {}])
    refined2 = await refine_lesson_block(
        db5,
        org_id=_FAKE_ORG_ID,
        user_id=_FAKE_USER_ID,
        block_content="原内容",
        instruction="改",
    )
    assert isinstance(refined2, str)


@pytest.mark.asyncio
async def test_generate_scheme_helpers_run() -> None:
    from app.api.v1.ai.pipelines import (
        generate_group_scheme,
        generate_group_scheme_overall,
        generate_group_session_detail,
        refine_group_scheme_overall,
        refine_group_session_detail,
    )

    for fn, kwargs in [
        (generate_group_scheme, {"prompt": "x"}),
        (generate_group_scheme_overall, {"prompt": "x"}),
        (
            generate_group_session_detail,
            {"overall_scheme": {"x": 1}, "session_index": 0},
        ),
        (
            refine_group_scheme_overall,
            {"current_scheme": {"x": 1}, "instruction": "改"},
        ),
        (
            refine_group_session_detail,
            {
                "current_session": {"a": 1},
                "overall_scheme": {"x": 1},
                "session_index": 0,
                "instruction": "改",
            },
        ),
    ]:
        cred = _make_cred()
        db = _setup_db([cred, {}])
        result = await fn(db, org_id=_FAKE_ORG_ID, user_id=_FAKE_USER_ID, **kwargs)
        assert isinstance(result, dict)


@pytest.mark.asyncio
async def test_chat_helpers_with_context_run() -> None:
    from app.api.v1.ai.pipelines import (
        chat_configure_screening_rules,
        note_guidance_chat,
        simulated_client_chat,
        supervision_chat,
    )

    for fn in (
        chat_configure_screening_rules,
        note_guidance_chat,
        simulated_client_chat,
        supervision_chat,
    ):
        cred = _make_cred()
        db = _setup_db([cred, {}])
        result = await fn(
            db,
            org_id=_FAKE_ORG_ID,
            user_id=_FAKE_USER_ID,
            messages=[{"role": "user", "content": "hi"}],
            context={"x": 1},
        )
        assert isinstance(result, dict)
