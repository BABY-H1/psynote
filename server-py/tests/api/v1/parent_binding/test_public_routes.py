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
            "phone": "13800001234",
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
            "phone": "13800001234",
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
            "phone": "13800001234",
        },
    )
    assert r.status_code == 400


def test_bind_400_when_phone_missing(
    client: TestClient,
) -> None:
    """Phase 5: phone 必填 (家长真实手机号), 缺则 400."""
    r = client.post(
        f"/api/public/parent-bind/{_TOKEN}",
        json={
            "studentName": "张三",
            "studentNumber": "S001",
            "phoneLast4": "1234",
            "relation": "father",
            "myName": "张父",
            "password": "abcdef",
            # 故意不传 phone
        },
    )
    assert r.status_code == 400


def test_bind_400_when_phone_invalid_format(
    client: TestClient,
) -> None:
    """Phase 5: phone 不是中国大陆手机号 → 400/422."""
    r = client.post(
        f"/api/public/parent-bind/{_TOKEN}",
        json={
            "studentName": "张三",
            "studentNumber": "S001",
            "phoneLast4": "1234",
            "relation": "father",
            "myName": "张父",
            "password": "abcdef",
            "phone": "12345",  # 不合法
        },
    )
    assert r.status_code in (400, 422)


def test_bind_400_when_phone_last4_inconsistent_with_phone(
    client: TestClient,
) -> None:
    """Phase 5: phone 末 4 位与 phoneLast4 必须一致 (schema validator 拦, 防家长填错)."""
    r = client.post(
        f"/api/public/parent-bind/{_TOKEN}",
        json={
            "studentName": "张三",
            "studentNumber": "S001",
            "phoneLast4": "1234",
            "relation": "father",
            "myName": "张父",
            "password": "abcdef",
            "phone": "13800009999",  # 末 4 位 9999, 与 phoneLast4=1234 不符
        },
    )
    assert r.status_code in (400, 422)


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
            "phone": "13800001234",
        },
    )
    assert r.status_code == 400
    assert "信息核对失败" in r.json()["message"]


def test_bind_400_when_phone_last4_mismatch_recorded(
    client: TestClient,
    setup_db_results: SetupDbResults,
    make_token_row: object,
) -> None:
    """name + studentId 匹配, body phone/phoneLast4 自洽, 但与老师录入的不一致 → 400.

    body.phone_last4=1234, body.phone=...1234, 都自洽; 但老师库里录的是 ...9999.
    """
    token_row = make_token_row(token=_TOKEN)  # type: ignore[operator]
    student_user_id = uuid.UUID("00000000-0000-0000-0000-000000000003")
    matches = [(student_user_id, "张三", "S001", "13800009999")]  # 老师录的末4位是 9999
    setup_db_results([(token_row, "1班", "高一", "测试学校"), matches])
    r = client.post(
        f"/api/public/parent-bind/{_TOKEN}",
        json={
            "studentName": "张三",
            "studentNumber": "S001",
            "phoneLast4": "1234",
            "relation": "father",
            "myName": "张父",
            "password": "abcdef",
            "phone": "13800001234",  # body 自洽 (末4位 1234)
        },
    )
    assert r.status_code == 400


def test_bind_happy_creates_guardian_with_real_phone(
    client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
    make_token_row: object,
) -> None:
    """Phase 5 重点: guardian user.phone = 真手机号 (不是合成 email).

    成功路径: guardian + relationship transactional commit + password_hash 非空 (W0.4) +
    phone 字段是 11 位真手机号, email 是 None.
    """
    token_row = make_token_row(token=_TOKEN)  # type: ignore[operator]
    student_user_id = uuid.UUID("00000000-0000-0000-0000-000000000003")
    matches = [(student_user_id, "张三", "S001", "13800001234")]  # 老师录的末4位 1234 ✓
    # Fix 6: 新增 existing_guardian_q 查询 (按 phone+is_guardian) → None (无现有 guardian)
    # FIFO: token preview + matches + existing_guardian (None, 新建路径) +
    # (existing relationship 检查 None — 建新关系)
    setup_db_results(
        [
            (token_row, "1班", "高一", "测试学校"),
            matches,
            None,  # Fix 6: 现有 guardian 查询 → None, 走 path B (新建账户)
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
            "phone": "13800001234",
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
    # Phase 5 invariant: phone 是真手机号, email 不应是合成 g_xxx@guardian.internal
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

    # ⭐ Phase 5 关键 invariant: phone 是真手机号, email 不是合成的
    assert user_added.phone == "13800001234", "guardian.phone 必须是家长填的真手机号"
    assert user_added.email is None, "Phase 5: 不再用合成 email, 应为 None"
    # 防回归: email 不应包含历史的 'guardian.internal' 合成域
    if user_added.email is not None:
        assert "guardian.internal" not in user_added.email

    # silence unused
    _ = _make_org()


def test_bind_reuses_existing_guardian_no_duplicate_user(
    client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
    make_token_row: object,
) -> None:
    """Phase 5 P0 fix (Fix 6): 同 token + 同 phone 多次 POST → 不重建 guardian.

    场景: 第二次 POST (token 重放), 受害者已有 guardian user (前次 POST 建).
    期望: 不在 db.add() 创建新 User. 复用 existing guardian.
    """
    from app.db.models.users import User

    token_row = make_token_row(token=_TOKEN)  # type: ignore[operator]
    student_user_id = uuid.UUID("00000000-0000-0000-0000-000000000003")
    matches = [(student_user_id, "张三", "S001", "13800001234")]

    # 模拟 existing guardian (前次 POST 建的)
    existing_guardian = User()
    existing_guardian.id = uuid.UUID("00000000-0000-0000-0000-000000000abc")
    existing_guardian.phone = "13800001234"
    existing_guardian.email = None
    existing_guardian.name = "张父"
    existing_guardian.password_hash = "real-bcrypt"
    existing_guardian.is_guardian_account = True
    existing_guardian.is_system_admin = False

    # FIFO: token + matches + existing_guardian (找到!) + member_check (None) + relationship (None)
    setup_db_results(
        [
            (token_row, "1班", "高一", "测试学校"),
            matches,
            existing_guardian,  # Fix 6: 找到现有 guardian, 走 path A (复用)
            None,  # org_member 不存在 → 补建
            None,  # 关系不存在 → 建新 ClientRelationship
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
            "phone": "13800001234",
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert "accessToken" in body
    # token 用 existing guardian 的 id 签 (复用)
    assert body["user"]["id"] == "00000000-0000-0000-0000-000000000abc"

    # ⭐ Fix 6 关键 invariant: db.add 不应包含新 User 实例 (复用现有)
    user_inserts = [c.args[0] for c in mock_db.add.call_args_list if isinstance(c.args[0], User)]
    assert len(user_inserts) == 0, (
        f"Fix 6: 不应建新 guardian user (实际建了 {len(user_inserts)} 个); "
        "现有 guardian 应被复用以防 token 重放产生数据冗余"
    )
