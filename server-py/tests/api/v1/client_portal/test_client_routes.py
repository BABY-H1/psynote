"""Client portal endpoint contract test — 镜像 ``client.routes.test.ts``.

23 endpoints (method, path) 完全对齐 Node test 的 expect array. 任何路由漂移
(漏挂 sub-router / 改路径) 即此测试 fail.
"""

from __future__ import annotations

import pytest
from fastapi.routing import APIRoute

# 与 server/src/modules/client-portal/client.routes.test.ts:36-60 expect 数组完全一致
# (Node 是 Fastify route paths, FastAPI 同样是 / 开头, 参数 :name 改成 {name})
_EXPECTED_PAIRS = sorted(
    [
        "GET /appointments",
        "GET /consents",
        "GET /counselors",
        "GET /courses",
        "GET /courses/{course_id}",
        "GET /dashboard",
        "GET /documents",
        "GET /documents/{doc_id}",
        "GET /groups",
        "GET /groups/{instance_id}",
        "GET /my-assessments",
        "GET /my-courses",
        "GET /my-groups",
        "GET /referrals",
        "GET /results",
        "GET /results/{result_id}",
        "GET /results/trajectory/{scale_id}",
        "GET /timeline",
        "POST /appointment-requests",
        "POST /consents/{consent_id}/revoke",
        "POST /documents/{doc_id}/sign",
        "POST /groups/{instance_id}/sessions/{session_record_id}/check-in",
        "POST /referrals/{referral_id}/consent",
    ]
)


@pytest.mark.parametrize("expected", [_EXPECTED_PAIRS])
def test_client_portal_router_registers_expected_routes(expected: list[str]) -> None:
    """与 Node ``client.routes.test.ts`` 同一 23-endpoint 契约."""
    from app.api.v1.client_portal import router as client_portal_router

    collected: list[str] = []
    for r in client_portal_router.routes:
        if not isinstance(r, APIRoute):
            continue
        for method in sorted(r.methods or set()):
            if method == "HEAD":
                continue
            collected.append(f"{method} {r.path}")
    assert sorted(collected) == expected


def test_client_portal_router_count_is_23() -> None:
    """与 Node test 的 ``count == 23`` 契约对齐."""
    from app.api.v1.client_portal import router as client_portal_router

    count = 0
    for r in client_portal_router.routes:
        if not isinstance(r, APIRoute):
            continue
        for method in r.methods or set():
            if method == "HEAD":
                continue
            count += 1
    assert count == 23
