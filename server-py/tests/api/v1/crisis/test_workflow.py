"""
Crisis workflow 状态机测试 — 镜像 ``server/src/modules/crisis/crisis-case.workflow.test.ts``.

涵盖 4 个 service 函数:
  - create_from_candidate (4 cases: happy / NotFound / wrong kind / wrong status)
  - update_checklist_step (cover closed-case 400)
  - submit_for_sign_off (cover missing-steps 400 + happy notify)
  - sign_off (cover approve closes episode + bounce reopens)

不通过 HTTP, 直接调 service 函数 — Node 端也是单测 workflow.ts. 所有 DB
访问通过 mock_db 控制。
"""

from __future__ import annotations

import uuid
from datetime import UTC
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

_ORG_UUID = uuid.UUID("00000000-0000-0000-0000-000000000099")
_CASE_UUID = uuid.UUID("00000000-0000-0000-0000-000000000c01")
_EPISODE_UUID = uuid.UUID("00000000-0000-0000-0000-000000000111")
_CANDIDATE_UUID = uuid.UUID("00000000-0000-0000-0000-000000000c02")
_USER_UUID = uuid.UUID("00000000-0000-0000-0000-000000000001")
_CLIENT_UUID = uuid.UUID("00000000-0000-0000-0000-000000000010")


def _make_result(row: Any) -> MagicMock:
    """同 conftest._make_query_result 的简化版."""
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=row)
    result.scalar = MagicMock(return_value=row)
    if isinstance(row, list):
        scalars = MagicMock()
        scalars.all = MagicMock(return_value=row)
        result.scalars = MagicMock(return_value=scalars)
    else:
        scalars = MagicMock()
        scalars.all = MagicMock(return_value=[row] if row is not None else [])
        result.scalars = MagicMock(return_value=scalars)
    return result


def _mock_db_with_results(rows: list[Any]) -> AsyncMock:
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.flush = AsyncMock()
    db.execute = AsyncMock(side_effect=[_make_result(r) for r in rows])
    return db


# ─── create_from_candidate ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_from_candidate_happy(make_candidate: Any) -> None:
    from app.api.v1.crisis.workflow_service import create_from_candidate

    cand = make_candidate()
    db = _mock_db_with_results([cand])

    result = await create_from_candidate(
        db,
        org_id=_ORG_UUID,
        candidate_id=_CANDIDATE_UUID,
        acceptor_user_id=_USER_UUID,
    )
    # 应至少创建 episode + crisis + timeline (3 add)
    assert db.add.call_count >= 3
    assert "episodeId" in result
    assert "crisisCaseId" in result


@pytest.mark.asyncio
async def test_create_from_candidate_not_found() -> None:
    from app.api.v1.crisis.workflow_service import create_from_candidate
    from app.lib.errors import NotFoundError

    db = _mock_db_with_results([None])
    with pytest.raises(NotFoundError):
        await create_from_candidate(
            db,
            org_id=_ORG_UUID,
            candidate_id=_CANDIDATE_UUID,
            acceptor_user_id=_USER_UUID,
        )


@pytest.mark.asyncio
async def test_create_from_candidate_wrong_kind(make_candidate: Any) -> None:
    """非 crisis_candidate 类型的候选 → ValidationError."""
    from app.api.v1.crisis.workflow_service import create_from_candidate
    from app.lib.errors import ValidationError

    cand = make_candidate(kind="risk_candidate")
    db = _mock_db_with_results([cand])

    with pytest.raises(ValidationError, match="仅 crisis_candidate"):
        await create_from_candidate(
            db,
            org_id=_ORG_UUID,
            candidate_id=_CANDIDATE_UUID,
            acceptor_user_id=_USER_UUID,
        )


@pytest.mark.asyncio
async def test_create_from_candidate_already_processed(make_candidate: Any) -> None:
    """status != pending 的候选 → ValidationError ('已被处理')."""
    from app.api.v1.crisis.workflow_service import create_from_candidate
    from app.lib.errors import ValidationError

    cand = make_candidate(status="resolved")
    db = _mock_db_with_results([cand])

    with pytest.raises(ValidationError, match="候选已被处理"):
        await create_from_candidate(
            db,
            org_id=_ORG_UUID,
            candidate_id=_CANDIDATE_UUID,
            acceptor_user_id=_USER_UUID,
        )


# ─── update_checklist_step ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_checklist_step_closed_case_blocks(
    make_crisis_case: Any,
) -> None:
    """closed 案件不可再改清单 — ValidationError."""
    from app.api.v1.crisis.workflow_service import update_checklist_step
    from app.lib.errors import ValidationError

    case = make_crisis_case(stage="closed")
    db = _mock_db_with_results([case])

    with pytest.raises(ValidationError, match="案件已结案"):
        await update_checklist_step(
            db,
            org_id=_ORG_UUID,
            case_id=_CASE_UUID,
            step_key="reinterview",
            payload={"done": True},
            user_id=_USER_UUID,
        )


@pytest.mark.asyncio
async def test_update_checklist_step_merges_payload(make_crisis_case: Any) -> None:
    """new payload merge 到 step, completedAt 自动填."""
    from app.api.v1.crisis.workflow_service import update_checklist_step

    case = make_crisis_case(stage="open", checklist={"reinterview": {"summary": "old"}})
    db = _mock_db_with_results([case])

    result = await update_checklist_step(
        db,
        org_id=_ORG_UUID,
        case_id=_CASE_UUID,
        step_key="reinterview",
        payload={"done": True, "summary": "new"},
        user_id=_USER_UUID,
    )
    assert result.checklist["reinterview"]["done"] is True
    assert result.checklist["reinterview"]["summary"] == "new"
    assert result.checklist["reinterview"]["completedAt"] is not None


