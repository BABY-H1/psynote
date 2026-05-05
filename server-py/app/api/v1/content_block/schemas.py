"""
Content block API 请求 / 响应 schemas (Pydantic v2)。

镜像 server/src/modules/content-block/content-block.routes.ts +
content-block.service.ts 的 JSON shape — client / portal 仍调旧合约
(camelCase), 故所有 schema 走 ``alias_generator=to_camel`` +
``populate_by_name=True``: 内部 Python 用 snake_case, JSON wire 用 camelCase。

所有 v1 schema 模块共享 ``CamelModel`` 基类 (见 ``app/api/v1/_schema_base``), 单一真理来源。
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.api.v1._schema_base import CamelModel

# ─── 与 packages/shared/src/types/content-block.ts:15 一致的 8 类 type ──

ContentBlockType = Literal[
    "video",
    "audio",
    "rich_text",
    "pdf",
    "quiz",
    "reflection",
    "worksheet",
    "check_in",
]

# 与 content-block.ts:31 一致
BlockVisibility = Literal["participant", "facilitator", "both"]

# parent 类型 — 与 service.ts:19 ParentType 一致
ParentType = Literal["course", "group"]


# ─── POST / 创建块请求 (镜像 routes.ts:79-109) ──────────────────


class CreateBlockRequest(CamelModel):
    """
    创建内容块。

    visibility 默认 (镜像 service.ts:140):
      parentType='course' → 'participant' (学员消费视角)
      parentType='group'  → 'both' (团辅多双方共用)

    payload 是块类型对应的数据 (e.g. video 块: {url, duration};
    quiz 块: {questions, correctAnswers}). 任意 dict 形状 → JSONB 列。
    """

    parent_type: ParentType
    # parent_id 是 chapter_id (course) 或 scheme_session_id (group), UUID 字符串
    parent_id: str = Field(min_length=1)
    block_type: ContentBlockType
    visibility: BlockVisibility | None = None
    sort_order: int | None = None
    payload: dict[str, Any] | None = None


# ─── PATCH /{block_id} 更新块请求 (镜像 routes.ts:117-140) ───────


class UpdateBlockRequest(CamelModel):
    """
    更新内容块。所有字段可选, 只更新提供的。``parentType`` 通过 query
    string 传 (与 Node 一致, 因为同一个 block_id 可能落在两表之一,
    必须告诉 router 走哪表)。
    """

    payload: dict[str, Any] | None = None
    visibility: BlockVisibility | None = None
    sort_order: int | None = None


# ─── POST /reorder body (镜像 routes.ts:164-185) ────────────────


class ReorderBlocksRequest(CamelModel):
    """批量更新 sort_order — orderedIds 列表的索引即新 sort_order。"""

    parent_type: ParentType
    parent_id: str = Field(min_length=1)
    ordered_ids: list[str] = Field(default_factory=list)


# ─── 内容块响应 (写后返回 / 列表元素) ───────────────────────────


class ContentBlockResponse(CamelModel):
    """
    单个内容块 — 列表 / batch / create / update 都返这个 shape。

    保留 chapter_id 与 scheme_session_id 两个互斥字段 (与 Node shape
    一致, 由 parent_type 决定哪个非 null)。
    """

    id: str
    chapter_id: str | None = None
    scheme_session_id: str | None = None
    block_type: str
    visibility: str
    sort_order: int
    payload: dict[str, Any]
    created_by: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
