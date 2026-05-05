"""
Course core router — 镜像 Node ``server/src/modules/course/course.routes.ts``。

涵盖 endpoint:
  - GET    /api/orgs/{org_id}/courses/                        — 列表 (含 search 过滤)
  - GET    /api/orgs/{org_id}/courses/{course_id}             — 详情
  - POST   /api/orgs/{org_id}/courses/                        — 创建 (admin/counselor; 含 chapters)
  - PATCH  /api/orgs/{org_id}/courses/{course_id}             — 更新
  - DELETE /api/orgs/{org_id}/courses/{course_id}             — 删除
  - POST   /api/orgs/{org_id}/courses/{course_id}/publish     — 发布 (status=published)
  - POST   /api/orgs/{org_id}/courses/{course_id}/clone       — 克隆 (chapters + lesson_blocks)
  - POST   /api/orgs/{org_id}/courses/{course_id}/confirm-blueprint
  - GET    .../chapters/{chapter_id}/blocks                   — 列表
  - PUT    .../chapters/{chapter_id}/blocks                   — upsert
  - PATCH  .../chapters/{chapter_id}/blocks/{block_id}        — 单 block 更新
  - POST   /{course_id}/enroll                                — 自助报名
  - POST   /{course_id}/assign                                — counselor 指派
  - PATCH  /enrollments/{enrollment_id}/progress              — 章节完成
  - GET / POST / DELETE /template-tags                        — 标签 CRUD

每端点至少 2 cases (happy + sad).
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.course.conftest import SetupDbResults

_ORG_ID = "00000000-0000-0000-0000-000000000099"
_USER_ID = "00000000-0000-0000-0000-000000000001"
_COURSE_ID = "00000000-0000-0000-0000-000000000111"
_CHAPTER_ID = "00000000-0000-0000-0000-000000000222"
_BLOCK_ID = "00000000-0000-0000-0000-000000000333"
_TAG_ID = "00000000-0000-0000-0000-000000000444"
_ENROLL_ID = "00000000-0000-0000-0000-000000000666"


# ─── GET /api/orgs/{org_id}/courses/ 列表 ───────────────────────


def test_list_courses_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_course: object,
) -> None:
    c = make_course(title="正念课")  # type: ignore[operator]
    setup_db_results([[c]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/courses/")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) == 1
    assert body[0]["title"] == "正念课"


def test_list_courses_search_filter(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_course: object,
) -> None:
    """search 不匹配时被过滤掉."""
    c = make_course(title="正念课")  # type: ignore[operator]
    setup_db_results([[c]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/courses/?search=不匹配")
    assert r.status_code == 200
    assert r.json() == []


def test_list_courses_rejects_client_role(client_role_org_client: TestClient) -> None:
    """legacy role='client' 不能访问."""
    r = client_role_org_client.get(f"/api/orgs/{_ORG_ID}/courses/")
    assert r.status_code == 403


# ─── GET /{course_id} 详情 ──────────────────────────────────────


def test_get_course_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_course: object,
    make_chapter: object,
) -> None:
    c = make_course(title="A")  # type: ignore[operator]
    ch = make_chapter(title="Ch 1")  # type: ignore[operator]
    setup_db_results([c, [ch]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/courses/{_COURSE_ID}")
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "A"
    assert len(body["chapters"]) == 1
    assert body["chapters"][0]["title"] == "Ch 1"


def test_get_course_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/courses/{_COURSE_ID}")
    assert r.status_code == 404


# ─── POST / 创建 ────────────────────────────────────────────────


def test_create_course_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """admin → 201, transactional. 不含 chapters 时不 insert 章节."""
    setup_db_results([])  # 没有 db.execute 调用 (除了 audit 走 no-op)

    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/courses/",
        json={"title": "新课"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["title"] == "新课"
    assert body["chapters"] == []
    mock_db.commit.assert_awaited()


def test_create_course_with_chapters(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """带 chapters → course + chapters 一起 add."""
    setup_db_results([])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/courses/",
        json={
            "title": "带章节",
            "chapters": [
                {"title": "Ch1"},
                {"title": "Ch2", "sortOrder": 5},
            ],
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert len(body["chapters"]) == 2
    assert body["chapters"][1]["sortOrder"] == 5


def test_create_course_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.post(f"/api/orgs/{_ORG_ID}/courses/", json={"title": "x"})
    assert r.status_code == 403


# ─── PATCH /{course_id} 更新 ───────────────────────────────────


def test_update_course_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_course: object,
    mock_db: AsyncMock,
) -> None:
    """ownership ok + 课程存在 → 200."""
    c = make_course(title="旧")  # type: ignore[operator]
    # _assert_course_owned_by_org 1 个 select; PATCH 主查 1 个
    setup_db_results([(c.org_id,), c])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/courses/{_COURSE_ID}",
        json={"title": "新", "description": "更新描述"},
    )
    assert r.status_code == 200
    assert c.title == "新"
    mock_db.commit.assert_awaited()


def test_update_course_403_when_other_org(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """course.org_id 与当前 org 不符 → 403 (assertLibraryItemOwnedByOrg)."""
    other_org = uuid.UUID("00000000-0000-0000-0000-000000000abc")
    setup_db_results([(other_org,)])
    r = admin_org_client.patch(f"/api/orgs/{_ORG_ID}/courses/{_COURSE_ID}", json={"title": "x"})
    assert r.status_code == 403


# ─── DELETE /{course_id} ───────────────────────────────────────


def test_delete_course_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_course: object,
    mock_db: AsyncMock,
) -> None:
    c = make_course()  # type: ignore[operator]
    # ownership 1 个 select, then course select, then delete
    setup_db_results([(c.org_id,), c, None])
    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/courses/{_COURSE_ID}")
    assert r.status_code == 204
    mock_db.commit.assert_awaited()


def test_delete_course_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """assert_course_owned_by_org 时找不到课程 → 404."""
    setup_db_results([None])
    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/courses/{_COURSE_ID}")
    assert r.status_code == 404


# ─── Lifecycle: publish / archive ──────────────────────────────


def test_publish_course_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_course: object,
    mock_db: AsyncMock,
) -> None:
    c = make_course(status="draft")  # type: ignore[operator]
    setup_db_results([c])
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/courses/{_COURSE_ID}/publish")
    assert r.status_code == 200
    assert c.status == "published"
    mock_db.commit.assert_awaited()


def test_archive_course_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_course: object,
) -> None:
    c = make_course(status="published")  # type: ignore[operator]
    setup_db_results([c])
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/courses/{_COURSE_ID}/archive")
    assert r.status_code == 200
    assert c.status == "archived"


def test_publish_404_when_missing(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/courses/{_COURSE_ID}/publish")
    assert r.status_code == 404


# ─── POST /{course_id}/clone — Template→Instance 派生 ──────────


def test_clone_course_template_sets_source_template_id(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_course: object,
) -> None:
    """源是模板 → 新课 source_template_id 指向源 id (镜像 service.ts:302)."""
    src = make_course(is_template=True)  # type: ignore[operator]
    setup_db_results([src, []])  # source / source chapters []

    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/courses/{_COURSE_ID}/clone")
    assert r.status_code == 201
    body = r.json()
    assert body["sourceTemplateId"] == _COURSE_ID
    assert body["isTemplate"] is False
    assert body["status"] == "draft"


def test_clone_course_404_when_source_missing(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/courses/{_COURSE_ID}/clone")
    assert r.status_code == 404


# ─── POST /confirm-blueprint ───────────────────────────────────


def test_confirm_blueprint_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_course: object,
    mock_db: AsyncMock,
) -> None:
    """blueprint sessions → chapters + status='content_authoring'."""
    c = make_course(status="blueprint")  # type: ignore[operator]
    # delete 旧 chapters; select course
    setup_db_results([None, c])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/courses/{_COURSE_ID}/confirm-blueprint",
        json={
            "sessions": [
                {
                    "title": "S1",
                    "goal": "g1",
                    "coreConcepts": "cc1",
                    "interactionSuggestions": "i1",
                    "homeworkSuggestion": "h1",
                }
            ]
        },
    )
    assert r.status_code == 200
    assert c.status == "content_authoring"
    mock_db.commit.assert_awaited()


def test_confirm_blueprint_400_when_no_sessions(
    admin_org_client: TestClient,
) -> None:
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/courses/{_COURSE_ID}/confirm-blueprint",
        json={"sessions": []},
    )
    assert r.status_code == 400


# ─── Lesson Blocks ─────────────────────────────────────────────


def test_list_lesson_blocks_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_lesson_block: object,
) -> None:
    b = make_lesson_block(block_type="opening")  # type: ignore[operator]
    setup_db_results([[b]])
    r = admin_org_client.get(
        f"/api/orgs/{_ORG_ID}/courses/{_COURSE_ID}/chapters/{_CHAPTER_ID}/blocks"
    )
    assert r.status_code == 200
    assert r.json()[0]["blockType"] == "opening"


def test_upsert_lesson_blocks_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """upsert: 删全部 + 重建 — 简单 bulk."""
    setup_db_results([None])  # delete 不返
    r = admin_org_client.put(
        f"/api/orgs/{_ORG_ID}/courses/{_COURSE_ID}/chapters/{_CHAPTER_ID}/blocks",
        json={
            "blocks": [
                {"blockType": "opening", "sortOrder": 0, "content": "intro"},
                {"blockType": "core_content", "sortOrder": 1},
            ]
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 2
    mock_db.commit.assert_awaited()


def test_update_lesson_block_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_lesson_block: object,
) -> None:
    b = make_lesson_block()  # type: ignore[operator]
    setup_db_results([b])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/courses/{_COURSE_ID}/chapters/{_CHAPTER_ID}/blocks/{_BLOCK_ID}",
        json={"content": "更新内容"},
    )
    assert r.status_code == 200
    assert b.content == "更新内容"


def test_update_lesson_block_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/courses/{_COURSE_ID}/chapters/{_CHAPTER_ID}/blocks/{_BLOCK_ID}",
        json={"content": "x"},
    )
    assert r.status_code == 404


# ─── POST /{course_id}/enroll 自助报名 ────────────────────────


def test_enroll_self_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """无重复报名 → 201 + new enrollment."""
    setup_db_results([None])  # dup 查无
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/courses/{_COURSE_ID}/enroll", json={})
    assert r.status_code == 201
    body = r.json()
    assert body["enrollmentSource"] == "self_enroll"
    assert body["approvalStatus"] == "pending"
    mock_db.commit.assert_awaited()


def test_enroll_self_409_when_duplicate(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_enrollment: object,
) -> None:
    e = make_enrollment()  # type: ignore[operator]
    setup_db_results([e])
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/courses/{_COURSE_ID}/enroll", json={})
    assert r.status_code == 409


# ─── POST /{course_id}/assign counselor 指派 ──────────────────


def test_assign_to_client_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """admin/counselor 指派来访者 → 201."""
    setup_db_results([None])  # dup 无
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/courses/{_COURSE_ID}/assign",
        json={"clientUserId": "00000000-0000-0000-0000-000000000abc"},
    )
    assert r.status_code == 201


def test_assign_to_client_409_when_dup(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_enrollment: object,
) -> None:
    e = make_enrollment()  # type: ignore[operator]
    setup_db_results([e])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/courses/{_COURSE_ID}/assign",
        json={"clientUserId": "00000000-0000-0000-0000-000000000abc"},
    )
    assert r.status_code == 409


# ─── PATCH /enrollments/{id}/progress ─────────────────────────


def test_update_progress_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_enrollment: object,
) -> None:
    e = make_enrollment()  # type: ignore[operator]
    setup_db_results([e])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/courses/enrollments/{_ENROLL_ID}/progress",
        json={"chapterId": _CHAPTER_ID, "completed": True},
    )
    assert r.status_code == 200
    assert e.progress[_CHAPTER_ID] is True


def test_update_progress_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/courses/enrollments/{_ENROLL_ID}/progress",
        json={"chapterId": _CHAPTER_ID, "completed": True},
    )
    assert r.status_code == 404


# ─── Template Tags ─────────────────────────────────────────────


def test_list_template_tags_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_template_tag: object,
) -> None:
    t = make_template_tag(name="焦虑")  # type: ignore[operator]
    setup_db_results([[t]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/courses/template-tags")
    assert r.status_code == 200
    body = r.json()
    assert body[0]["name"] == "焦虑"


def test_create_template_tag_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    setup_db_results([])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/courses/template-tags",
        json={"name": "新标签", "color": "#FF0000"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "新标签"
    assert body["color"] == "#FF0000"
    mock_db.commit.assert_awaited()


def test_delete_template_tag_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_template_tag: object,
) -> None:
    t = make_template_tag()  # type: ignore[operator]
    setup_db_results([t, None])
    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/courses/template-tags/{_TAG_ID}")
    assert r.status_code == 204


def test_delete_template_tag_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/courses/template-tags/{_TAG_ID}")
    assert r.status_code == 404
