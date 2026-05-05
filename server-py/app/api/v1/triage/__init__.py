"""Triage API — 镜像 ``server/src/modules/triage/`` (4 文件 ~1213 行).

Routers (由 ``app/main.py`` 注册):
  - ``router`` — ``/api/orgs/{org_id}/triage``
      研判分流 query 层 (``GET /candidates`` master list, ``GET /buckets`` L1-L4 计数,
      ``PATCH /results/{result_id}/risk-level`` AI 等级 override, ``POST /results/{result_id}/candidate``
      lazy-create candidate 行).

Services (不暴露 router):
  - ``queries_service.list_triage_candidates`` — 主查询 (含 mode='screening'|'manual'|'all')
  - ``queries_service.list_triage_buckets`` — L1-L4 + unrated count 聚合
  - ``queries_service.list_candidates_for_service`` — 反查"哪些候选目标是这个团辅/课程实例"
  - ``queries_service.update_result_risk_level`` — admin 手工调整 AI 等级
  - ``queries_service.lazy_create_candidate`` — Phase H BUG-007 修复, result→candidate

注意: 与 ``app/api/v1/assessment/triage_automation_service.py`` (Tier 2) 协作但职责不同:
  - ``triage_automation_service``: 测评提交时**写**入候选 (写路径).
  - 本模块 ``triage`` queries_service: admin / counselor **读**研判候选列表 + 处理 (读路径 +
    UI 触发的"懒创建"路径).
"""

from app.api.v1.triage.router import router

__all__ = ["router"]
