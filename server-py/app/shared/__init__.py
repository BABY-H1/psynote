"""
psynote_shared (Python port) — 与 packages/shared (TS, 前端继续用) 双维护。

Phase 1.3 (FastAPI 迁移 Option C). 镜像 packages/shared/src/auth + types/tier。

模块布局:
    app.shared.tier         OrgTier / OrgType / Feature / has_feature / plan_to_tier
    app.shared.principal    Principal type (staff/subject/proxy)
    app.shared.roles        RoleV2 + per-OrgType 字典 + principal_of + legacy 映射
    app.shared.data_class   DataClass + ROLE_DATA_CLASS_POLICY
    app.shared.actions      Action + ROLE_ACTION_WHITELIST
    app.shared.policy       Actor / Resource / Scope / Decision / authorize() 三道权限决策

使用方 (Phase 1.4+ middleware/authorize.py)::

    from app.shared.policy import Actor, Resource, Scope, authorize
    decision = authorize(actor, "view", resource, scope)
    if not decision.allowed:
        raise PermissionError(decision.reason)
"""