# ─── submit_for_sign_off ───────────────────────────────────────────


_COMPLETED_CHECKLIST = {
    "reinterview": {"done": True, "summary": "X", "completedAt": "2026-04-19T00:00:00Z"},
    "parentContact": {
        "done": True,
        "method": "phone",
        "contactName": "妈妈",
        "completedAt": "2026-04-19T00:00:00Z",
    },
    "documents": {"done": True, "completedAt": "2026-04-19T00:00:00Z"},
    "referral": {
        "done": True,
        "skipped": True,
        "skipReason": "家长拒绝",
        "completedAt": "2026-04-19T00:00:00Z",
    },
    "followUp": {"done": True, "completedAt": "2026-04-19T00:00:00Z"},
}


@pytest.mark.asyncio
async def test_submit_rejects_when_steps_missing(make_crisis_case: Any) -> None:
    """有必做步骤未完成 → ValidationError + 不通知督导."""
    from app.api.v1.crisis.workflow_service import submit_for_sign_off
    from app.lib.errors import ValidationError

    case = make_crisis_case(stage="open", checklist={"reinterview": {"done": True}})
    db = _mock_db_with_results([case])

    with patch(
        "app.api.v1.crisis.workflow_service.notify_supervisors",
        new=AsyncMock(),
    ) as notify_mock:
        with pytest.raises(ValidationError, match="必做步骤未完成"):
            await submit_for_sign_off(
                db,
                org_id=_ORG_UUID,
                case_id=_CASE_UUID,
                closure_summary="结案摘要",
                user_id=_USER_UUID,
            )
        notify_mock.assert_not_called()


@pytest.mark.asyncio
async def test_submit_already_pending_blocks(make_crisis_case: Any) -> None:
    """已经 pending_sign_off 状态 → ValidationError."""
    from app.api.v1.crisis.workflow_service import submit_for_sign_off
    from app.lib.errors import ValidationError

    case = make_crisis_case(stage="pending_sign_off", checklist=_COMPLETED_CHECKLIST)
    db = _mock_db_with_results([case])
    with pytest.raises(ValidationError, match="已提交"):
        await submit_for_sign_off(
            db,
            org_id=_ORG_UUID,
            case_id=_CASE_UUID,
            closure_summary="X",
            user_id=_USER_UUID,
        )


@pytest.mark.asyncio
async def test_submit_happy_transitions_and_notifies(make_crisis_case: Any) -> None:
    """全部步骤已完成 → 转 pending_sign_off + 通知督导."""
    from app.api.v1.crisis.workflow_service import submit_for_sign_off

    case = make_crisis_case(stage="open", checklist=_COMPLETED_CHECKLIST)
    # get_case_by_id (1) + get_case_by_id_row (2)
    db = _mock_db_with_results([case, case])

    with patch(
        "app.api.v1.crisis.workflow_service.notify_supervisors",
        new=AsyncMock(),
    ) as notify_mock:
        result = await submit_for_sign_off(
            db,
            org_id=_ORG_UUID,
            case_id=_CASE_UUID,
            closure_summary="三方已沟通,拟结案",
            user_id=_USER_UUID,
        )
        assert result.stage == "pending_sign_off"
        assert result.closure_summary == "三方已沟通,拟结案"
        notify_mock.assert_awaited_once()
        # type 字段 = 'crisis_sign_off_request'
        call_kwargs = notify_mock.call_args.kwargs
        assert call_kwargs.get("notif_type") == "crisis_sign_off_request"


# ─── sign_off ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_sign_off_wrong_stage_blocks(make_crisis_case: Any) -> None:
    """不在 pending_sign_off 状态 → ValidationError."""
    from app.api.v1.crisis.workflow_service import sign_off
    from app.lib.errors import ValidationError

    case = make_crisis_case(stage="open")
    db = _mock_db_with_results([case])
    with pytest.raises(ValidationError, match="只有 pending_sign_off"):
        await sign_off(
            db,
            org_id=_ORG_UUID,
            case_id=_CASE_UUID,
            approve=True,
            supervisor_note=None,
            user_id=_USER_UUID,
        )


@pytest.mark.asyncio
async def test_sign_off_approve_closes_case_and_episode(
    make_crisis_case: Any, make_episode: Any
) -> None:
    """approve=True → stage='closed' + 关联 episode 也 close."""
    from app.api.v1.crisis.workflow_service import sign_off

    case = make_crisis_case(stage="pending_sign_off")
    episode = make_episode()
    # get_case_by_id_row (case) + select episode (episode)
    db = _mock_db_with_results([case, episode])

    result = await sign_off(
        db,
        org_id=_ORG_UUID,
        case_id=_CASE_UUID,
        approve=True,
        supervisor_note="处置完备",
        user_id=_USER_UUID,
    )
    assert result.stage == "closed"
    assert result.signed_off_at is not None
    assert episode.status == "closed"
    assert episode.closed_at is not None


@pytest.mark.asyncio
async def test_sign_off_bounce_reopens(make_crisis_case: Any) -> None:
    """approve=False → stage='reopened' + 清空 submitted_for_sign_off_at."""
    from datetime import datetime

    from app.api.v1.crisis.workflow_service import sign_off

    case = make_crisis_case(stage="pending_sign_off")
    case.submitted_for_sign_off_at = datetime.now(UTC)
    db = _mock_db_with_results([case])

    result = await sign_off(
        db,
        org_id=_ORG_UUID,
        case_id=_CASE_UUID,
        approve=False,
        supervisor_note="请补充家长沟通材料",
        user_id=_USER_UUID,
    )
    assert result.stage == "reopened"
    assert result.submitted_for_sign_off_at is None
