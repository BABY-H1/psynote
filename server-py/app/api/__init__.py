"""API 路由层 (Phase 3)。

按版本号分子目录: ``v1/`` 是当前对外稳定 API。所有 router 在 ``app/main.py`` 通过
``app.include_router(...)`` 挂到 ``/api/v1`` 前缀下, 与 Node ``/api`` 路径对齐保 client/portal 0 改动。
"""
