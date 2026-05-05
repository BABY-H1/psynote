"""家长公开绑定 (无 auth) 测试.

镜像 ``parent-binding.service.ts`` 严格 3 字段匹配 + W0.4 password 必填.

关键 invariant:
  - GET /{token} 预览: 老师/班/过期, 不暴露学生名单
  - POST /{token}: 必须 student name + studentId + parentPhone last4 同时匹配
  - guardian user.password_hash 必填非空 (W0.4 — 不能 NULL allow any-password)
  - relationship.bound_via_token_id 记录来源
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.parent_binding.conftest import SetupDbResults

_TOKEN = "test-token-base64url-XXXX"


def _make_org() -> object:
    """私有 mini factory — 仅 public test 需要."""
    from app.db.models.organizations import Organization

    o = Organization()
    o.id = uuid.UUID("00000000-0000-0000-0000-000000000099")
    o.name = "测试学校"
    o.slug = "test-school"
    o.plan = "free"
    o.license_key = None
    o.settings = {}
    o.triage_config = {}
    o.data_retention_policy = None
    o.parent_org_id = None
    o.org_level = "leaf"
    return o


# ─── GET /{token} ───────────────────────────────────────────────


def test_preview_happy(
    client: TestClient,
    setup_db_results: SetupDbResults,
    make_token_row: object,
) -> None:
    """有效 token: 返回 org/class/grade/expiresAt."""
    token_row = make_token_row(token=_TOKEN)  # type: ignore[operator]
    setup_db_results([(token_row, "1班", "高一", "测试学校")])
    r = client.get(f"/api/public/parent-bind/{_TOKEN}")
    assert r.status_code == 200
    body = r.json()
    assert body["orgName"] == "测试学校"
    assert body["className"] == "1班"
    assert body["classGrade"] == "高一"


def test_preview_404_when_token_not_found(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = client.get(f"/api/public/parent-bind/{_TOKEN}")
    assert r.status_code == 404


def test_preview_400_when_token_revoked(
    client: TestClient,
    setup_db_results: SetupDbResults,
    make_token_row: object,
) -> None:
    token_row = make_token_row(token=_TOKEN, revoked=True)  # type: ignore[operator]
    setup_db_results([(token_row, "1班", "高一", "测试学校")])
    r = client.get(f"/api/public/parent-bind/{_TOKEN}")
    assert r.status_code == 400


def test_preview_400_when_token_expired(
    client: TestClient,
    setup_db_results: SetupDbResults,
    make_token_row: object,
) -> None:
    token_row = make_token_row(token=_TOKEN, expired=True)  # type: ignore[operator]
    setup_db_results([(token_row, "1班", "高一", "测试学校")])
    r = client.get(f"/api/public/parent-bind/{_TOKEN}")
    assert r.status_code == 400


# ─── POST /{token} validation ─────────────────────────────────


def test_bind_400_when_password_too_short(
    client: TestClient,
) -> None:
    """password 必须 ≥ 6 位, 否则 400 (W0.4 镜像 — 不能默认 NULL allow任意密码)."""
    r = client.post(
        f"/api/public/parent-bind/{_TOKEN}",
        json={
            "studentName": "张三",
            "studentNumber": "S001",
            "phoneLast4": "1234",
            "relation": "father",
            "myName": "张父",
            "password": "abc",  # 太短
        },
    )
    assert r.status_code == 400


def test_bind_400_when_phone_last4_not_4_digits(
    client: TestClient,
) -> None:
    r = client.post(
        f"/api/public/parent-bind/{_TOKEN}",
        json={
            "studentName": "张三",
            "studentNumber": "S001",
            "phoneLast4": "12a4",  # 含字母
            "relation": "father",
            "myName": "张父",
            "password": "abcdef",
        },
    )
    assert r.status_code == 400


def test_bind_400_when_relation_invalid(
    client: TestClient,
) -> None:
    r = client.post(
        f"/api/public/parent-bind/{_TOKEN}",
        json={
            "studentName": "张三",
            "studentNumber": "S001",
            "phoneLast4": "1234",
            "relation": "uncle",  # 不在白名单
            "myName": "张父",
            "password": "abcdef",
        },
    )
    assert r.status_code == 400


def test_bind_400_when_no_student_match(
    client: TestClient,
    setup_db_results: SetupDbResults,
    make_token_row: object,
) -> None:
    """3 字段全部不匹配 → 信息核对失败 400."""
    token_row = make_token_row(token=_TOKEN)  # type: ignore[operator]
    setup_db_results(
        [(token_row, "1班", "高一", "测试学校"), []]
    )  # token preview + 0 student match
    r = client.post(
        f"/api/public/parent-bind/{_TOKEN}",
        json={
            "studentName": "张三",
            "studentNumber": "S001",
            "phoneLast4": "1234",
            "relation": "father",
            "myName": "张父",
            "password": "abcdef",
        },
    )
    assert r.status_code == 400
    assert "信息核对失败" in r.json()["message"]


def test_bind_400_when_phone_last4_mismatch(
    client: TestClient,
    setup_db_results: SetupDbResults,
    make_token_row: object,
) -> None:
    """name + studentId 匹配但 phoneLast4 不对 → 400."""
    token_row = make_token_row(token=_TOKEN)  # type: ignore[operator]
    student_user_id = uuid.UUID("00000000-0000-0000-0000-000000000003")
    matches = [(student_user_id, "张三", "S001", "13800009999")]  # 后4位是 9999
    setup_db_results([(token_row, "1班", "高一", "测试学校"), matches])
    r = client.post(
        f"/api/public/parent-bind/{_TOKEN}",
        json={
            "studentName": "张三",
            "studentNumber": "S001",
            "phoneLast4": "1234",  # 与 9999 不一致
            "relation": "father",
            "myName": "张父",
            "password": "abcdef",
        },
    )
    assert r.status_code == 400


def test_bind_happy_creates_guardian_with_password(
    client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
    make_token_row: object,
) -> None:
    """成功路径: guardian + relationship transactional commit + password_hash 非空 (W0.4)."""
    token_row = make_token_row(token=_TOKEN)  # type: ignore[operator]
    student_user_id = uuid.UUID("00000000-0000-0000-0000-000000000003")
    matches = [(student_user_id, "张三", "S001", "13800001234")]  # 后4位 1234 ✓
    # token preview + matches + (existing relationship 检查 None — 新建)
    setup_db_results(
        [
            (token_row, "1班", "高一", "测试学校"),
            matches,
            None,  # 关系不存在 → 建新
        ]
    )
    r = client.post(
        f"/api/public/parent-bind/{_TOKEN}",
        json={
            "studentName": "张三",
            "studentNumber": "S001",
            "phoneLast4": "1234",
            "relation": "father",
            "myName": "张父",
            "password": "abcdef",
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert "accessToken" in body
    assert "refreshToken" in body
    assert body["child"]["name"] == "张三"
    assert body["child"]["relation"] == "father"
    mock_db.commit.assert_awaited()

    # W0.4 invariant: db.add 接收的 User 必须有非空 password_hash
    from app.db.models.users import User

    user_added: User | None = None
    for call in mock_db.add.call_args_list:
        obj = call.args[0]
        if isinstance(obj, User):
            user_added = obj
            break
    assert user_added is not None, "guardian User must be db.add()-ed"
    assert user_added.password_hash, "W0.4 — guardian password_hash must NOT be NULL/empty"
    assert user_added.is_guardian_account is True

    # silence unused
    _ = _make_org()
