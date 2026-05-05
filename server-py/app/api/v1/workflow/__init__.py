"""Workflow API — 镜像 ``server/src/modules/workflow/`` (2 文件 ~890 行).

Routers (由 ``app/main.py`` 分别 include — 本模块 NOT 注册):
  - ``router`` — ``/api/orgs/{org_id}/workflow``
      rule CRUD (``GET/POST/PATCH/DELETE /rules``) + assessment-scoped rule sync
      (``PUT /rules/by-assessment/{aid}``) + execution log (``GET /executions``) +
      candidate pool 操作 (``GET /candidates``, ``POST /candidates/{id}/accept``,
      ``POST /candidates/{id}/dismiss``).

Services (不暴露 router):
  - ``rule_engine_service.run_rules_for_event`` — 事件驱动规则引擎入口
    (load active rules + evaluate conditions + execute actions).

Phase 12 MVP: 仅支持 ``trigger_event='assessment_result.created'``.

设计原则:
  - 规则引擎与 Tier 2 ``triage_automation_service`` 是协作关系而非重复:
    - ``triage_automation_service`` (Tier 2): 测评提交后无规则也保底跑的"硬"自动研判
      (level_3+ 通知, level_4 写危机候选). 这是合规底线.
    - ``rule_engine_service`` (本模块): 机构可选的"软"事件驱动框架, 跑用户配置规则.
  - 所有外部动作 (除 ``assign_course`` 外) 一律走 ``candidate_pool``, 由咨询师在 UI
    决定是否执行. 这是合规 + 责任边界硬要求.
"""

from app.api.v1.workflow.router import router

__all__ = ["router"]
