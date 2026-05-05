"""Referral API — 镜像 ``server/src/modules/referral/`` (4 文件 ~700 行).

Routers:
  - ``router``         /api/orgs/{org_id}/referrals (auth + orgContext)
  - ``public_router``  /api/public/referrals (无 auth, 一次性下载链)

W2.9 安全修复重点 — referral token 单次失效:
  - ``download_token`` 一次性: 第一次 ``GET /download/{token}`` 通过校验后,
    在 ``resolve_data_package`` 之前 nullify token。后续同 URL → 404。
  - 见 ``service.get_by_download_token``。

Phase 9δ 关键概念:
  - mode: 'platform' (站内转介) vs 'external' (生成下载链, 线下交接)
  - 双向流: sender 选数据包 (notes/assessments/plans) → client 同意 → receiver 接受/拒绝
"""

from app.api.v1.referral.public_router import router as public_router
from app.api.v1.referral.router import router

__all__ = ["public_router", "router"]
