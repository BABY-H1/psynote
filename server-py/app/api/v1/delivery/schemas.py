"""
Delivery 模块 API schemas (Pydantic v2)。

镜像 ``server/src/modules/delivery/`` 的 wire 形状 (camelCase, 与 Node 合约对齐):

  - ``delivery.service.ts`` UNION ALL 服务实例聚合 → ``ServiceInstance`` / ``ListServicesResponse``
  - ``launch.service.ts``   统一 launch verb → ``LaunchActionType`` / ``LaunchPayload`` / ``LaunchResult``
  - ``person-archive.service.ts`` 人员档案 → ``PersonSummary`` / ``PersonArchive`` / ``ArchivedService``
                                              / ``ArchiveTimelineEvent``

注: ``LaunchPayload`` 在 Node 端是 discriminated union, Python 端为简化 +
跟其它模块 schemas (Tier 1+2+3) 风格一致, 平铺成单一 schema (``LaunchPayload``)
含所有可选字段, 路由层再按 ``actionType`` 分支校验必填字段。
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.api.v1._schema_base import CamelModel

# ─── delivery.service.ts ServiceKindInput / ServiceInstanceRow ─────


ServiceKindInput = Literal["counseling", "group", "course", "assessment"]
"""与 delivery.service.ts:37 ``ServiceKindInput`` 一致 — UNION ALL 4 个分支的 kind tag。"""


class ServiceInstance(CamelModel):
    """跨 4 类 service 统一的实例行 (镜像 delivery.service.ts:39-60)。

    Node 端的 ``toCamel`` row mapper 1:1 对齐: snake-case 列名通过 ``CamelModel``
    自动转 camel alias 在 wire 上。

    kind-specific 字段 nullable — 不相关 kind 时为 None。
    """

    id: str
    kind: ServiceKindInput
    org_id: str
    title: str
    status: str
    owner_id: str
    participant_count: int = 0
    next_session_at: str | None = None
    last_activity_at: str
    created_at: str
    updated_at: str
    # kind-specific (counseling)
    client_id: str | None = None
    client_name: str | None = None
    current_risk: str | None = None
    # kind-specific (group)
    scheme_id: str | None = None
    capacity: int | None = None
    # kind-specific (course)
    course_id: str | None = None
    course_type: str | None = None
    # kind-specific (assessment)
    assessment_type: str | None = None


class ListServicesResponse(CamelModel):
    """``GET /services`` 响应 (镜像 delivery.service.ts:285)。"""

    items: list[ServiceInstance] = Field(default_factory=list)
    total: int = 0


# ─── launch.service.ts ────────────────────────────────────────


LaunchActionType = Literal[
    "launch_course",
    "launch_group",
    "create_episode",
    "send_assessment",
    "send_consent",
    "create_referral",
]
"""与 launch.service.ts:42-48 ``LaunchActionType`` 完全一致 — 6 个动作。"""


LaunchKind = Literal["course", "group", "counseling", "assessment", "consent", "referral"]
"""``LaunchResult.kind`` (镜像 launch.service.ts:125)。"""


class LaunchPayload(CamelModel):
    """统一 launch verb 的 payload (扁平 union, 镜像 launch.service.ts:58-121)。

    Node 端是 6 个 ``LaunchXxxPayload`` 的 discriminated union, Python 端为
    跟 Tier 1+2+3 路由层 baseline 一致, 平铺所有可选字段, 路由按 actionType
    分支校验必填项 (与 Node 端 ``ValidationError(...)`` 检查 1:1 等价)。
    """

    # 通用 / 跨 launch_course / launch_group / send_consent
    course_id: str | None = None
    group_id: str | None = None
    title: str | None = None
    description: str | None = None
    # launch_course
    publish_mode: str | None = None
    responsible_id: str | None = None
    client_user_ids: list[str] | None = None
    # launch_group
    scheme_id: str | None = None
    category: str | None = None
    leader_id: str | None = None
    schedule: str | None = None
    duration: str | None = None
    capacity: int | None = None
    # create_episode
    client_id: str | None = None
    counselor_id: str | None = None
    chief_complaint: str | None = None
    current_risk: str | None = None
    # send_assessment
    scale_id: str | None = None
    assessment_id: str | None = None
    care_episode_id: str | None = None
    # send_consent
    template_id: str | None = None
    client_user_id: str | None = None
    # create_referral
    reason: str | None = None
    risk_summary: str | None = None
    target_type: str | None = None
    target_name: str | None = None
    target_contact: str | None = None


class LaunchRequest(CamelModel):
    """``POST /services/launch`` 请求 (镜像 routes.ts:65-74)。"""

    action_type: LaunchActionType
    payload: LaunchPayload


class LaunchResult(CamelModel):
    """统一 launch envelope (镜像 launch.service.ts:123-132)。"""

    kind: LaunchKind
    instance_id: str
    enrollment_ids: list[str] | None = None
    summary: str


# ─── person-archive.service.ts ─────────────────────────────────


class PersonCounts(CamelModel):
    """``PersonSummary.counts`` 内部对象 (镜像 person-archive.service.ts:42-48)。"""

    counseling: int = 0
    group: int = 0
    course: int = 0
    assessment: int = 0
    total: int = 0


class PersonSummary(CamelModel):
    """``GET /people`` 列表元素 (镜像 person-archive.service.ts:34-48)。"""

    user_id: str
    name: str
    email: str | None = None
    last_activity_at: str
    counts: PersonCounts


class ListPeopleResponse(CamelModel):
    """``GET /people`` 响应 (镜像 person-archive.routes.ts:30-36)。"""

    items: list[PersonSummary] = Field(default_factory=list)


ArchiveServiceKind = Literal["counseling", "group", "course", "assessment"]


class ArchivedService(CamelModel):
    """``PersonArchive.services`` 元素 (镜像 person-archive.service.ts:73-92)。"""

    id: str
    kind: ArchiveServiceKind
    org_id: str
    title: str
    status: str
    description: str | None = None
    joined_at: str | None = None
    last_activity_at: str
    instance_id: str | None = None
    chief_complaint: str | None = None
    current_risk: str | None = None
    total_score: float | None = None


ArchiveTimelineEventType = Literal[
    "episode_opened",
    "episode_closed",
    "group_enrolled",
    "course_enrolled",
    "assessment_taken",
]


class ArchiveTimelineEvent(CamelModel):
    """``PersonArchive.timeline`` 元素 (镜像 person-archive.service.ts:94-103)。"""

    id: str
    kind: ArchiveServiceKind
    type: ArchiveTimelineEventType
    at: str
    title: str
    detail: str | None = None
    service_id: str


class PersonArchiveUser(CamelModel):
    """``PersonArchive.user`` 内嵌 (镜像 person-archive.service.ts:51-56)。"""

    id: str
    name: str
    email: str | None = None
    avatar_url: str | None = None


class PersonArchive(CamelModel):
    """``GET /people/{user_id}/archive`` 完整响应 (镜像 person-archive.service.ts:50-71)。"""

    user: PersonArchiveUser
    stats: PersonCounts
    services: list[ArchivedService] = Field(default_factory=list)
    timeline: list[ArchiveTimelineEvent] = Field(default_factory=list)


__all__ = [
    "ArchiveServiceKind",
    "ArchiveTimelineEvent",
    "ArchiveTimelineEventType",
    "ArchivedService",
    "LaunchActionType",
    "LaunchKind",
    "LaunchPayload",
    "LaunchRequest",
    "LaunchResult",
    "ListPeopleResponse",
    "ListServicesResponse",
    "PersonArchive",
    "PersonArchiveUser",
    "PersonCounts",
    "PersonSummary",
    "ServiceInstance",
    "ServiceKindInput",
]
