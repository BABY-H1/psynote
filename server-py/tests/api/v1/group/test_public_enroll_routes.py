"""
Public group enroll routes — 镜像 Node ``server/src/modules/group/public-enroll.routes.test.ts``.

W2.8 (security audit 2026-05-03): POST /:instanceId/checkin/:sessionId 必须验证
``enrollment.instance_id == path instance_id`` (防跨组任意签到伪造) — 完全镜像 Node
test 的 5 个核心 cases.

额外覆盖:
  - GET / (招募页 happy + not_found + not_recruiting + 已结束)
  - POST /apply (公开报名 transactional + 容量满 + 已报名 + 缺名字)
  - GET /checkin (签到页) happy/not_found
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.group.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"
_INSTANCE_ID = "00000000-0000-0000-0000-000000000333"
_SESSION_ID = "00000000-0000-0000-0000-000000000555"
_ENROLLMENT_ID = "00000000-0000-0000-0000-000000000444"


# ─── GET /:instance_id ────────────────────────────────────────


def test_get_public_instance_happy(
    client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
) -> None:
    """recruiting 状态: 200 + 招募页字段."""
    inst = make_instance(  # type: ignore[operator]
        status="recruiting", capacity=10
    )
    # instance lookup + (no scheme so no scheme query) + count tuple (approved, pending)
    setup_db_results([inst, (2, 1)])
    r = client.get(f"/api/public/groups/{_INSTANCE_ID}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == _INSTANCE_ID
    assert body["approvedCount"] == 2
    assert body["pendingCount"] == 1
    assert body["spotsLeft"] == 8


def test_get_public_instance_not_found_returns_error_envelope(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = client.get(f"/api/public/groups/{_INSTANCE_ID}")
    # Node 行为: 200 + error envelope (而非 4xx)
    assert r.status_code == 200
    assert r.json()["error"] == "not_found"


def test_get_public_instance_not_recruiting_returns_status_code_envelope(
    client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
) -> None:
    inst = make_instance(status="ended")  # type: ignore[operator]
    setup_db_results([inst])
    r = client.get(f"/api/public/groups/{_INSTANCE_ID}")
    assert r.status_code == 200
    body = r.json()
    assert body["error"] == "not_recruiting"
    assert body["status"] == "ended"


# ─── POST /:instance_id/apply ─────────────────────────────────


def test_apply_happy_creates_user_and_enrollment(
    client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
    make_instance: object,
) -> None:
    """无 email 走 name-only 路径: 建 user + member + enrollment, transactional."""
    inst = make_instance(status="recruiting", capacity=10)  # type: ignore[operator]
    # instance lookup + capacity count(0) + member existing(None) + dup_q(None)
    setup_db_results([inst, 0, None, None])
    r = client.post(
        f"/api/public/groups/{_INSTANCE_ID}/apply",
        json={"name": "新人"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["success"] is True
    assert body["status"] == "pending"
    mock_db.commit.assert_awaited()


def test_apply_with_existing_email_reuses_user(
    client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
    make_user_row: object,
) -> None:
    """email 已存在: 复用 user_id, 不建新 user."""
    inst = make_instance(status="recruiting", capacity=None)  # type: ignore[operator]
    existing_user = make_user_row(email="x@y.com", name="老人")  # type: ignore[operator]
    # instance + (no capacity check) + existing user lookup + member existing(None) + dup(None)
    setup_db_results([inst, existing_user, None, None])
    r = client.post(
        f"/api/public/groups/{_INSTANCE_ID}/apply",
        json={"name": "随便", "email": "x@y.com"},
    )
    assert r.status_code == 201


def test_apply_capacity_full_returns_400(
    client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
) -> None:
    inst = make_instance(status="recruiting", capacity=2)  # type: ignore[operator]
    setup_db_results([inst, 2])  # capacity 满
    r = client.post(
        f"/api/public/groups/{_INSTANCE_ID}/apply",
        json={"name": "晚到"},
    )
    assert r.status_code == 400
    assert "已满" in r.json()["error"]


def test_apply_already_enrolled_returns_400(
    client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
    make_enrollment: object,
) -> None:
    inst = make_instance(status="recruiting", capacity=None)  # type: ignore[operator]
    existing_enr = make_enrollment(status="pending")  # type: ignore[operator]
    # instance + (无 email 走 new user 路径直插) + member None + dup_q (existing!)
    setup_db_results([inst, None, existing_enr])
    r = client.post(
        f"/api/public/groups/{_INSTANCE_ID}/apply",
        json={"name": "重复"},
    )
    assert r.status_code == 400
    body = r.json()
    assert body["error"] == "already_enrolled"


def test_apply_missing_name_returns_400(client: TestClient) -> None:
    """空 name: pydantic min_length 校验拦在 router 前."""
    r = client.post(
        f"/api/public/groups/{_INSTANCE_ID}/apply",
        json={"name": ""},
    )
    # FastAPI / pydantic 校验: 422 默认; 经我们的 error_handler 改写成 400
    assert r.status_code == 400


def test_apply_not_recruiting_returns_400(
    client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
) -> None:
    inst = make_instance(status="draft")  # type: ignore[operator]
    setup_db_results([inst])
    r = client.post(
        f"/api/public/groups/{_INSTANCE_ID}/apply",
        json={"name": "x"},
    )
    assert r.status_code == 400


# ─── GET /:instance_id/checkin/:session_id ────────────────────


def test_get_checkin_page_happy(
    client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
    make_session_record: object,
    make_enrollment: object,
    make_attendance: object,
) -> None:
    inst = make_instance()  # type: ignore[operator]
    sess = make_session_record(session_number=2)  # type: ignore[operator]
    enr = make_enrollment(status="approved")  # type: ignore[operator]
    att = make_attendance(status="present")  # type: ignore[operator]
    # instance + session + enrollments join (rows) + attendance list
    setup_db_results([inst, sess, [(enr, "甲", "a@b.com")], [att]])

    r = client.get(f"/api/public/groups/{_INSTANCE_ID}/checkin/{_SESSION_ID}")
    assert r.status_code == 200
    body = r.json()
    assert body["sessionNumber"] == 2
    assert len(body["members"]) == 1


def test_get_checkin_page_not_found(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = client.get(f"/api/public/groups/{_INSTANCE_ID}/checkin/{_SESSION_ID}")
    assert r.status_code == 200
    assert r.json()["error"] == "not_found"


# ─── POST /:instance_id/checkin/:session_id (W2.8 关键安全) ────
# 完全镜像 Node public-enroll.routes.test.ts 的 5 个 case (instance verification).


def test_w28_normal_checkin_writes_attendance(
    client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
    make_session_record: object,
) -> None:
    """正常签到: enrollment 属于本 instance → 200, 写出勤. 镜像 Node test L65-80."""
    sess = make_session_record(status="planned")  # type: ignore[operator]
    # 1) session lookup; 2) enrollment_in_inst (W2.8); 3) existing attendance None
    setup_db_results([sess, "enr-ok", None])

    r = client.post(
        f"/api/public/groups/{_INSTANCE_ID}/checkin/{_SESSION_ID}",
        json={"enrollmentId": _ENROLLMENT_ID},
    )
    assert r.status_code == 200
    assert r.json()["success"] is True
    # 必须 commit 出勤行
    mock_db.commit.assert_awaited()


def test_w28_cross_group_enrollment_rejected(
    client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
    make_session_record: object,
) -> None:
    """⭐ W2.8 关键: enrollment 不属于本 instance → 404, 不写出勤. 镜像 Node test L82-95."""
    sess = make_session_record()  # type: ignore[operator]
    # 1) session 找到; 2) enrollment_in_inst 空 (跨组)
    setup_db_results([sess, None])

    r = client.post(
        f"/api/public/groups/{_INSTANCE_ID}/checkin/{_SESSION_ID}",
        json={"enrollmentId": "00000000-0000-0000-0000-0000000ff000"},
    )
    assert r.status_code == 404
    # 关键: 不能 commit 任何 attendance — mock_db.commit 没被 await
    mock_db.commit.assert_not_awaited()


def test_w28_already_checked_in_no_duplicate(
    client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
    make_session_record: object,
    make_attendance: object,
) -> None:
    """已签到 → 200, 不重复 insert. 镜像 Node test L97-111."""
    sess = make_session_record()  # type: ignore[operator]
    att_existing = make_attendance(status="present")  # type: ignore[operator]
    # session + enrollment_in_inst + existing attendance!
    setup_db_results([sess, "enr-ok", att_existing])

    r = client.post(
        f"/api/public/groups/{_INSTANCE_ID}/checkin/{_SESSION_ID}",
        json={"enrollmentId": _ENROLLMENT_ID},
    )
    assert r.status_code == 200
    body = r.json()
    assert "已签到" in body["message"]
    # 已签到不写新行 → 不 commit
    mock_db.commit.assert_not_awaited()


def test_w28_session_not_in_instance_returns_404(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """session 不存在 / 不属于本 instance → 404. 镜像 Node test L113-122."""
    setup_db_results([None])  # session lookup 找不到 (因为 (sess_id, inst_id) 不匹配)
    r = client.post(
        f"/api/public/groups/{_INSTANCE_ID}/checkin/{_SESSION_ID}",
        json={"enrollmentId": _ENROLLMENT_ID},
    )
    assert r.status_code == 404


def test_w28_missing_enrollment_id_returns_400(client: TestClient) -> None:
    """缺 enrollmentId → 400. 镜像 Node test L124-133."""
    r = client.post(
        f"/api/public/groups/{_INSTANCE_ID}/checkin/{_SESSION_ID}",
        json={},
    )
    # body 缺 enrollmentId → pydantic min_length=1 拦在 schema 校验, 经 error_handler 转 400
    assert r.status_code == 400
