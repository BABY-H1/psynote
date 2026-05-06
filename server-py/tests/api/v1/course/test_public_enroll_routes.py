"""
Public course enroll routes — 镜像 Node ``server/src/modules/course/public-course-enroll.routes.test.ts``.

6 个 Node test cases (regression-pinned), Python 端一一镜像:
  1. 新邮箱 → 创建 user 时 password_hash 必须为 NULL (W0.4 安全 regression guard)
  2. 已存在用户 → 复用, 不再 insert users (no email squat)
  3. 实例不存在 → 404
  4. status != active → 400
  5. publishMode != public → 403
  6. 缺 name 或 email → 400 (Pydantic 422 → error_handler 转 400)

外加 happy GET /{instance_id} info 测试.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.course.conftest import SetupDbResults


_INSTANCE_ID = "00000000-0000-0000-0000-000000000555"


# ─── GET /{instance_id} 公开课程信息 ────────────────────────────


def test_get_public_info_happy(
    client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
    make_course: object,
) -> None:
    """active + public 实例 + 配套 course → 200 with capacity / counts."""
    inst = make_instance(  # type: ignore[operator]
        publish_mode="public", status="active", capacity=30
    )
    course = make_course(title="正念课", course_id=inst.course_id)  # type: ignore[operator]
    course.description = "课程介绍"
    setup_db_results([inst, course, ["approved", "auto_approved", "pending"]])

    r = client.get(f"/api/public/courses/{_INSTANCE_ID}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == _INSTANCE_ID
    assert body["capacity"] == 30
    assert body["approvedCount"] == 2
    assert body["pendingCount"] == 1
    assert body["spotsLeft"] == 28


def test_get_public_info_404_when_missing(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = client.get(f"/api/public/courses/{_INSTANCE_ID}")
    assert r.status_code == 404


def test_get_public_info_400_when_closed(
    client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
) -> None:
    inst = make_instance(publish_mode="public", status="closed")  # type: ignore[operator]
    setup_db_results([inst])
    r = client.get(f"/api/public/courses/{_INSTANCE_ID}")
    assert r.status_code == 400
    assert "结束" in r.json()["message"]


def test_get_public_info_403_when_not_public(
    client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
) -> None:
    inst = make_instance(publish_mode="assign", status="active")  # type: ignore[operator]
    setup_db_results([inst])
    r = client.get(f"/api/public/courses/{_INSTANCE_ID}")
    assert r.status_code == 403


# ─── POST /{instance_id}/apply ─────────────────────────────────


def _new_id_user(email: str = "new@x.com") -> object:
    """build user obj for db.flush() pretend (返 fake id 即可)."""

    class FakeUser:
        id = uuid.UUID("00000000-0000-0000-0000-000000000010")
        email = email
        name = "新用户"
        password_hash = None

    return FakeUser()


def test_apply_new_email_password_hash_must_be_null(
    client: TestClient,
    mock_db: AsyncMock,
    make_instance: object,
) -> None:
    """W0.4 regression: 新建 user 时 password_hash 必须 None, 不得是 fake UUID。

    镜像 Node test:
      'POST /:instanceId/apply 新邮箱 → 创建 user 时 passwordHash 必须为 null'
    """
    inst = make_instance(  # type: ignore[operator]
        publish_mode="public", status="active", capacity=10
    )

    # FIFO execute side_effect: 1) instance 查询, 2) user 查询 (None), 3) dup 查询 (None)
    results: list[MagicMock] = []
    for row in [inst, None, None]:
        m = MagicMock()
        m.scalar_one_or_none = MagicMock(return_value=row)
        m.scalar = MagicMock(return_value=row)
        m.first = MagicMock(return_value=row)
        results.append(m)
    mock_db.execute = AsyncMock(side_effect=results)

    # 捕获 db.add 调用 — 验证 user 实例的 password_hash
    added: list[object] = []

    def _add(obj: object) -> None:
        added.append(obj)

    mock_db.add = MagicMock(side_effect=_add)

    # flush 给 user 一个 id (router 用 user.id 给后续 enrollment)
    async def _flush() -> None:
        # 找最近 add 的 User 给个 id
        from app.db.models.users import User as UserCls

        for obj in added:
            if isinstance(obj, UserCls) and obj.id is None:
                obj.id = uuid.UUID("00000000-0000-0000-0000-000000000010")

    mock_db.flush = AsyncMock(side_effect=_flush)

    r = client.post(
        f"/api/public/courses/{_INSTANCE_ID}/apply",
        json={"name": "王五", "email": "new@x.com"},
    )
    assert r.status_code == 201

    # 确认创建 user, password_hash IS NULL
    from app.db.models.users import User as UserCls

    new_users = [u for u in added if isinstance(u, UserCls)]
    assert len(new_users) == 1
    new_user = new_users[0]
    assert new_user.password_hash is None, (
        f"password_hash 必须为 None, 实际 = {new_user.password_hash!r}; "
        "历史 W0.4 audit bug 写的是 randomUUID(), 不能再回去!"
    )
    # Phase 5 P0 fix (Fix 5): 公开报名不占 email UNIQUE — 受害者真注册时撞约束
    assert new_user.email is None, (
        f"email 必须为 None, 实际 = {new_user.email!r}; "
        "Fix 5: 公开报名建匿名 user 防 email squat (受害者后续走 phone 真注册时 claim)"
    )


def test_apply_existing_user_no_user_insert(
    client: TestClient,
    mock_db: AsyncMock,
    make_instance: object,
    make_user_row: object,
) -> None:
    """已存在用户 → 直接复用, 不再 insert users (no email squat)."""
    inst = make_instance(  # type: ignore[operator]
        publish_mode="public", status="active", capacity=10
    )
    existing_user = make_user_row(  # type: ignore[operator]
        email="e@x.com", password_hash="real-bcrypt-hash"
    )

    results: list[MagicMock] = []
    for row in [inst, existing_user, None]:  # instance / user found / dup None
        m = MagicMock()
        m.scalar_one_or_none = MagicMock(return_value=row)
        m.scalar = MagicMock(return_value=row)
        m.first = MagicMock(return_value=row)
        results.append(m)
    mock_db.execute = AsyncMock(side_effect=results)

    added: list[object] = []
    mock_db.add = MagicMock(side_effect=lambda o: added.append(o))

    r = client.post(
        f"/api/public/courses/{_INSTANCE_ID}/apply",
        json={"name": "老用户", "email": "e@x.com"},
    )
    assert r.status_code == 201

    # 不应触发 users insert (db.add 列表里不应有 User 实例)
    from app.db.models.users import User as UserCls

    user_inserts = [u for u in added if isinstance(u, UserCls)]
    assert len(user_inserts) == 0


def test_apply_404_when_instance_missing(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = client.post(
        f"/api/public/courses/{_INSTANCE_ID}/apply",
        json={"name": "王五", "email": "a@x.com"},
    )
    assert r.status_code == 404


def test_apply_400_when_status_not_active(
    client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
) -> None:
    inst = make_instance(publish_mode="public", status="closed")  # type: ignore[operator]
    setup_db_results([inst])
    r = client.post(
        f"/api/public/courses/{_INSTANCE_ID}/apply",
        json={"name": "王五", "email": "a@x.com"},
    )
    assert r.status_code == 400


def test_apply_403_when_publish_mode_not_public(
    client: TestClient,
    setup_db_results: SetupDbResults,
    make_instance: object,
) -> None:
    inst = make_instance(publish_mode="assign", status="active")  # type: ignore[operator]
    setup_db_results([inst])
    r = client.post(
        f"/api/public/courses/{_INSTANCE_ID}/apply",
        json={"name": "王五", "email": "a@x.com"},
    )
    assert r.status_code == 403


def test_apply_400_when_missing_name_or_email(client: TestClient) -> None:
    """缺 name → Pydantic 422 → error_handler 转 400 VALIDATION_ERROR."""
    r = client.post(
        f"/api/public/courses/{_INSTANCE_ID}/apply",
        json={"email": "a@x.com"},  # 缺 name
    )
    assert r.status_code == 400
