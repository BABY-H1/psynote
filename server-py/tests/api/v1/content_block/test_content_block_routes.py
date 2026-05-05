"""
Content block routes — 镜像 ``server/src/modules/content-block/``。

Node 端没 .test.ts 文件, 这是 Python 端首次为该模块写 smoke tests, 覆盖:
  - GET /                   — 校验 parentType / parentId 校验, role-based visibility filter
  - GET /batch              — 校验 parentType, 空 parentIds 返 []
  - POST /                  — 校验 staff role 守门, 默认 visibility, audit 触发
  - PATCH /{block_id}       — 校验 parentType query 必填
  - DELETE /{block_id}      — 校验 parentType query 必填
  - POST /reorder           — 校验 staff role 守门

测试不连真 DB — mock AsyncSession + dependency override (见 conftest.py)。
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

if TYPE_CHECKING:
    from fastapi.testclient import TestClient

    from tests.api.v1.content_block.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"
_CHAPTER_ID = "10000000-0000-0000-0000-000000000001"
_SCHEME_SESSION_ID = "20000000-0000-0000-0000-000000000001"
_BLOCK_ID = "30000000-0000-0000-0000-000000000001"


def _make_course_chapter() -> object:
    """构造 CourseChapter ORM 实例 (不持久化)。"""
    from app.db.models.course_chapters import CourseChapter

    chapter = CourseChapter()
    chapter.id = uuid.UUID(_CHAPTER_ID)
    chapter.course_id = uuid.UUID("11111111-0000-0000-0000-000000000001")
    chapter.title = "Ch 1"
    return chapter


def _make_course_block(*, visibility: str = "participant") -> object:
    """构造 CourseContentBlock ORM 实例。"""
    from app.db.models.course_content_blocks import CourseContentBlock

    block = CourseContentBlock()
    block.id = uuid.UUID(_BLOCK_ID)
    block.chapter_id = uuid.UUID(_CHAPTER_ID)
    block.block_type = "rich_text"
    block.visibility = visibility
    block.sort_order = 0
    block.payload = {"text": "hello"}
    block.created_by = None
    return block


def _make_group_session() -> object:
    from app.db.models.group_scheme_sessions import GroupSchemeSession

    sess = GroupSchemeSession()
    sess.id = uuid.UUID(_SCHEME_SESSION_ID)
    sess.scheme_id = uuid.UUID("22222222-0000-0000-0000-000000000001")
    sess.title = "Sess 1"
    return sess


def _make_group_block(*, visibility: str = "both") -> object:
    from app.db.models.group_session_blocks import GroupSessionBlock

    block = GroupSessionBlock()
    block.id = uuid.UUID(_BLOCK_ID)
    block.scheme_session_id = uuid.UUID(_SCHEME_SESSION_ID)
    block.block_type = "video"
    block.visibility = visibility
    block.sort_order = 0
    block.payload = {"url": "http://x"}
    block.created_by = None
    return block


# ─── GET / 列表 ────────────────────────────────────────────────


def test_list_blocks_rejects_invalid_parent_type(staff_client: TestClient) -> None:
    """parentType 必须是 course / group, 其他值 → 400 ValidationError。"""
    response = staff_client.get(
        f"/api/orgs/{_ORG_ID}/content-blocks/?parentType=banana&parentId={_CHAPTER_ID}"
    )
    assert response.status_code == 400
    assert "parentType" in response.json()["message"]


def test_list_blocks_requires_parent_id(staff_client: TestClient) -> None:
    """parentId 缺失 → 400。"""
    response = staff_client.get(f"/api/orgs/{_ORG_ID}/content-blocks/?parentType=course")
    assert response.status_code == 400
    assert "parentId" in response.json()["message"]


def test_list_course_blocks_returns_rows(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """合法 course 列出 — 返 ContentBlockResponse 数组。"""
    chapter = _make_course_chapter()
    block = _make_course_block(visibility="participant")
    # 第一次 execute: chapter join — 返 (chapter, course_org_id) tuple (org_id IS NULL → 平台级穿透)
    chapter_row = (chapter, None)
    # 第二次 execute: blocks query — 返 list[block]
    setup_db_results([chapter_row, [block]])

    response = staff_client.get(
        f"/api/orgs/{_ORG_ID}/content-blocks/?parentType=course&parentId={_CHAPTER_ID}"
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == _BLOCK_ID
    # camelCase wire (alias_generator=to_camel)
    assert body[0]["blockType"] == "rich_text"
    assert body[0]["chapterId"] == _CHAPTER_ID
    assert body[0]["sortOrder"] == 0


def test_list_blocks_filters_facilitator_only_for_client_role(
    client_role_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """Client role: visibility='facilitator' 必须不暴露 (BUG-012 fix)。"""
    chapter = _make_course_chapter()
    chapter_row = (chapter, None)
    visible_block = _make_course_block(visibility="participant")
    facilitator_block = _make_course_block(visibility="facilitator")
    facilitator_block.id = uuid.UUID("30000000-0000-0000-0000-000000000099")  # type: ignore[attr-defined]
    setup_db_results([chapter_row, [visible_block, facilitator_block]])

    response = client_role_client.get(
        f"/api/orgs/{_ORG_ID}/content-blocks/?parentType=course&parentId={_CHAPTER_ID}"
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["visibility"] == "participant"


# ─── GET /batch 批量 ────────────────────────────────────────────


def test_batch_empty_ids_returns_empty_array(staff_client: TestClient) -> None:
    """空 parentIds → 早返 [], 不查 DB。"""
    response = staff_client.get(
        f"/api/orgs/{_ORG_ID}/content-blocks/batch?parentType=course&parentIds="
    )
    assert response.status_code == 200
    assert response.json() == []


def test_batch_rejects_invalid_parent_type(staff_client: TestClient) -> None:
    response = staff_client.get(
        f"/api/orgs/{_ORG_ID}/content-blocks/batch?parentType=foo&parentIds=abc"
    )
    assert response.status_code == 400


def test_batch_rejects_non_uuid(staff_client: TestClient) -> None:
    """parentIds 含非 UUID → 400。"""
    response = staff_client.get(
        f"/api/orgs/{_ORG_ID}/content-blocks/batch?parentType=course&parentIds=not-a-uuid"
    )
    assert response.status_code == 400


def test_batch_returns_rows(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """合法 batch 调用 → 返块列表。"""
    block = _make_course_block()
    setup_db_results([[block]])

    response = staff_client.get(
        f"/api/orgs/{_ORG_ID}/content-blocks/batch?parentType=course&parentIds={_CHAPTER_ID}"
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == _BLOCK_ID


# ─── POST / 创建 ────────────────────────────────────────────────


def test_create_block_rejects_client_role(client_role_client: TestClient) -> None:
    """Client 不能创建 (rejectClient + requireRole)。"""
    response = client_role_client.post(
        f"/api/orgs/{_ORG_ID}/content-blocks/",
        json={
            "parentType": "course",
            "parentId": _CHAPTER_ID,
            "blockType": "rich_text",
        },
    )
    assert response.status_code == 403


def test_create_block_validates_block_type(
    staff_client: TestClient,
) -> None:
    """blockType 不在 8 类白名单 → 400 (Pydantic Literal)。"""
    response = staff_client.post(
        f"/api/orgs/{_ORG_ID}/content-blocks/",
        json={
            "parentType": "course",
            "parentId": _CHAPTER_ID,
            "blockType": "invalid_type",
        },
    )
    assert response.status_code == 400


def test_create_course_block_default_visibility_participant(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """course parent: visibility 默认 'participant'。"""
    chapter = _make_course_chapter()
    chapter_row = (chapter, None)
    setup_db_results([chapter_row])

    # mock db.refresh 让 created_by + payload + visibility 都已设
    async def fake_refresh(obj: object) -> None:
        # 模拟 DB 写后 server_default 解析: id 应该已经设了 (Python 端自己赋的就行)
        obj.id = uuid.UUID("30000000-0000-0000-0000-000000000aaa")  # type: ignore[attr-defined]

    mock_db.refresh = AsyncMock(side_effect=fake_refresh)

    response = staff_client.post(
        f"/api/orgs/{_ORG_ID}/content-blocks/",
        json={
            "parentType": "course",
            "parentId": _CHAPTER_ID,
            "blockType": "rich_text",
            "payload": {"text": "hi"},
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["visibility"] == "participant"
    assert body["blockType"] == "rich_text"


def test_create_group_block_default_visibility_both(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """group parent: visibility 默认 'both' (与 service.ts:140 一致)。"""
    sess = _make_group_session()
    sess_row = (sess, None)
    setup_db_results([sess_row])

    async def fake_refresh(obj: object) -> None:
        obj.id = uuid.UUID("30000000-0000-0000-0000-000000000bbb")  # type: ignore[attr-defined]

    mock_db.refresh = AsyncMock(side_effect=fake_refresh)

    response = staff_client.post(
        f"/api/orgs/{_ORG_ID}/content-blocks/",
        json={
            "parentType": "group",
            "parentId": _SCHEME_SESSION_ID,
            "blockType": "video",
        },
    )
    assert response.status_code == 201
    assert response.json()["visibility"] == "both"


# ─── PATCH /{block_id} 更新 ────────────────────────────────────


def test_update_requires_parent_type_query(staff_client: TestClient) -> None:
    """parentType query 缺失 → 400。"""
    response = staff_client.patch(
        f"/api/orgs/{_ORG_ID}/content-blocks/{_BLOCK_ID}",
        json={"sortOrder": 5},
    )
    assert response.status_code == 400
    assert "parentType" in response.json()["message"]


def test_update_block_not_found(
    staff_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """block_id 不存在 → 404。"""
    setup_db_results([None])
    response = staff_client.patch(
        f"/api/orgs/{_ORG_ID}/content-blocks/{_BLOCK_ID}?parentType=course",
        json={"sortOrder": 5},
    )
    assert response.status_code == 404


# ─── DELETE /{block_id} 删除 ───────────────────────────────────


def test_delete_requires_parent_type_query(staff_client: TestClient) -> None:
    response = staff_client.delete(f"/api/orgs/{_ORG_ID}/content-blocks/{_BLOCK_ID}")
    assert response.status_code == 400


def test_delete_rejects_client_role(client_role_client: TestClient) -> None:
    """Client 不能删 (requireRole)。"""
    response = client_role_client.delete(
        f"/api/orgs/{_ORG_ID}/content-blocks/{_BLOCK_ID}?parentType=course"
    )
    assert response.status_code == 403


# ─── POST /reorder ────────────────────────────────────────────


def test_reorder_rejects_client_role(client_role_client: TestClient) -> None:
    """Client 不能 reorder (requireRole)。"""
    response = client_role_client.post(
        f"/api/orgs/{_ORG_ID}/content-blocks/reorder",
        json={
            "parentType": "course",
            "parentId": _CHAPTER_ID,
            "orderedIds": [_BLOCK_ID],
        },
    )
    assert response.status_code == 403
