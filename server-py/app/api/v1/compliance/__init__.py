"""Compliance API — 镜像 ``server/src/modules/compliance/`` (4 文件 ~518 行).

Routers:
  - ``review_router``  /api/orgs/{org_id}/compliance — 合规复核 CRUD
  - ``consent_router`` /api/orgs/{org_id} — 同意书模板 + 文书 (consent-templates + consent-documents)

业务范围:
  1. ``compliance-review`` — note 合规度 / golden_thread / 治疗质量 (AI 自动跑)
  2. ``consent`` — 同意书模板 + 客户签署 + consent_records (含 Phase 14 代签 signer_on_behalf_of)
"""

from app.api.v1.compliance.consent_router import router as consent_router
from app.api.v1.compliance.review_router import router as review_router

__all__ = ["consent_router", "review_router"]
