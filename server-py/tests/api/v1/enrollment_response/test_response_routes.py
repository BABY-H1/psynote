"""
Enrollment response routes — 镜像
``server/src/modules/enrollment-response/response.routes.ts``。

Node 端没 .test.ts 文件, 这是 Python 端首次为该模块写 smoke tests, 覆盖:

  GET /                                — list, enrollmentType / enrollmentId 校验,
                                         client 角色 ownership 校验
  GET /pending-safety                  — staff role 守门, 跨 course/group 联合
  POST /{response_id}/review           — staff role 守门, 不存在 → 404
  POST /  (client portal side)         — submit upsert + safety scan + crisis 触发

Mock SQLAlchemy session 不连真 DB (见 conftest.py)。
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any
from unittest.mock import AsyncMock

if TYPE_CHECKING:
    from fastapi.testclient import TestClient

    from tests.api.v1.enrollment_response.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"
_USER_ID = "00000000-0000-0000-0000-000000000001"
_OTHER_USER_ID = "99999999-0000-0000-0000-000000000099"
_ENROLLMENT_ID = "10000000-0000-0000-0000-000000000001"
_BLOCK_ID = "20000000-0000-0000-0000-000000000001"
_RESPONSE_ID = "30000000-0000-0000-0000-000000000001"


def _make_response_row(
    *,
    response: Any | None = None,
    safety_flags: list[dict[str, Any]] | None = None,
    enrollment_type: str = "course",
    reviewed: bool = False,
) -> object:
    """构造 EnrollmentBlockResponse ORM 实例 (不持久化)。"""
    from app.db.models.enrollment_block_responses import EnrollmentBlockResponse

    row = EnrollmentBlockResponse()
    row.id = uuid.UUID(_RESPONSE_ID)
    row.enrollment_id = uuid.UUID(_ENROLLMENT_ID)
    row.enrollment_type = enrollment_type
    row.block_id = uuid.UUID(_BLOCK_ID)
    row.block_type = "reflection"
    row.response = response
    row.completed_at = datetime.now(UTC)
    row.safety_flags = safety_flags if safety_flags is not None else []
    row.reviewed_by_counselor = reviewed
    row.reviewed_at = None
    return row


# ─── GET / 列表 ────────────────────────────────────────────────


def test_list_responses_rejects_invalid_enrollment_type(staff_client: TestClient) -> None:
    """enrollmentType 非 course/group → 400。"""
    response = staff_client.get(
        f"/api/orgs/{_ORG_ID}/enrollment-responses/"
        f"?enrollmentId={_ENROLLMENT_ID}&enrollmentType=banana"
    )
    assert response.status_code == 400
    assert "enrollmentType" in response.json()["message"]


def test_list_responses_requires_enrollment_id(staff_client: TestClient) -> None:
    """enrollmentId 缺失 → 400。"""
    response = staff_client.get(f"/api/orgs/{_ORG_ID}/enrollment-responses/?enrollmentType=course")
    assert response.status_code == 400
    assert "enrollmentId" in response.json()["message"]


def test_list_responses_returns_rows_for_staff(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """staff 调列表 — 直接返该 enrollment 全部 responses (无 ownership 校验)。"""
    row = _make_response_row()
    setup_db_results([[row]])

    response = staff_client.get(
        f"/api/orgs/{_ORG_ID}/enrollment-responses/"
        f"?enrollmentId={_ENROLLMENT_ID}&enrollmentType=course"
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == _RESPONSE_ID
    # camelCase wire (alias_generator=to_camel)
    assert body[0]["enrollmentType"] == "course"
    assert body[0]["enrollmentId"] == _ENROLLMENT_ID
    assert body[0]["blockType"] == "reflection"
    assert body[0]["reviewedByCounselor"] is False


def test_list_responses_client_role_ownership_check_passes(
    client_role_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """
    client 角色 — ownership 校验 pass (enrollment.user_id == 当前 user) → 200 + rows.

    第一个 db.execute: ownership join 查 (id, user_id) tuple — 给学员自己。
    第二个 db.execute: list responses — 返一行。
    """
    own_enrollment = (uuid.UUID(_ENROLLMENT_ID), uuid.UUID(_USER_ID))
    row = _make_response_row()
    setup_db_results([own_enrollment, [row]])

    response = client_role_client.get(
        f"/api/orgs/{_ORG_ID}/enrollment-responses/"
        f"?enrollmentId={_ENROLLMENT_ID}&enrollmentType=course"
    )
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_list_responses_client_role_ownership_check_fails(
    client_role_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """
    client 角色 — ownership 校验 fail (enrollment.user_id ≠ 当前 user) → 403。

    routes.ts:48-54 的核心路径: 防一个 client 拿别人 enrollment_id 偷看响应。
    """
    other_enrollment = (uuid.UUID(_ENROLLMENT_ID), uuid.UUID(_OTHER_USER_ID))
    setup_db_results([other_enrollment])

    response = client_role_client.get(
        f"/api/orgs/{_ORG_ID}/enrollment-responses/"
        f"?enrollmentId={_ENROLLMENT_ID}&enrollmentType=course"
    )
    assert response.status_code == 403


def test_list_responses_client_role_enrollment_not_found(
    client_role_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """client 角色 — enrollment 根本不存在 → 404。"""
    setup_db_results([None])

    response = client_role_client.get(
        f"/api/orgs/{_ORG_ID}/enrollment-responses/"
        f"?enrollmentId={_ENROLLMENT_ID}&enrollmentType=group"
    )
    assert response.status_code == 404


# ─── GET /pending-safety ───────────────────────────────────────


def test_pending_safety_rejects_client_role(
    client_role_client: TestClient,
) -> None:
    """client 角色 → 403 (require_staff_role)。"""
    response = client_role_client.get(f"/api/orgs/{_ORG_ID}/enrollment-responses/pending-safety")
    assert response.status_code == 403


def test_pending_safety_returns_combined_rows(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """
    pending-safety 返合并的 course + group 行 (各加 user_id 列, 与 service.ts:266-297
    raw SQL 的 wire shape 一致)。

    setup_db_results 两次: 第一次 course join 查, 第二次 group join 查。
    """
    course_row = (
        uuid.UUID(_RESPONSE_ID),
        uuid.UUID(_ENROLLMENT_ID),
        "course",
        uuid.UUID(_BLOCK_ID),
        "reflection",
        {"text": "我想死"},
        [{"keyword": "想死", "severity": "critical", "snippet": "我想死"}],
        datetime.now(UTC),
        uuid.UUID(_USER_ID),
    )
    setup_db_results([[course_row], []])

    response = staff_client.get(f"/api/orgs/{_ORG_ID}/enrollment-responses/pending-safety")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == _RESPONSE_ID
    assert body[0]["enrollmentType"] == "course"
    assert body[0]["userId"] == _USER_ID
    assert body[0]["safetyFlags"][0]["severity"] == "critical"


# ─── POST /{response_id}/review ────────────────────────────────


def test_review_rejects_client_role(client_role_client: TestClient) -> None:
    """client 角色 → 403 (require_staff_role)。"""
    response = client_role_client.post(
        f"/api/orgs/{_ORG_ID}/enrollment-responses/{_RESPONSE_ID}/review"
    )
    assert response.status_code == 403


def test_review_response_not_found(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """response_id 不存在 → 404。"""
    setup_db_results([None])
    response = staff_client.post(f"/api/orgs/{_ORG_ID}/enrollment-responses/{_RESPONSE_ID}/review")
    assert response.status_code == 404


def test_review_response_invalid_uuid(staff_client: TestClient) -> None:
    """response_id 非 UUID 形态 → 404 (路径层抛 NotFoundError)。"""
    response = staff_client.post(f"/api/orgs/{_ORG_ID}/enrollment-responses/not-a-uuid/review")
    assert response.status_code == 404


def test_review_response_marks_row_reviewed(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """
    合法 response_id → 200, reviewedByCounselor=True。

    setup_db_results 一次: 取该 row。db.refresh side_effect 不动数据 (router 的赋值
    本身已经把 reviewed_by_counselor=True 写到对象上, refresh 后再读还是 True)。
    """
    row = _make_response_row(reviewed=False)
    setup_db_results([row])

    async def fake_refresh(obj: object) -> None:
        # router 已经把 obj.reviewed_by_counselor=True 设了, refresh 啥都不做
        return None

    mock_db.refresh = AsyncMock(side_effect=fake_refresh)

    response = staff_client.post(f"/api/orgs/{_ORG_ID}/enrollment-responses/{_RESPONSE_ID}/review")
    assert response.status_code == 200
    body = response.json()
    assert body["reviewedByCounselor"] is True


# ─── POST /  (client portal — submit response) ────────────────


def test_submit_response_validates_enrollment_type(
    client_role_client: TestClient,
) -> None:
    """enrollment_type 非 course/group → 400 (Pydantic Literal 触发 RequestValidationError,
    经全局 error_handler 转 400 ``VALIDATION_ERROR`` envelope)。"""
    response = client_role_client.post(
        f"/api/orgs/{_ORG_ID}/client/enrollment-responses/",
        json={
            "enrollmentId": _ENROLLMENT_ID,
            "enrollmentType": "banana",
            "blockId": _BLOCK_ID,
            "response": {"text": "hi"},
        },
    )
    assert response.status_code == 400
    assert response.json()["error"] == "VALIDATION_ERROR"


def test_submit_response_inserts_when_no_existing(
    client_role_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """
    无现存 response → insert 新行, completedAt 非空。

    DB 调用顺序:
      1. _assert_enrollment_owned_by_user → returns (id, user_id)
      2. _get_block_type → returns block_type str
      3. existing query → None (无现存)
    db.refresh side_effect: 给新对象赋 id (模拟 PG defaults)。
    """
    own_enrollment = (uuid.UUID(_ENROLLMENT_ID), uuid.UUID(_USER_ID))
    block_type = "reflection"
    setup_db_results([own_enrollment, block_type, None])

    async def fake_refresh(obj: object) -> None:
        obj.id = uuid.UUID("30000000-0000-0000-0000-000000000bbb")  # type: ignore[attr-defined]

    mock_db.refresh = AsyncMock(side_effect=fake_refresh)

    response = client_role_client.post(
        f"/api/orgs/{_ORG_ID}/client/enrollment-responses/",
        json={
            "enrollmentId": _ENROLLMENT_ID,
            "enrollmentType": "course",
            "blockId": _BLOCK_ID,
            "response": {"text": "hello"},
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["response"]["enrollmentType"] == "course"
    assert body["response"]["blockType"] == "reflection"
    assert body["response"]["safetyFlags"] == []
    # 无危机词 → crisis None
    assert body["crisis"] is None


def test_submit_response_updates_when_existing(
    client_role_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """有现存 response → update upsert (与 service.ts:133-145 一致)。"""
    own_enrollment = (uuid.UUID(_ENROLLMENT_ID), uuid.UUID(_USER_ID))
    block_type = "reflection"
    existing_row = _make_response_row(response={"text": "old"})
    setup_db_results([own_enrollment, block_type, existing_row])

    async def fake_refresh(obj: object) -> None:
        return None

    mock_db.refresh = AsyncMock(side_effect=fake_refresh)

    response = client_role_client.post(
        f"/api/orgs/{_ORG_ID}/client/enrollment-responses/",
        json={
            "enrollmentId": _ENROLLMENT_ID,
            "enrollmentType": "course",
            "blockId": _BLOCK_ID,
            "response": {"text": "new"},
        },
    )
    assert response.status_code == 201
    body = response.json()
    # router 改了 existing_row.response — wire 上 response 就是新 dict
    assert body["response"]["response"] == {"text": "new"}


def test_submit_response_triggers_crisis_on_critical_keyword(
    client_role_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """
    关键词 '想死' 命中 → safetyFlags 非空 + crisis.severity='critical' + 默认热线列表。

    与 service.ts:175-178 + keyword-scanner.ts:111-141 一致。
    """
    own_enrollment = (uuid.UUID(_ENROLLMENT_ID), uuid.UUID(_USER_ID))
    block_type = "reflection"
    setup_db_results([own_enrollment, block_type, None])

    async def fake_refresh(obj: object) -> None:
        obj.id = uuid.UUID("30000000-0000-0000-0000-000000000ccc")  # type: ignore[attr-defined]

    mock_db.refresh = AsyncMock(side_effect=fake_refresh)

    response = client_role_client.post(
        f"/api/orgs/{_ORG_ID}/client/enrollment-responses/",
        json={
            "enrollmentId": _ENROLLMENT_ID,
            "enrollmentType": "course",
            "blockId": _BLOCK_ID,
            "response": {"text": "我想死"},
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert len(body["response"]["safetyFlags"]) >= 1
    assert any(f["severity"] == "critical" for f in body["response"]["safetyFlags"])
    assert body["crisis"]["severity"] == "critical"
    assert len(body["crisis"]["resources"]) >= 1
    # 第一条热线名称
    assert "心理" in body["crisis"]["resources"][0]["name"]


def test_submit_response_ownership_fails_for_other_user(
    client_role_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """submit 时 enrollment 不属于当前 user → 403。"""
    other_enrollment = (uuid.UUID(_ENROLLMENT_ID), uuid.UUID(_OTHER_USER_ID))
    setup_db_results([other_enrollment])

    response = client_role_client.post(
        f"/api/orgs/{_ORG_ID}/client/enrollment-responses/",
        json={
            "enrollmentId": _ENROLLMENT_ID,
            "enrollmentType": "course",
            "blockId": _BLOCK_ID,
            "response": {"text": "hi"},
        },
    )
    assert response.status_code == 403


def test_submit_response_group_enrollment_path(
    client_role_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """
    enrollment_type='group' 路径 — ownership 走 group_enrollments, block_type 走
    group_session_blocks (polymorphic 分支)。
    """
    own_group_enrollment = (uuid.UUID(_ENROLLMENT_ID), uuid.UUID(_USER_ID))
    block_type = "video"
    setup_db_results([own_group_enrollment, block_type, None])

    async def fake_refresh(obj: object) -> None:
        obj.id = uuid.UUID("30000000-0000-0000-0000-000000000ddd")  # type: ignore[attr-defined]

    mock_db.refresh = AsyncMock(side_effect=fake_refresh)

    response = client_role_client.post(
        f"/api/orgs/{_ORG_ID}/client/enrollment-responses/",
        json={
            "enrollmentId": _ENROLLMENT_ID,
            "enrollmentType": "group",
            "blockId": _BLOCK_ID,
            "response": None,  # video block 已观看
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["response"]["enrollmentType"] == "group"
    assert body["response"]["blockType"] == "video"
    # response None → 不扫毒 → flags 空
    assert body["response"]["safetyFlags"] == []
