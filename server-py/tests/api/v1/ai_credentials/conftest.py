"""
``ai_credentials`` 测试 — 复用 tests/api/v1/ai/conftest.py 的 fixtures.

pytest 会同时加载父目录 conftest, 但 sibling 目录不会自动发现 — 这里直接 re-import
所有 fixtures 让它们在本目录 scope 可用。
"""

from __future__ import annotations

# Re-export everything from sibling
from tests.api.v1.ai.conftest import (  # noqa: F401
    _ai_test_env,
    admin_org_client,
    client_role_org_client,
    counselor_org_client,
    fake_cred_id,
    fake_org_id,
    fake_user_id,
    make_credential,
    make_organization,
    mock_db,
    setup_db_results,
    sysadmin_client,
    test_app,
)
